import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import idl from '../idl/sol_vest_backend.json';

const PROGRAM_ID = new PublicKey("5hFs3AJwBVw4W8XjKTKKDUHsth3ZWGtYSDYdvknqzJpZ");
// Убедитесь, что USDC_MINT актуален
const USDC_MINT = new PublicKey("77u3giVhJjgPM9kEESGxJmRmpzvGLxeALHnMMtsaxqrT");

export interface MilestoneInput {
    name: string;
    description: string;
    amount: number;
    duration: number;
}

interface CreateCampaignArgs {
    name: string; // <--- Новое поле
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
        
        const provider = new AnchorProvider(
            connection, 
            wallet, 
            { commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: true }
        );

        // Фикс для импорта JSON в Vite (если объект обернут в default)
        const idlObject = (idl as any).default ? (idl as any).default : idl;
        
        return new Program(idlObject, provider);
    }, [connection, wallet]);

    const campaignsQuery = useQuery({
        queryKey: ['campaigns'],
        queryFn: async () => {
            if (!program) return [];
            return await program.account.campaign.all();
        },
        enabled: !!program,
        refetchInterval: 5000,
    });

    const createCampaignMutation = useMutation({
        mutationFn: async ({ name, goal, milestones, fundraisingDuration }: CreateCampaignArgs) => {
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

            console.log("Starting createCampaign transaction...");

            // --- ОБЯЗАТЕЛЬНО ДЛЯ БОЛЬШИХ ДАННЫХ (строк) ---
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
                units: 1_000_000 // Увеличиваем лимит, чтобы избежать out of memory
            });

            // Опционально: Приоритетная комиссия
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                microLamports: 1000 
            });

            const tx = await program.methods
                .createCampaign(
                    name, // <--- Передаем динамическое имя
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
                .preInstructions([modifyComputeUnits, addPriorityFee]) // <--- Раскомментировано
                .signers([campaignKeypair])
                .rpc();
            
            console.log("Transaction signature:", tx);
            
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

            console.log("🚀 Starting Investment...");

            const amountBn = new BN(amount * 1_000_000);

            // 1. Старые PDA (Vault, Contribution)
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKey.toBuffer()],
                PROGRAM_ID
            );

            const [contributionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("contribution"), campaignKey.toBuffer(), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const investorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                wallet.publicKey
            );

            // --- НОВАЯ ЛОГИКА ДЛЯ НОВЫХ АККАУНТОВ ---

            // 2. Находим PDA протокола
            const [protocolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("protocol")],
                PROGRAM_ID
            );

            // 3. Скачиваем данные Протокола, чтобы узнать fee_destination
            // (Если протокол не инициализирован, это упадет с ошибкой "Account does not exist")
            const protocolData = await program.account.protocol.fetch(protocolPda);
            const feeDestination = protocolData.feeDestination;

            // 4. Скачиваем данные Кампании, чтобы узнать кто Creator
            const campaignData = await program.account.campaign.fetch(campaignKey);
            const creatorKey = campaignData.creator;

            // 5. Находим токен-аккаунт (ATA) Создателя
            const creatorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                creatorKey
            );

            console.log("Investment details:", {
                protocol: protocolPda.toString(),
                feeDest: feeDestination.toString(),
                creatorATA: creatorTokenAccount.toString()
            });

            // Добавляем Compute Units
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

            const tx = await program.methods
                .invest(amountBn)
                .accounts({
                    campaign: campaignKey,
                    vault: vaultPda,
                    contribution: contributionPda,
                    investor: wallet.publicKey,
                    investorTokenAccount: investorTokenAccount,
                    // --- НОВЫЕ АККАУНТЫ (CamelCase как требует Anchor) ---
                    protocol: protocolPda,
                    creatorTokenAccount: creatorTokenAccount,
                    feeDestination: feeDestination,
                    // ----------------------------------------------------
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .preInstructions([modifyComputeUnits])
                .rpc();

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

    const submitMilestoneMutation = useMutation({
        mutationFn: async ({ campaignKey, evidence }: { campaignKey: PublicKey, evidence: string }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            console.log("Submitting milestone with evidence:", evidence);

            const tx = await program.methods
                .submitMilestone(evidence) // <--- Передаем строку доказательства
                .accounts({
                    campaign: campaignKey,
                    creator: wallet.publicKey,
                })
                .rpc();
            
            await connection.confirmTransaction(tx, 'confirmed');
            return tx;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    });

    const voteMutation = useMutation({
        mutationFn: async ({ campaignKey, voteFor, milestoneIdx }: { campaignKey: PublicKey, voteFor: boolean, milestoneIdx: number }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            const [contributionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("contribution"), campaignKey.toBuffer(), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // Правильная генерация PDA для u8
            const [voteRecordPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("vote"),             // 1. Исправлено с "vote_record" на "vote"
                    campaignKey.toBuffer(),          // 2. Campaign Key
                    wallet.publicKey.toBuffer(),     // 3. Voter Key (поменяли местами)
                    Buffer.from([milestoneIdx])      // 4. Milestone Index (u8, в конце)
                ],
                PROGRAM_ID
            );

            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });

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

    const finalizeMilestoneMutation = useMutation({
        mutationFn: async ({ campaignKey, creatorKey }: { campaignKey: PublicKey, creatorKey: PublicKey }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            console.log("🏁 Finalizing milestone...");

            // 1. Находим PDA протокола (там хранятся настройки и адрес для комиссии)
            const [protocolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("protocol")],
                PROGRAM_ID
            );

            // 2. Находим PDA Vault кампании
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKey.toBuffer()],
                PROGRAM_ID
            );

            // 3. Получаем данные аккаунта Протокола, чтобы узнать fee_destination
            const protocolAccount = await program.account.protocol.fetch(protocolPda);
            const feeDestination = protocolAccount.feeDestination;

            // 4. Находим ATA Создателя (куда отправлять USDC, если этап принят)
            const creatorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                creatorKey
            );

            // 5. Вызываем метод
            const tx = await program.methods
                .finalizeMilestone()
                .accounts({
                    protocol: protocolPda,
                    campaign: campaignKey,
                    vault: vaultPda,
                    caller: wallet.publicKey, // Тот, кто нажимает кнопку (любой юзер)
                    creator: creatorKey,      // Создатель проекта
                    creatorTokenAccount: creatorTokenAccount, // ATA создателя
                    feeDestination: feeDestination, // Кошелек админа протокола
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

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

    const claimRefundMutation = useMutation({
        mutationFn: async ({ campaignKey }: { campaignKey: PublicKey }) => {
            if (!program || !wallet) throw new Error("Кошелек не подключен");

            console.log("💸 Claiming refund...");

            // 1. PDA Vault (откуда забираем)
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKey.toBuffer()],
                PROGRAM_ID
            );

            // 2. PDA Contribution (сколько нам должны)
            const [contributionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("contribution"), campaignKey.toBuffer(), wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // 3. ATA Инвестора (куда отправляем)
            const investorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                wallet.publicKey
            );

            const tx = await program.methods
                .claimRefund()
                .accounts({
                    campaign: campaignKey,
                    vault: vaultPda,
                    contribution: contributionPda, // При вызове этот аккаунт закроется, а рент вернется юзеру
                    investor: wallet.publicKey,
                    investorTokenAccount: investorTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            await connection.confirmTransaction(tx, 'confirmed');
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

        finalizeMilestone: finalizeMilestoneMutation.mutateAsync,
        isFinalizing: finalizeMilestoneMutation.isPending,

        claimRefund: claimRefundMutation.mutateAsync,
        isRefunding: claimRefundMutation.isPending,

        error: campaignsQuery.error || createCampaignMutation.error
    };
};