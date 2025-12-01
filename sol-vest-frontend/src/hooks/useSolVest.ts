import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js'; // <--- Добавлен ComputeBudgetProgram
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import idl from '../idl/sol_vest_backend.json';

// Убедитесь, что ID программы совпадает с тем, что в lib.rs и Anchor.toml
const PROGRAM_ID = new PublicKey("G4nTun1PpGPed7qGkchBGFf4LJkYohExFCaDVeBVZEen");

// Убедитесь, что этот минт существует в вашей сети (Localhost/Devnet)
const USDC_MINT = new PublicKey("77u3giVhJjgPM9kEESGxJmRmpzvGLxeALHnMMtsaxqrT");

export interface MilestoneInput {
    name: string;
    description: string;
    amount: number;
    duration: number;
}

interface CreateCampaignArgs {
    goal: number;
    milestones: MilestoneInput[];
    fundraisingDuration: number;
}

export const useSolVest = () => {
    const wallet = useAnchorWallet();
    const { connection } = useConnection();
    const queryClient = useQueryClient();

    const program = useMemo(() => {
        if (!wallet) return null;
        
        // Используем confirmed для более быстрой реакции UI, хотя finalized надежнее
        const provider = new AnchorProvider(
            connection, 
            wallet, 
            { commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: true }
        );

        return new Program(idl, provider);
    }, [connection, wallet]);

    const campaignsQuery = useQuery({
        queryKey: ['campaigns'],
        queryFn: async () => {
            if (!program) return [];
            // Иногда .all() может быть тяжелым, но для списка проектов ок
            return await program.account.campaign.all();
        },
        enabled: !!program,
        refetchInterval: 5000,
    });

    const createCampaignMutation = useMutation({
        mutationFn: async ({ goal, milestones, fundraisingDuration }: CreateCampaignArgs) => {
            if (!program || !wallet) throw new Error("Wallet not connected");

            const campaignKeypair = web3.Keypair.generate();
            
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const totalGoalBn = new BN(goal * 1_000_000);

            const milestonesVec = milestones.map(m => ({
                name: m.name,
                description: m.description,
                goalAmount: new BN(m.amount * 1_000_000),
                duration: new BN(m.duration)
            }));

            const fundraisingDurationBn = new BN(fundraisingDuration);

            console.log("Starting transaction...");

            // --- ВАЖНОЕ ИСПРАВЛЕНИЕ ---
            // 1. Увеличиваем лимит вычислений (Compute Units)
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
                units: 1_000_000 // Ставим с запасом (дефолт 200k)
            });

            // 2. Добавляем приоритетную комиссию (Priority Fee), чтобы валидатор обработал быстрее
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                microLamports: 1000 
            });

            const tx = await program.methods
                .createCampaign(
                    totalGoalBn, 
                    milestonesVec, 
                    fundraisingDurationBn
                )
                .accounts({
                    campaign: campaignKeypair.publicKey,
                    vault: vaultPda,
                    usdcMint: USDC_MINT,
                    creator: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: web3.SYSVAR_RENT_PUBKEY,
                })
                // Вставляем инструкции по газу ПЕРЕД основной инструкцией
                .preInstructions([modifyComputeUnits, addPriorityFee]) 
                .signers([campaignKeypair])
                .rpc(); // .rpc() автоматически отправляет и ждет подтверждения
            
            console.log("Transaction signature:", tx);
            
            // Дополнительное ожидание для надежности (опционально, т.к. rpc уже ждет)
            const latestBlockhash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                signature: tx,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, 'confirmed');

            return tx;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        },
    });

    const investMutation = useMutation({
        mutationFn: async ({ campaignKey, amount }: { campaignKey: PublicKey; amount: number }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            // 1. Конвертация суммы (USDC имеет 6 знаков)
            const amountBn = new BN(amount * 1_000_000);

            // 2. Находим PDA Vault (куда пойдут деньги)
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKey.toBuffer()],
                PROGRAM_ID
            );

            // 3. Находим PDA Contribution (запись о вкладе инвестора)
            // Seeds: ["contribution", campaign, investor]
            const [contributionPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("contribution"),
                    campaignKey.toBuffer(),
                    wallet.publicKey.toBuffer()
                ],
                PROGRAM_ID
            );

            // 4. Находим кошелек токенов USDC самого инвестора (Source)
            const investorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                wallet.publicKey
            );

            console.log("Investing:", {
                amount: amount,
                campaign: campaignKey.toString(),
                investorATA: investorTokenAccount.toString()
            });

            // 5. Формируем транзакци

            const tx = await program.methods
                .invest(amountBn)
                .accounts({
                    campaign: campaignKey,
                    vault: vaultPda,
                    contribution: contributionPda, // Anchor сам создаст этот аккаунт (init)
                    investor: wallet.publicKey,
                    investorTokenAccount: investorTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            // Ждем подтверждения
            const latestBlockhash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                signature: tx,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, 'confirmed');

            return tx;
        },
        onSuccess: () => {
            // Обновляем данные на странице
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        },
    });

    // 5. Mutation: Сдача этапа (Запуск голосования)
    const submitMilestoneMutation = useMutation({
        mutationFn: async ({ campaignKey }: { campaignKey: PublicKey }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            console.log("Submitting milestone for:", campaignKey.toString());

            const tx = await program.methods
                .submitMilestone()
                .accounts({
                    campaign: campaignKey,
                    // В IDL может называться 'authority' или 'creator', 
                    // но по логике вызывает тот, кто подписывает (автор или инвестор)
                    creator: wallet.publicKey, 
                })
                .rpc();
            
            await connection.confirmTransaction(tx, 'confirmed');
            return tx;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    });

    // 6. Mutation: Голосование (Vote)
    const voteMutation = useMutation({
        mutationFn: async ({ campaignKey, voteFor, milestoneIdx }: { campaignKey: PublicKey, voteFor: boolean, milestoneIdx: number }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            // 1. PDA Contribution: ["contribution", campaign, voter]
            const [contributionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("contribution"), campaignKey.toBuffer(), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // 2. PDA VoteRecord: ["vote", campaign, voter, milestone_idx]
            // Порядок seeds исправлен в соответствии с вашим Rust-контрактом
            const [voteRecordPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("vote"),
                    campaignKey.toBuffer(),
                    wallet.publicKey.toBuffer(),
                    Buffer.from([milestoneIdx]) // u8 передается как массив из 1 байта
                ],
                PROGRAM_ID
            );

            // 3. Увеличиваем лимит газа для стабильности
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });

            // 4. Выполняем транзакцию
            const tx = await program.methods
                .vote(voteFor)
                .accounts({
                    campaign: campaignKey,
                    contribution: contributionPda,
                    voteRecord: voteRecordPda,
                    voter: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .preInstructions([modifyComputeUnits])
                .rpc();

            // 5. Ждем подтверждения
            const latestBlockhash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                signature: tx,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, 'confirmed');

            return tx;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        }
    });

    return {
        program,
        campaigns: campaignsQuery.data || [],
        isLoading: campaignsQuery.isLoading,

        createCampaign: createCampaignMutation.mutateAsync,
        isCreating: createCampaignMutation.isPending,
        
        invest: investMutation.mutateAsync,
        isInvesting: investMutation.isPending,
        
        submitMilestone: submitMilestoneMutation.mutateAsync,
        isSubmitting: submitMilestoneMutation.isPending,
        
        vote: voteMutation.mutateAsync,
        isVoting: voteMutation.isPending,

        error: campaignsQuery.error || createCampaignMutation.error
    };
};