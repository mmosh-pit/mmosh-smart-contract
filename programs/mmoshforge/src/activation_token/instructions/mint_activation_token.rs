use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instructions::Create,
    types::Creator,
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

pub fn mint_activation_token(ctx: Context<AMintActivationToken>, amount: u64) -> Result<()> {
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
            token_program,
            cpi_accounts,
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        ),
        amount,
    )?;

    // NOTE: minting cost distribution
    let token_program = ctx.accounts.token_program.to_account_info();
    let sender_ata = ctx.accounts.user_opos_ata.to_account_info();
    let authority = ctx.accounts.minter.to_account_info();
    let main_state = &mut ctx.accounts.main_state;
    let cost = main_state.invitation_minting_cost * amount;

    // Genesis
    transfer_tokens(
        sender_ata.to_account_info(),
        ctx.accounts
            .genesis_profile_holder_opos_ata
            .to_account_info(),
        authority.to_account_info(),
        token_program.to_account_info(),
        cost as u64,
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
        constraint = minter_profile_ata.amount == 1 @ MyError::OnlyProfileHolderAllow,
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
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    //NOTE: profile minting cost distribution account
    // #[account(address = activation_token_state.parent_profile @ MyError::ProfileIdMissMatch)]
    pub parent_profile: Box<Account<'info, Mint>>,
    pub grand_parent_profile: Box<Account<'info, Mint>>,
    pub great_grand_parent_profile: Box<Account<'info, Mint>>,
    pub ggreate_grand_parent_profile: Box<Account<'info, Mint>>,
    pub genesis_profile: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, parent_profile.key().as_ref()],
        bump,
    )]
    pub parent_profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK:
    #[account(address = main_state.opos_token)]
    pub opos_token: AccountInfo<'info>,

    // Current parent profile holded ata
    #[account(
        token::mint = parent_profile_state.mint,
        constraint = current_parent_profile_holder_ata.amount == 1
    )]
    pub current_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.parent,
        constraint = current_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.grand_parent,
        constraint = current_great_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_great_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.great_grand_parent,
        constraint = current_ggreat_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_ggreat_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = main_state.genesis_profile,
        constraint = current_genesis_profile_holder_ata.amount == 1
    )]
    pub current_genesis_profile_holder_ata: Box<Account<'info, TokenAccount>>,

    // Current profile holders
    ///CHECK:
    #[account(address = current_parent_profile_holder_ata.owner)]
    pub current_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_grand_parent_profile_holder_ata.owner)]
    pub current_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_great_grand_parent_profile_holder_ata.owner)]
    pub current_great_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_ggreat_grand_parent_profile_holder_ata.owner)]
    pub current_ggreat_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_genesis_profile_holder_ata.owner)]
    pub current_genesis_profile_holder: AccountInfo<'info>,

    // Current Profile holder's opos token ata
    #[account(
        mut,
        token::mint = opos_token,
        token::authority = minter,
        constraint= user_opos_ata.amount >= main_state.invitation_minting_cost @ MyError::NotEnoughTokenToMint
    )]
    pub user_opos_ata: Box<Account<'info, TokenAccount>>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            parent_profile_holder_opos_ata.to_account_info(),
            current_parent_profile_holder.to_account_info(),
            minter.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
        // token::mint = opos_token,
        // token::authority = current_parent_profile_holder,
    )]
    // pub parent_profile_holder_opos_ata: Box<Account<'info, TokenAccount>>,
    pub parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            grand_parent_profile_holder_opos_ata.to_account_info(),
            current_grand_parent_profile_holder.to_account_info(),
            minter.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
        // token::mint = opos_token,
        // token::authority = current_grand_parent_profile_holder,
    )]
    pub grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            great_grand_parent_profile_holder_opos_ata.to_account_info(),
            current_great_grand_parent_profile_holder.to_account_info(),
            minter.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
        // token::mint = opos_token,
        // token::authority = current_great_grand_parent_profile_holder,
    )]
    pub great_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            ggreat_grand_parent_profile_holder_opos_ata.to_account_info(),
            current_ggreat_grand_parent_profile_holder.to_account_info(),
            minter.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
        // token::mint = opos_token,
        // token::authority = current_ggreat_grand_parent_profile_holder,
    )]
    pub ggreat_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            genesis_profile_holder_opos_ata.to_account_info(),
            current_genesis_profile_holder.to_account_info(),
            minter.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
        // token::mint = opos_token,
        // token::authority = current_genesis_profile_holder,
    )]
    pub genesis_profile_holder_opos_ata: AccountInfo<'info>,
}
