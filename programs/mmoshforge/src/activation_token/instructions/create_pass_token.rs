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
    constants::{SEED_ACTIVATION_TOKEN_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE, TOTAL_SELLER_BASIS_POINTS},
    error::MyError,
    other_states::LineageInfo,
    profile::profile_state::ProfileState,
    utils::{_verify_collection,init_ata_if_needed, transfer_tokens},
};

pub fn create_pass_token(ctx: Context<ACreatePassToken>, amount: u64) -> Result<()> {
    let minter = ctx.accounts.minter.to_account_info();
    let mint = ctx.accounts.activation_token.to_account_info();
    let activation_token_state = &mut ctx.accounts.activation_token_state;
    let main_state = &mut ctx.accounts.main_state;
    let token_program = ctx.accounts.token_program.to_account_info();
    let profile_state = &mut ctx.accounts.profile_state;
    profile_state.total_minted_sft += amount;

    let cpi_accounts = MintTo {
        mint,
        to: ctx.accounts.receiver_ata.to_account_info(),
        authority: main_state.to_account_info(),
    };

    token::mint_to(
        CpiContext::new_with_signer(
            token_program.clone(),
            cpi_accounts,
            &[&[SEED_MAIN_STATE, ctx.accounts.project.key().as_ref(), &[main_state._bump]]],
        ),
        amount,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct ACreatePassToken<'info> {
    #[account(
        mut,
        address = activation_token_state.creator
    )]
    pub minter: Signer<'info>,

    #[account(
        mut,
        token::mint = profile,
        token::authority = minter,
        constraint = minter_profile_ata.amount == 1 @ MyError::OnlyProfileHolderAllow,
    )]
    pub minter_profile_ata: Box<Account<'info, TokenAccount>>,

    ///CHECK:
    #[account(
        mut,
        token::mint = activation_token
    )]
    pub receiver_ata: Box<Account<'info, TokenAccount>>,

    ///CHECK:
    pub project: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE, project.key().as_ref()],
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
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
