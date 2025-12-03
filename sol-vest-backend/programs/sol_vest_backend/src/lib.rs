use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("5hFs3AJwBVw4W8XjKTKKDUHsth3ZWGtYSDYdvknqzJpZ");

const VOTING_PERIOD_SECONDS: i64 = 300;

#[program]
pub mod sol_vest_backend {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, protocol_fee: u16) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.owner = *ctx.accounts.owner.key;
        protocol.paused = false;
        protocol.protocol_fee_basis_points = protocol_fee; 
        protocol.fee_destination = ctx.accounts.fee_destination.key();
        Ok(())
    }

    pub fn create_campaign(
        ctx: Context<CreateCampaign>, 
        name: String,                   
        total_goal: u64,
        milestones: Vec<MilestoneInput>, 
        fundraising_duration: i64,       
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let clock = Clock::get()?;

        require!(name.len() <= 50, CampaignError::StringTooLong);
        let sum: u64 = milestones.iter().map(|m| m.goal_amount).sum();
        require!(sum == total_goal, CampaignError::MilestoneSumMismatch);

        for m in &milestones {
            require!(m.name.len() <= 50, CampaignError::StringTooLong);
            require!(m.description.len() <= 200, CampaignError::StringTooLong);
        }

        campaign.name = name; 
        campaign.creator = *ctx.accounts.creator.key;
        campaign.usdc_mint = ctx.accounts.usdc_mint.key();
        campaign.total_goal = total_goal;
        campaign.raised_amount = 0;
        campaign.state = CampaignState::Funding;
        campaign.milestone_idx = 0;
        campaign.voting_duration = VOTING_PERIOD_SECONDS; 
        
        campaign.deadline = clock.unix_timestamp + fundraising_duration;
        campaign.current_milestone_deadline = 0; 

        campaign.milestones = milestones.into_iter().map(|m| Milestone {
            name: m.name,
            description: m.description,
            goal_amount: m.goal_amount,
            duration: m.duration,
            state: MilestoneState::Pending,
            votes_for: 0,
            votes_against: 0,
            vote_deadline: 0,
            evidence: "".to_string(), 
        }).collect();

        Ok(())
    }


    pub fn invest(ctx: Context<Invest>, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        require!(campaign.state == CampaignState::Funding, CampaignError::CampaignNotActive);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < campaign.deadline, CampaignError::DeadlineExceeded);

        let cpi_accounts = Transfer {
            from: ctx.accounts.investor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), 
            amount
        )?;

        campaign.raised_amount += amount;

        let contribution = &mut ctx.accounts.contribution;
        contribution.investor = *ctx.accounts.investor.key;
        contribution.campaign = campaign.key();
        contribution.amount += amount;

        if campaign.raised_amount >= campaign.total_goal {
            campaign.state = CampaignState::Active;
            

            if !campaign.milestones.is_empty() {
                campaign.current_milestone_deadline = clock.unix_timestamp + campaign.milestones[0].duration;
                
                let amount_to_release = campaign.milestones[0].goal_amount;
                let fee_bps = ctx.accounts.protocol.protocol_fee_basis_points as u128;
                
                perform_payout(
                    amount_to_release,
                    fee_bps,
                    &campaign.to_account_info(),
                    &ctx.accounts.vault,
                    &ctx.accounts.creator_token_account,
                    &ctx.accounts.fee_destination,
                    &ctx.accounts.token_program,
                    ctx.bumps.vault
                )?;
            }
        }

        Ok(())
    }

    pub fn submit_milestone(ctx: Context<ManageMilestone>, evidence: String) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;
        
        require!(campaign.state == CampaignState::Active, CampaignError::CampaignNotActive);
        require!(campaign.milestones[idx].state == MilestoneState::Pending, CampaignError::MilestoneNotPending);
        require!(evidence.len() <= 200, CampaignError::StringTooLong);

        let clock = Clock::get()?;
        
        if ctx.accounts.signer.key() == campaign.creator {
            require!(clock.unix_timestamp < campaign.current_milestone_deadline, CampaignError::MilestoneExpired);
            campaign.milestones[idx].evidence = evidence;
        } else {
            require!(clock.unix_timestamp >= campaign.current_milestone_deadline, CampaignError::DeadlineNotPassed);
            campaign.milestones[idx].evidence = "DEADLINE MISSED: Force started by investor".to_string();
        }

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < campaign.current_milestone_deadline, CampaignError::MilestoneExpired);

        campaign.milestones[idx].state = MilestoneState::Voting;
        campaign.milestones[idx].vote_deadline = clock.unix_timestamp + campaign.voting_duration;

        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, vote_for: bool) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;

        require!(campaign.milestones[idx].state == MilestoneState::Voting, CampaignError::MilestoneNotVoting);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < campaign.milestones[idx].vote_deadline, CampaignError::VotingEnded);

        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = *ctx.accounts.voter.key;
        vote_record.campaign = campaign.key();
        vote_record.milestone_idx = campaign.milestone_idx;
        
        let weight = ctx.accounts.contribution.amount;
        require!(weight > 0, CampaignError::NoContribution);
        
        if vote_for {
            campaign.milestones[idx].votes_for += weight;
        } else {
            campaign.milestones[idx].votes_against += weight;
        }
        
        Ok(())
    }

    pub fn finalize_milestone(ctx: Context<WithdrawFunds>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;

        require!(campaign.milestones[idx].state == MilestoneState::Voting, CampaignError::MilestoneNotVoting);
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= campaign.milestones[idx].vote_deadline, CampaignError::VotingNotEnded);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= campaign.milestones[idx].vote_deadline, CampaignError::VotingNotEnded);

        let m = &campaign.milestones[idx];
        let total_votes = m.votes_for + m.votes_against;
        
        let quorum = campaign.raised_amount / 10; 
        if total_votes < quorum {
             campaign.state = CampaignState::Failed;
             return Ok(());
        }
        
        if m.votes_for > m.votes_against {
            campaign.milestones[idx].state = MilestoneState::Completed;
            
            
            campaign.milestone_idx += 1;
            let next_idx = campaign.milestone_idx as usize;

            if next_idx < campaign.milestones.len() {
                let next_duration = campaign.milestones[next_idx].duration;
                campaign.current_milestone_deadline = clock.unix_timestamp + next_duration;

                let amount_to_release = campaign.milestones[next_idx].goal_amount;
                let fee_bps = ctx.accounts.protocol.protocol_fee_basis_points as u128;

                perform_payout(
                    amount_to_release,
                    fee_bps,
                    &campaign.to_account_info(),
                    &ctx.accounts.vault,
                    &ctx.accounts.creator_token_account,
                    &ctx.accounts.fee_destination,
                    &ctx.accounts.token_program,
                    ctx.bumps.vault
                )?;

            } else {
                campaign.state = CampaignState::Completed;
            }

        } else {
            campaign.state = CampaignState::Failed;
        }

        Ok(())
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let clock = Clock::get()?;
        
        let is_fundraising_expired = campaign.state == CampaignState::Funding && clock.unix_timestamp > campaign.deadline;
        let is_failed_state = campaign.state == CampaignState::Failed;

        require!(is_fundraising_expired || is_failed_state, CampaignError::RefundNotAvailable);

        if campaign.state != CampaignState::Failed {
            campaign.state = CampaignState::Failed;
        }

        let contribution = &mut ctx.accounts.contribution;
        require!(contribution.amount > 0, CampaignError::NoContribution);

        let vault_balance = ctx.accounts.vault.amount;
        let total_raised = campaign.raised_amount;

        if total_raised == 0 {
             return Err(CampaignError::NoContribution.into());
        }

        let refund_amount = (contribution.amount as u128)
            .checked_mul(vault_balance as u128).unwrap()
            .checked_div(total_raised as u128).unwrap() as u64;

        let seeds = &[
            b"vault",
            campaign.to_account_info().key.as_ref(),
            &[ctx.bumps.vault] 
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.investor_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer), 
            refund_amount
        )?;

        contribution.amount = 0;

        Ok(())
    }
}

fn perform_payout<'info>(
    amount: u64,
    fee_bps: u128,
    campaign_info: &AccountInfo<'info>,
    vault: &Account<'info, TokenAccount>,
    creator_token: &Account<'info, TokenAccount>,
    fee_dest: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    vault_bump: u8,
) -> Result<()> {
    let fee = (amount as u128 * fee_bps / 10000) as u64;
    let creator_amount = amount - fee;

    let seeds = &[
        b"vault",
        campaign_info.key.as_ref(),
        &[vault_bump] 
    ];
    let signer = &[&seeds[..]];

    if fee > 0 {
        let cpi_accounts_fee = Transfer {
            from: vault.to_account_info(),
            to: fee_dest.to_account_info(),
            authority: vault.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts_fee, signer), 
            fee
        )?;
    }
    
    let cpi_accounts_creator = Transfer {
        from: vault.to_account_info(),
        to: creator_token.to_account_info(),
        authority: vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts_creator, signer), 
        creator_amount
    )?;

    Ok(())
}


#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 1 + 2 + 32, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Адрес для сбора комиссий
    pub fee_destination: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(init, payer = creator, space = 9000)]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init, 
        payer = creator, 
        token::mint = usdc_mint, 
        token::authority = vault, 
        seeds = [b"vault", campaign.key().as_ref()], 
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Invest<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [b"vault", campaign.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed, 
        payer = investor, 
        space = 8 + 32 + 32 + 8,
        seeds = [b"contribution", campaign.key().as_ref(), investor.key().as_ref()], 
        bump
    )]
    pub contribution: Account<'info, Contribution>,
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut)]
    pub investor_token_account: Account<'info, TokenAccount>,
    
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: Кошелек создателя для получения средств (проверяем соответствие кампании)
    #[account(mut, constraint = creator_token_account.owner == campaign.creator)]
    pub creator_token_account: Account<'info, TokenAccount>,
    /// CHECK: Кошелек для комиссий (проверяем соответствие протоколу)
    #[account(mut, constraint = fee_destination.key() == protocol.fee_destination)]
    pub fee_destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageMilestone<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(seeds = [b"contribution", campaign.key().as_ref(), voter.key().as_ref()], bump)]
    pub contribution: Account<'info, Contribution>,
    #[account(
        init, 
        payer = voter, 
        space = 8 + 32 + 32 + 1,
        seeds = [b"vote", campaign.key().as_ref(), voter.key().as_ref(), &[campaign.milestone_idx]], 
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [b"vault", campaign.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub caller: Signer<'info>, 
    /// CHECK: Проверка keys делается через constraint в Transfer
    #[account(mut, constraint = creator.key() == campaign.creator)]
    pub creator: UncheckedAccount<'info>, 
    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = protocol.fee_destination)]
    pub fee_destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [b"vault", campaign.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [b"contribution", campaign.key().as_ref(), investor.key().as_ref()], 
        bump
    )]
    pub contribution: Account<'info, Contribution>,
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut)]
    pub investor_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Protocol {
    pub owner: Pubkey,
    pub paused: bool,
    pub protocol_fee_basis_points: u16,
    pub fee_destination: Pubkey,
}

#[account]
pub struct Campaign {
    pub name: String,
    pub creator: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_goal: u64,
    pub raised_amount: u64,
    pub state: CampaignState,
    pub milestone_idx: u8,
    pub milestones: Vec<Milestone>,
    pub deadline: i64, 
    pub voting_duration: i64, 
    pub current_milestone_deadline: i64, 
}

#[account]
pub struct Contribution {
    pub investor: Pubkey,
    pub campaign: Pubkey,
    pub amount: u64,
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub campaign: Pubkey,
    pub milestone_idx: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct Milestone {
    pub name: String,
    pub description: String,
    pub goal_amount: u64,
    pub duration: i64, 
    pub state: MilestoneState,
    pub votes_for: u64,
    pub votes_against: u64,
    pub vote_deadline: i64,
    pub evidence: String, 
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct MilestoneInput {
    pub name: String,
    pub description: String,
    pub goal_amount: u64,
    pub duration: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CampaignState { Funding, Active, Failed, Completed }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MilestoneState { Pending, Voting, Completed }

#[error_code]
pub enum CampaignError {
    #[msg("Sum of milestones does not match total goal.")] MilestoneSumMismatch,
    #[msg("Campaign is not active.")] CampaignNotActive,
    #[msg("Milestone is not pending.")] MilestoneNotPending,
    #[msg("Milestone is not voting.")] MilestoneNotVoting,
    #[msg("Deadline exceeded.")] DeadlineExceeded,
    #[msg("You have no contribution.")] NoContribution,
    #[msg("Refund is not available yet.")] RefundNotAvailable,
    #[msg("Voting period has ended.")] VotingEnded, 
    #[msg("Voting period has not ended yet.")] VotingNotEnded, 
    #[msg("String too long.")] StringTooLong,
    #[msg("Milestone deadline passed.")] MilestoneExpired, 
    #[msg("Milestone deadline has not passed yet.")] DeadlineNotPassed, 
}