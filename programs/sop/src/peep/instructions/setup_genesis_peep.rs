use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    _main::MainState,
    constants::{SEED_MAIN_STATE, SEED_PEEP_STATE},
    error::MyError,
    fake_id::FakeIdState,
    other_states::LineageInfo,
};

pub fn setup_genesis_fake_id(
    ctx: Context<ASetupGenesisFakeId>,
    lineage: LineageInfo,
) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;
    let fake_id_state = &mut ctx.accounts.fake_id_state;
    //TODO: currently not chacking on perosna validation (relying on owner)

    fake_id_state.lineage = lineage;
    fake_id_state.mint = ctx.accounts.genesis_fake_id.key();
    main_state.total_minted_fake_id += 1;
    Ok(())
}

#[derive(Accounts)]
pub struct ASetupGenesisFakeId<'info> {
    #[account(address = main_state.owner @MyError::OnlyOwnerCanCall)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Account<'info, MainState>,

    #[account(address = main_state.genesis_fake_id)]
    pub genesis_fake_id: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [SEED_PEEP_STATE,genesis_fake_id.key().as_ref()],
        bump,
    )]
    pub fake_id_state: Account<'info, FakeIdState>,
}
