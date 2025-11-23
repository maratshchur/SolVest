// types.ts
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// Состояния проекта (как в Smart Contract)
export enum CampaignState {
    Funding = 0,
    Active = 1,
    Failed = 2,
    Completed = 3
}

// Состояния этапа
export enum MilestoneStatus {
    Pending = 0,
    Voting = 1,
    Completed = 2
}

export interface Milestone {
    amount: BN;
    duration: BN; // в секундах
    status: MilestoneStatus;
    // ... другие поля из контракта
}

export interface CampaignAccount {
    publicKey: PublicKey;
    account: {
        admin: PublicKey;
        totalGoal: BN;
        currentAmount: BN;
        state: CampaignState;
        milestones: Milestone[];
        currentMilestoneIndex: number;
        // ... другие поля
    }
}