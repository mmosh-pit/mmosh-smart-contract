use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    state::{PREFIX as METADATA, TOKEN_RECORD_SEED},
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    collection_factory::CollectionState,
    constants::{SEED_COLLECTION_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE},
    error::MyError,
    fake_id::{self, FakeIdState},
    other_states::LineageInfo,
};

pub fn set_native_collection(ctx: Context<SetNativeCollection>) -> Result<()> {
    let collection_state = &mut ctx.accounts.collection_state;
    collection_state.mint = ctx.accounts.collection.key();

    Ok(())
}

#[derive(Accounts)]
pub struct SetNativeCollection<'info> {
    #[account(mut, address = main_state.owner @ MyError::OnlyOwnerCanCall)]
    pub owner: Signer<'info>,

    ///CHECK:
    pub owner_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        init,
        payer = owner,
        seeds = [SEED_COLLECTION_STATE, collection.key().as_ref()],
        bump,
        space = 8 + CollectionState::MAX_SIZE
    )]
    pub collection_state: Box<Account<'info, CollectionState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            collection.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub collection_metadata: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
