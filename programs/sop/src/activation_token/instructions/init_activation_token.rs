use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{builders::Create, verify_sized_collection_item, InstructionBuilder},
    state::{
        AssetData, Creator, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED,
    },
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
    utils::{_verify_collection, verify_collection_item_by_main},
};

pub fn init_activation_token(ctx: Context<AInitActivationToken>) -> Result<()> {
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let activation_token_state = &mut ctx.accounts.activation_token_state;
        let profile_state = &mut ctx.accounts.profile_state;
        let profile_metadata = ctx.accounts.profile_metadata.to_account_info();

        //verification
        _verify_collection(&profile_metadata, main_state.profile_collection);

        //state changes
        if profile_state.activation_token.is_some() {
            return anchor_lang::err!(MyError::ActivationTokenAlreadyInitialize);
        }

        profile_state.activation_token = Some(ctx.accounts.activation_token.key());
        activation_token_state.parent_profile = ctx.accounts.profile.key();
        activation_token_state.creator = ctx.accounts.user.key();
        //TODO: update some main state if fiels are avaible (may be in future)
    }
    {
        //NOTE: minting
        ctx.accounts.init_token()?;
    }
    {
        //NOTE: created mint collection verifiaction
        // ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AInitActivationToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        token::mint = profile,
        token::authority = user,
        constraint = user_profile_ata.amount == 1,
    )]
    pub user_profile_ata: Box<Account<'info, TokenAccount>>,

    ///CHECK:
    #[account(mut)]
    pub user_activation_token_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub activation_token: AccountInfo<'info>,

    #[account(
        init,
        payer = user,
        seeds = [SEED_ACTIVATION_TOKEN_STATE,activation_token.key().as_ref()],
        bump,
        space = 8 + ActivationTokenState::MAX_SIZE,
    )]
    pub activation_token_state: Box<Account<'info, ActivationTokenState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            activation_token.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub activation_token_metadata: AccountInfo<'info>,

    #[account()]
    pub profile: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE,profile.key().as_ref()],
        bump,
    )]
    pub profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_edition: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds = [
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
            COLLECTION_AUTHORITY.as_ref(),
            main_state.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_collection_authority_record: AccountInfo<'info>,

    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub ata_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AInitActivationToken<'info> {
    pub fn init_token(&mut self) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let user_activation_token_ata = self.user_activation_token_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.activation_token_metadata.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let ata_program = self.ata_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        let name = String::from("Activation Token");
        let symbol = String::from("AT");
        let uri = String::from("");

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            collection: Some(mpl_token_metadata::state::Collection {
                verified: false,
                key: self.profile.key(),
            }),
            uses: None,
            creators: Some(vec![Creator {
                address: user.key(),
                verified: false,
                share: 100,
            }]),
            collection_details: None,
            is_mutable: true, //NOTE: may be for testing
            rule_set: None,
            token_standard: mpl_token_metadata::state::TokenStandard::FungibleAsset,
            primary_sale_happened: false,
            seller_fee_basis_points: 100,
        };

        let ix = Create {
            mint: mint.key(),
            payer: user.key(),
            authority: main_state.key(),
            initialize_mint: true,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: main_state.key(),
            spl_token_program: token_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            update_authority_as_signer: true,
            master_edition: None,
            args: mpl_token_metadata::instruction::CreateArgs::V1 {
                asset_data,
                decimals: Some(0),
                print_supply: None,
            },
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                mint,
                user,
                user_activation_token_ata,
                main_state.to_account_info(),
                metadata,
                mpl_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;

        Ok(())
    }

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.profile.to_account_info();
        let collection_edition = self.profile_edition.to_account_info();
        let collection_metadata = self.profile_metadata.to_account_info();
        let collection_authority_record = self.profile_collection_authority_record.to_account_info();
        let system_program = self.system_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        verify_collection_item_by_main(
            metadata,
            collection,
            collection_metadata,
            collection_edition,
            collection_authority_record,
            main_state,
            mpl_program,
            system_program,
            sysvar_instructions,
        )?;

        Ok(())
    }
}
