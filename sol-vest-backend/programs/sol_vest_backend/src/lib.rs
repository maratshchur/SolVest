use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// 1. ПОСЛЕ ПЕРВОГО 'anchor build' ЗАМЕНИТЕ ЭТОТ ID НА ТОТ, ЧТО ВЫДАСТ ТЕРМИНАЛ
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod sol_vest {
    use super::*;

    // --- АДМИНКА ---
    // Инициализация протокола (комиссия, владелец)
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, protocol_fee: u16) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.owner = *ctx.accounts.owner.key;
        protocol.paused = false;
        protocol.protocol_fee_basis_points = protocol_fee; // 200 = 2%
        // Комиссии будут капать на токен-аккаунт, переданный сюда
        protocol.fee_destination = ctx.accounts.fee_destination.key();
        Ok(())
    }

    // --- КАМПАНИИ ---
    pub fn create_campaign(
        ctx: Context<CreateCampaign>, 
        total_goal: u64,
        milestones: Vec<MilestoneInput>
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        
        // Простая проверка: сумма этапов должна быть равна цели
        let sum: u64 = milestones.iter().map(|m| m.goal_amount).sum();
        require!(sum == total_goal, CampaignError::MilestoneSumMismatch);

        campaign.creator = *ctx.accounts.creator.key;
        campaign.usdc_mint = ctx.accounts.usdc_mint.key();
        campaign.total_goal = total_goal;
        campaign.raised_amount = 0;
        campaign.state = CampaignState::Funding;
        campaign.milestone_idx = 0;
        
        // Записываем этапы
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

        // Перевод токенов от инвестора в хранилище (Vault)
        token::transfer(ctx.accounts.transfer_ctx(), amount)?;

        campaign.raised_amount += amount;

        // Запись о вкладе
        let contribution = &mut ctx.accounts.contribution;
        contribution.investor = *ctx.accounts.investor.key;
        contribution.campaign = campaign.key();
        contribution.amount += amount;

        // Если собрали всю сумму — активируем
        if campaign.raised_amount >= campaign.total_goal {
            campaign.state = CampaignState::Active;
        }

        Ok(())
    }

    // --- УПРАВЛЕНИЕ ЭТАПАМИ ---
    // Создатель говорит: "Я сделал работу, давайте голосовать"
    pub fn submit_milestone(ctx: Context<ManageMilestone>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;
        
        require!(campaign.state == CampaignState::Active, CampaignError::CampaignNotActive);
        require!(campaign.milestones[idx].state == MilestoneState::Pending, CampaignError::MilestoneNotPending);

        campaign.milestones[idx].state = MilestoneState::Voting;
        Ok(())
    }

    // Инвестор голосует
    pub fn vote(ctx: Context<Vote>, vote_for: bool) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;

        require!(campaign.milestones[idx].state == MilestoneState::Voting, CampaignError::MilestoneNotVoting);
        
        // Записываем, что этот человек проголосовал (чтобы не голосовал дважды)
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = *ctx.accounts.voter.key;
        
        // Сила голоса равна сумме вклада
        let weight = ctx.accounts.contribution.amount;
        
        if vote_for {
            campaign.milestones[idx].votes_for += weight;
        } else {
            campaign.milestones[idx].votes_against += weight;
        }
        
        Ok(())
    }

    // Финализация этапа и выплата (если успешно)
    pub fn finalize_milestone(ctx: Context<WithdrawFunds>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let idx = campaign.milestone_idx as usize;
        require!(campaign.milestones[idx].state == MilestoneState::Voting, CampaignError::MilestoneNotVoting);

        let m = &campaign.milestones[idx];
        let total_votes = m.votes_for + m.votes_against;
        
        // Упрощенная логика: Если ЗА > ПРОТИВ, то успех
        if m.votes_for > m.votes_against {
            // Рассчитываем комиссию и выплату
            let amount = m.goal_amount;
            let fee = (amount as u128 * ctx.accounts.protocol.protocol_fee_basis_points as u128 / 10000) as u64;
            let creator_amount = amount - fee;

            // Подпись от имени Vault (PDA)
            let seeds = &[
                b"vault",
                campaign.to_account_info().key.as_ref(),
                &[*ctx.bumps.get("vault").unwrap()]
            ];
            let signer = &[&seeds[..]];

            // 1. Отправляем комиссию протоколу
            token::transfer(ctx.accounts.transfer_fee_ctx().with_signer(signer), fee)?;
            
            // 2. Отправляем деньги создателю
            token::transfer(ctx.accounts.transfer_creator_ctx().with_signer(signer), creator_amount)?;

            // Переходим к следующему этапу
            campaign.milestones[idx].state = MilestoneState::Completed;
            campaign.milestone_idx += 1;
            
            if campaign.milestone_idx as usize >= campaign.milestones.len() {
                campaign.state = CampaignState::Completed;
            }

        } else {
            // Если проиграли — кампания провалена
            campaign.state = CampaignState::Failed;
        }

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
    #[account(init, payer = creator, space = 9000)] // Большой запас места
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
impl<'info> Invest<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.token_program.to_account_info(), Transfer {
            from: self.investor_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.investor.to_account_info(),
        })
    }
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
impl<'info> WithdrawFunds<'info> {
    fn transfer_creator_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.token_program.to_account_info(), Transfer {
            from: self.vault.to_account_info(),
            to: self.creator_token_account.to_account_info(),
            authority: self.vault.to_account_info(),
        })
    }
    fn transfer_fee_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.token_program.to_account_info(), Transfer {
            from: self.vault.to_account_info(),
            to: self.fee_destination.to_account_info(),
            authority: self.vault.to_account_info(),
        })
    }
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
}