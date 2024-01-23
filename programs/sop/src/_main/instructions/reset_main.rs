use crate::{
    _main::main_state::{MainState, MainStateInput},
    constants::SEED_MAIN_STATE,
    error::MyError,
};
use anchor_lang::prelude::*;

// pub fn reset_main(ctx:Context<AResetMain>)->Result<()>{
//     Ok(())
// }

#[derive(Accounts)]
pub struct AResetMain<'info> {
    #[account(
        mut,
        address = main_state.owner @ MyError::OnlyOwnerCanCall,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Account<'info, MainState>,

    pub system_program: Program<'info, System>,
}
