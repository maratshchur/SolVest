use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// ЗАМЕНИТЕ НА ВАШ ID ПОСЛЕ anchor build
declare_id!("H14JDTx8fkS9TktMfyuuwVgr1RxoTw6C3AvDuXz1Tvq6");

#[program]
pub mod sol_vest_backend {
    use super::*;

    // --- АДМИНКА ---
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, protocol_fee: u16) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.owner = *ctx.accounts.owner.key;
        protocol.paused = false;
        protocol.protocol_fee_basis_points = protocol_fee; 
        protocol.fee_destination = ctx.accounts.fee_destination.key();
        Ok(())
    }

    // --- КАМПАНИИ ---
    pub fn create_campaign(
        ctx: Context<CreateCampaign>, 
        total_goal: u64,
        milestones: Vec<MilestoneInput>,
        duration_seconds: i64 // Добавили срок жизни кампании
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        let sum: u64 = milestones.iter().map(|m| m.goal_amount).sum();
        require!(sum == total_goal, CampaignError::MilestoneSumMismatch);

        let clock = Clock::get()?; // Получаем текущее время

        campaign.creator = *ctx.accounts.creator.key;
        campaign.usdc_mint = ctx.accounts.usdc_mint.key();
        campaign.total_goal = total_goal;
        campaign.raised_amount = 0;
        campaign.state = CampaignState::Funding;
        campaign.milestone_idx = 0;
        campaign.deadline = clock.unix_timestamp + duration_seconds; // Устанавливаем дедлайн
        
        campaign.milestones = milestones.into_iter().map(|m| Milestone {
            goal_amount: m.goal_amount,
            state: MilestoneState::Pending,
            votes_for: 0,
            votes_against: 0,
        }).collect();

        Ok(())
    }

    pub fn invest(ctx: Context<Invest>, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        require!(campaign.state == CampaignState::Funding, CampaignError::CampaignNotActive);
        
        // Проверка времени
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < campaign.deadline, CampaignError::DeadlineExceeded);

        // Перевод токенов (CPI)
        let cpi_accounts = Transfer {
            from: ctx.accounts.investor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;

        campaign.raised_amount += amount;

        let contribution = &mut ctx.accounts.contribution;
        contribution.investor = *ctx.accounts.investor.key;
        contribution.campaign = campaign.key();
        contribution.amount += amount;

        if campaign.raised_amount >= campaign.total_goal {
            campaign.state = CampaignState::Active;
        }

        Ok(())
    }

    // --- УПРАВЛЕНИЕ ЭТАПАМИ ---
    pub fn submit_milestone(ctx: Context<ManageMilestone>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;
        
        require!(campaign.state == CampaignState::Active, CampaignError::CampaignNotActive);
        require!(campaign.milestones[idx].state == MilestoneState::Pending, CampaignError::MilestoneNotPending);

        campaign.milestones[idx].state = MilestoneState::Voting;
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, vote_for: bool) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;

        require!(campaign.milestones[idx].state == MilestoneState::Voting, CampaignError::MilestoneNotVoting);
        
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = *ctx.accounts.voter.key;
        
        let weight = ctx.accounts.contribution.amount;
        require!(weight > 0, CampaignError::NoContribution); // Нельзя голосовать без вклада
        
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

        let m = &campaign.milestones[idx];
        let total_votes = m.votes_for + m.votes_against;
        
        // Проверка КВОРУМА: должно проголосовать хотя бы 10% от собранных средств
        let quorum = campaign.raised_amount / 10; 
        if total_votes < quorum {
             // Кворум не набран -> Провал
             campaign.state = CampaignState::Failed;
             return Ok(());
        }
        
        if m.votes_for > m.votes_against {
            // УСПЕХ
            let amount = m.goal_amount;
            let fee = (amount as u128 * ctx.accounts.protocol.protocol_fee_basis_points as u128 / 10000) as u64;
            let creator_amount = amount - fee;

            let seeds = &[
                b"vault",
                campaign.to_account_info().key.as_ref(),
                &[ctx.bumps.vault] 
            ];
            let signer = &[&seeds[..]];

            // Перевод комиссии
            let cpi_accounts_fee = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.fee_destination.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx_fee = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts_fee, signer);
            token::transfer(cpi_ctx_fee, fee)?;
            
            // Перевод создателю
            let cpi_accounts_creator = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let cpi_ctx_creator = CpiContext::new_with_signer(cpi_program, cpi_accounts_creator, signer);
            token::transfer(cpi_ctx_creator, creator_amount)?;

            campaign.milestones[idx].state = MilestoneState::Completed;
            campaign.milestone_idx += 1;
            
            if campaign.milestone_idx as usize >= campaign.milestones.len() {
                campaign.state = CampaignState::Completed;
            }

        } else {
            // ПРОВАЛ ГОЛОСОВАНИЯ
            campaign.state = CampaignState::Failed;
        }

        Ok(())
    }

    // --- НОВАЯ ФУНКЦИЯ: ВОЗВРАТ СРЕДСТВ (REFUND) ---
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        // Возврат возможен только если кампания провалена ИЛИ истек срок, а цель не достигнута
        let clock = Clock::get()?;
        let is_deadline_failed = campaign.state == CampaignState::Funding && clock.unix_timestamp > campaign.deadline;
        let is_voting_failed = campaign.state == CampaignState::Failed;

        require!(is_deadline_failed || is_voting_failed, CampaignError::RefundNotAvailable);

        // Если мы здесь, значит кампания провалена.
        // Если статус был Funding, меняем на Failed, чтобы другие тоже могли вернуть
        if campaign.state == CampaignState::Funding {
            campaign.state = CampaignState::Failed;
        }

        let contribution = &mut ctx.accounts.contribution;
        require!(contribution.amount > 0, CampaignError::NoContribution);

        // Логика расчета доли: 
        // (Твой вклад / Всего собрано) * Текущий баланс хранилища
        let vault_balance = ctx.accounts.vault.amount;
        let total_raised = campaign.raised_amount;

        // Используем u128 для точности умножения
        let refund_amount = (contribution.amount as u128)
            .checked_mul(vault_balance as u128).unwrap()
            .checked_div(total_raised as u128).unwrap() as u64;

        // Подпись Vault
        let seeds = &[
            b"vault",
            campaign.to_account_info().key.as_ref(),
            &[ctx.bumps.vault] 
        ];
        let signer = &[&seeds[..]];

        // Перевод средств инвестору
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.investor_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, refund_amount)?;

        // Обнуляем вклад, чтобы нельзя было вывести дважды
        contribution.amount = 0;

        Ok(())
    }
}

// --- СТРУКТУРЫ ДАННЫХ ---

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 1 + 2 + 32, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Это просто кошелек для приема комиссий
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
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageMilestone<'info> {
    #[account(mut, has_one = creator)]
    pub campaign: Account<'info, Campaign>,
    pub creator: Signer<'info>,
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
    #[account(mut, has_one = creator)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [b"vault", campaign.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = protocol.fee_destination)]
    pub fee_destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// НОВЫЙ КОНТЕКСТ ДЛЯ ВОЗВРАТА
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [b"vault", campaign.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut, // Изменяем contribution (обнуляем amount)
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

// --- ДАННЫЕ ---
#[account]
pub struct Protocol {
    pub owner: Pubkey,
    pub paused: bool,
    pub protocol_fee_basis_points: u16,
    pub fee_destination: Pubkey,
}

#[account]
pub struct Campaign {
    pub creator: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_goal: u64,
    pub raised_amount: u64,
    pub state: CampaignState,
    pub milestone_idx: u8,
    pub milestones: Vec<Milestone>,
    pub deadline: i64, 
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
    pub goal_amount: u64,
    pub state: MilestoneState,
    pub votes_for: u64,
    pub votes_against: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct MilestoneInput {
    pub goal_amount: u64,
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
}