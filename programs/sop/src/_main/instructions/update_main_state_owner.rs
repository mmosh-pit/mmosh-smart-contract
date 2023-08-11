use anchor_lang::prelude::*;
use crate::{_main::main_state::MainState, constants::SEED_MAIN_STATE, error::MyError};

pub fn update_main_state_owner(ctx: Context<AUpdateMainStateOwner>, new_owner: Pubkey) -> Result<()> {
    let program_state= &mut ctx.accounts.main_state;
    program_state.owner = new_owner;

    Ok(())
}

#[derive(Accounts)]
pub struct AUpdateMainStateOwner<'info> {
    #[account(
        mut, 
        address = main_state.owner @ MyError::OnlyOwnerCanCall,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Account<'info, MainState>,
}
