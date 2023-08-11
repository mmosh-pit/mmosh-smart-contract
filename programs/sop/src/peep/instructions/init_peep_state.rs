use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    _main::MainState,
    constants::{SEED_MAIN_STATE, SEED_PEEP_STATE},
    error::MyError,
    other_states::LineageInfo,
    fake_id::FakeIdState,
};

pub fn init_fake_id_state(ctx: Context<AInitFakeIdState>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct AInitFakeIdState<'info> {
    #[account(mut, address = main_state.owner @MyError::OnlyOwnerCanCall)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Account<'info, MainState>,

    #[account(address = main_state.genesis_fake_id)]
    pub fake_id: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        seeds = [SEED_PEEP_STATE,fake_id.key().as_ref()],
        bump,
        space = 8 + FakeIdState::MAX_SIZE,
    )]
    pub fake_id_state: Account<'info, FakeIdState>,

    pub system_program: Program<'info, System>,
}
