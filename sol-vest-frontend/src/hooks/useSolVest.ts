import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import idl from '../idl/sol_vest_backend.json';

const PROGRAM_ID = new PublicKey("H14JDTx8fkS9TktMfyuuwVgr1RxoTw6C3AvDuXz1Tvq6");
const USDC_MINT = new PublicKey("FKuVSX1uDHdkvkqZ2qgFkSKQtvXfyRZRU7yywTAbYz5L");

export const useSolVest = () => {
    const wallet = useAnchorWallet();
    const { connection } = useConnection();
    const queryClient = useQueryClient();

    // 1. Инициализация программы
    const program = useMemo(() => {
        if (!wallet) return null;
        const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
        return new Program(idl, provider);
    }, [connection, wallet]);

    // 2. Query: Получение всех кампаний (Авто-обновление каждые 5 сек)
    const campaignsQuery = useQuery({
        queryKey: ['campaigns'],
        queryFn: async () => {
            if (!program) return [];
            return await program.account.campaign.all();
        },
        enabled: !!program, // Запрос идет только если кошелек подключен
        refetchInterval: 5000, // Поллинг каждые 5 секунд
    });

    // 3. Mutation: Создание кампании
    const createCampaignMutation = useMutation({
        mutationFn: async ({ goal, m1, m2 }: { goal: number; m1: number; m2: number }) => {
            if (!program || !wallet) throw new Error("Wallet not connected");

            const campaignKeypair = web3.Keypair.generate();
            const [vaultPda] = await PublicKey.findProgramAddress(
                [Buffer.from("vault"), campaignKeypair.publicKey.toBuffer()],
                PROGRAM_ID
            );

            // Конвертация в минимальные единицы (6 decimals)
            const goalBn = new BN(goal * 1_000_000);
            const m1Bn = new BN(m1 * 1_000_000);
            const m2Bn = new BN(m2 * 1_000_000);

            console.log(campaignKeypair.publicKey)
            console.log(vaultPda)
            console.log(USDC_MINT)
            console.log(wallet.publicKey)
            const duration = new BN(60 * 60 * 24 * 30); 
            const votingDuration = new BN(60 * 60 * 24); 
            const tx = await program.methods
                .createCampaign(goalBn, [{ goalAmount: m1Bn }, { goalAmount: m2Bn }], duration, votingDuration)
                .accounts({
                    campaign: campaignKeypair.publicKey,
                    vault: vaultPda,
                    usdcMint: USDC_MINT,
                    creator: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: web3.SYSVAR_RENT_PUBKEY,
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