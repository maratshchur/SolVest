use anchor_lang::prelude::*;

declare_id!("H14JDTx8fkS9TktMfyuuwVgr1RxoTw6C3AvDuXz1Tvq6");

#[program]
pub mod sol_vest_backend {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
