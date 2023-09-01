use anchor_lang::prelude::*;
use crate::{_main::main_state::{MainState, MainStateInput}, constants::SEED_MAIN_STATE, error::MyError};

pub fn update_main_state(ctx: Context<AUpdateMainState>, input: MainStateInput ) -> Result<()> {
    let main_state= &mut ctx.accounts.main_state;
    input.set_value(main_state);
    Ok(())
}

#[derive(Accounts)]
pub struct AUpdateMainState<'info> {
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
