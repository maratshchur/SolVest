import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import idl from '../idl/sol_vest_backend.json';

const PROGRAM_ID = new PublicKey("5hFs3AJwBVw4W8XjKTKKDUHsth3ZWGtYSDYdvknqzJpZ");
const USDC_MINT = new PublicKey("8yxM88Sn4z7xwJJ5brodvSXEumLEgNbAcxkMcGBdxxM3");

export interface MilestoneInput {
    name: string;
    description: string;
    amount: number;
    duration: number;
}

interface CreateCampaignArgs {
    name: string;
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

            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
                units: 1_000_000
            });

            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                microLamports: 1000 
            });

            const tx = await program.methods
                .createCampaign(
                    name,
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
                .preInstructions([modifyComputeUnits, addPriorityFee])
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

            const [protocolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("protocol")],
                PROGRAM_ID
            );

            const protocolData = await program.account.protocol.fetch(protocolPda);
            const feeDestination = protocolData.feeDestination;

            const campaignData = await program.account.campaign.fetch(campaignKey);
            const creatorKey = campaignData.creator;

            const creatorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                creatorKey
            );

            console.log("Investment details:", {
                protocol: protocolPda.toString(),
                feeDest: feeDestination.toString(),
                creatorATA: creatorTokenAccount.toString()
            });

            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

            const tx = await program.methods
                .invest(amountBn)
                .accounts({
                    campaign: campaignKey,
                    vault: vaultPda,
                    contribution: contributionPda,
                    investor: wallet.publicKey,
                    investorTokenAccount: investorTokenAccount,
                    protocol: protocolPda,
                    creatorTokenAccount: creatorTokenAccount,
                    feeDestination: feeDestination,
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
                .submitMilestone(evidence)
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

            const [voteRecordPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("vote"),            
                    campaignKey.toBuffer(),         
                    wallet.publicKey.toBuffer(),    
                    Buffer.from([milestoneIdx])    
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

            const [protocolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("protocol")],
                PROGRAM_ID
            );

            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), campaignKey.toBuffer()],
                PROGRAM_ID
            );

            const protocolAccount = await program.account.protocol.fetch(protocolPda);
            const feeDestination = protocolAccount.feeDestination;

            const creatorTokenAccount = getAssociatedTokenAddressSync(
                USDC_MINT,
                creatorKey
            );

            const tx = await program.methods
                .finalizeMilestone()
                .accounts({
                    protocol: protocolPda,
                    campaign: campaignKey,
                    vault: vaultPda,
                    caller: wallet.publicKey, 
                    creator: creatorKey,      
                    creatorTokenAccount: creatorTokenAccount, 
                    feeDestination: feeDestination, 
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

            const tx = await program.methods
                .claimRefund()
                .accounts({
                    campaign: campaignKey,
                    vault: vaultPda,
                    contribution: contributionPda,
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