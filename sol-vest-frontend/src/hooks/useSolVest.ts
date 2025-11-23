import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
// Убедитесь, что путь к файлу верный
import idl from '../idl/sol_vest_backend.json';

const PROGRAM_ID = new PublicKey("G4nTun1PpGPed7qGkchBGFf4LJkYohExFCaDVeBVZEen");
const USDC_MINT = new PublicKey("ALPX3kHJEYVLyzrPyYrWYS38kFXoYzh1ZgT21FqvQfa");

// Интерфейс для входных данных этапа (упрощенный для UI)
export interface MilestoneInput {
    name: string;
    description: string;
    amount: number; // В USDC (не в минимальных единицах)
    duration: number; // В секундах (или днях, см. логику конвертации ниже)
}

interface CreateCampaignArgs {
    goal: number;
    milestones: MilestoneInput[];
    fundraisingDuration: number; // В секундах
}

export const useSolVest = () => {
    const wallet = useAnchorWallet();
    const { connection } = useConnection();
    const queryClient = useQueryClient();

    // 1. Инициализация программы с фиксом для Vite
    const program = useMemo(() => {
        if (!wallet) return null;
        
        const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
        

        return new Program(idl, provider);
    }, [connection, wallet]);

    // 2. Query: Получение всех кампаний
    const campaignsQuery = useQuery({
        queryKey: ['campaigns'],
        queryFn: async () => {
            if (!program) return [];
            return await program.account.campaign.all();
        },
        enabled: !!program,
        refetchInterval: 5000,
    });

    // 3. Mutation: Создание кампании
    const createCampaignMutation = useMutation({
        mutationFn: async ({ goal, milestones, fundraisingDuration }: CreateCampaignArgs) => {
            if (!program || !wallet) throw new Error("Wallet not connected");

            const campaignKeypair = web3.Keypair.generate();
            
            // Находим PDA для Vault
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // --- Подготовка данных ---
            
            // 1. Общая цель (u64)
            const totalGoalBn = new BN(goal * 1_000_000); // USDC 6 decimals

            // 2. Вектор этапов (Vec<MilestoneInput>)
            // В IDL: name(string), description(string), goal_amount(u64), duration(i64)
            const milestonesVec = milestones.map(m => ({
                name: m.name,
                description: m.description,
                goalAmount: new BN(m.amount * 1_000_000), // convert to atomic units
                duration: new BN(m.duration) // Seconds
            }));

            // 3. Длительность сбора средств (i64)
            const fundraisingDurationBn = new BN(fundraisingDuration);

            console.log("Creating Campaign:", {
                pubkey: campaignKeypair.publicKey.toString(),
                goal: totalGoalBn.toString(),
                milestonesCount: milestonesVec.length,
                duration: fundraisingDurationBn.toString()
            });

            // Вызов метода контракта
            // Аргументы строго по IDL: total_goal, milestones, fundraising_duration
            const tx = await program.methods
                .createCampaign(
                    totalGoalBn, 
                    milestonesVec, 
                    fundraisingDurationBn
                )
                .accounts({
                    // Имена аккаунтов (Anchor преобразует snake_case из IDL в camelCase)
                    campaign: campaignKeypair.publicKey,
                    vault: vaultPda,
                    usdcMint: USDC_MINT,     // IDL: usdc_mint
                    creator: wallet.publicKey,
                    systemProgram: SystemProgram.programId, // IDL: system_program
                    tokenProgram: TOKEN_PROGRAM_ID,         // IDL: token_program
                    rent: web3.SYSVAR_RENT_PUBKEY,          // IDL: rent
                })
                .signers([campaignKeypair])
                .rpc();
            
            return tx;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        },
    });

    return {
        program,
        campaigns: campaignsQuery.data || [],
        isLoading: campaignsQuery.isLoading,
        createCampaign: createCampaignMutation.mutateAsync,
        isCreating: createCampaignMutation.isPending,
        error: campaignsQuery.error || createCampaignMutation.error
    };
};