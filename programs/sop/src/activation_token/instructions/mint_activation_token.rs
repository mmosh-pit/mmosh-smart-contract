use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{builders::Create, verify_sized_collection_item, InstructionBuilder},
    state::{AssetData, Creator, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED},
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    activation_token::ActivationTokenState,
    constants::{SEED_ACTIVATION_TOKEN_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE},
    error::MyError,
    other_states::LineageInfo,
    profile::profile_state::ProfileState,
    utils::_verify_collection,
};

pub fn mint_activation_token(ctx: Context<AMintActivationToken>, amount: u64) -> Result<()> {
    let minter = ctx.accounts.minter.to_account_info();
    let mint = ctx.accounts.activation_token.to_account_info();
    let activation_token_state = &mut ctx.accounts.activation_token_state;
    let main_state = &mut ctx.accounts.main_state;
    let token_program = ctx.accounts.token_program.to_account_info();

    let cpi_accounts = MintTo {
        mint,
        to: ctx.accounts.receiver_ata.to_account_info(),
        authority: main_state.to_account_info(),
    };

    token::mint_to(
        CpiContext::new_with_signer(
            token_program,
            cpi_accounts,
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        ),
        amount,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct AMintActivationToken<'info> {
    #[account(
        mut,
        address = activation_token_state.creator
    )]
    pub minter: Signer<'info>,

    #[account(
        mut,
        token::mint = profile,
        token::authority = minter,
        constraint = minter_profile_ata.amount == 1,
    )]
    pub minter_profile_ata: Box<Account<'info, TokenAccount>>,

    ///CHECK:
    #[account(
        mut,
        token::mint = activation_token
    )]
    pub receiver_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(
        mut,
        address = profile_state.activation_token.unwrap() @ MyError::ActivationTokenNotFound
    )]
    pub activation_token: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_ACTIVATION_TOKEN_STATE,activation_token.key().as_ref()],
        bump,
    )]
    pub activation_token_state: Box<Account<'info, ActivationTokenState>>,

    #[account()]
    pub profile: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE,profile.key().as_ref()],
        bump,
    )]
    pub profile_state: Box<Account<'info, ProfileState>>,
    pub token_program: Program<'info, Token>,
}
