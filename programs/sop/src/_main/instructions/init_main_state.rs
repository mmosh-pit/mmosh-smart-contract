use crate::{
    _main::main_state::{MainState, MainStateInput},
    constants::SEED_MAIN_STATE,
};
use anchor_lang::{prelude::*, Discriminator};

pub fn init_main_state(ctx: Context<AInitMainState>, input: MainStateInput) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;
    let owner = ctx.accounts.owner.to_account_info();
    input.set_value(main_state);
    main_state.owner = owner.key();
    main_state._bump = *ctx.bumps.get("main_state").unwrap();

    Ok(())
}

#[derive(Accounts)]
pub struct AInitMainState<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [SEED_MAIN_STATE],
        bump,
        space = 8 + MainState::MAX_SIZE, 
    )]
    pub main_state: Account<'info, MainState>,

    pub system_program: Program<'info, System>,
}
