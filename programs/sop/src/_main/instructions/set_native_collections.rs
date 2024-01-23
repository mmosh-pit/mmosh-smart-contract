use crate::{
    _main::main_state::{MainState, MainStateInput},
    constants::SEED_MAIN_STATE,
    error::MyError,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ASetNativeCollection<'info> {
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
