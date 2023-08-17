use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        builders::{Burn, Create},
        verify_sized_collection_item, InstructionBuilder, approve_collection_authority,
    },
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
    profile_state::ProfileState,
    utils::{_verify_collection, verify_collection_item_by_main},
};

///MINT FakeID by activation_token
pub fn mint_profile_by_at(
    ctx: Context<AMintProfileByAt>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    {
        let user = ctx.accounts.user.to_account_info();
        let main_state = &mut ctx.accounts.main_state;
        let profile_state = &mut ctx.accounts.profile_state;
        let parent_profile_state = &mut ctx.accounts.parent_profile_state;
        let parent_profile_metadata = ctx.accounts.parent_profile_metadata.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();

        //verification(parent nft collection check)
        _verify_collection(&parent_profile_metadata, ctx.accounts.collection.key())?;

        //state changes
        profile_state.mint = ctx.accounts.profile.key();
        profile_state.lineage.creator = ctx.accounts.user.key();
        profile_state.lineage.parent = parent_profile_state.mint;
        profile_state.lineage.grand_parent = parent_profile_state.lineage.parent;
        profile_state.lineage.great_grand_parent = parent_profile_state.lineage.grand_parent;
        profile_state.lineage.generation = parent_profile_state.lineage.generation + 1;
        parent_profile_state.lineage.total_child += 1;
    }
    {
        //NOTE: minting
        ctx.accounts.mint(name, symbol, uri)?;
    }
    {
        //NOTE: created mint collection verifiaction
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    {
        ctx.accounts.burn_activation_token(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintProfileByAt<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    ///CHECK:
    #[account(
        mut,
        token::mint = activation_token,
        token::authority = user,
        constraint = user_activation_token_ata.amount >= 1,
    )]
    pub user_activation_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = profile,
        token::authority = user,
        constraint = user_profile_ata.amount == 1,
    )]
    pub user_profile_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(mut)]
    pub activation_token: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_ACTIVATION_TOKEN_STATE,activation_token.key().as_ref()],
        bump,
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

    ///CHECK:
    #[account(mut)]
    pub profile: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer =  user,
        seeds = [SEED_PROFILE_STATE, profile.key().as_ref()],
        bump,
        space= 8 + ProfileState::MAX_SIZE
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
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            activation_token_state.parent_profile.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_profile_metadata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, activation_token_state.parent_profile.as_ref()],
        bump,
    )]
    pub parent_profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK: //PERF:
    #[account(mut)]
    pub collection: AccountInfo<'info>,

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

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            collection.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub collection_edition: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds = [
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            collection.key().as_ref(),
            COLLECTION_AUTHORITY.as_ref(),
            main_state.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub collection_authority_record: AccountInfo<'info>,

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
    pub sub_collection_authority_record: AccountInfo<'info>,

    //PERF: not sure parent profile nft collection verification are require or not (think it
    //already secure)
    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl<'info> AMintProfileByAt<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.profile.to_account_info();
        let user = self.user.to_account_info();
        let user_presona_token_ata = self.user_profile_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let edition = self.profile_edition.to_account_info();
        let associated_token_program = self.associated_token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            collection: Some(mpl_token_metadata::state::Collection {
                verified: false,
                key: self.collection.key(),
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
            token_standard: mpl_token_metadata::state::TokenStandard::NonFungible,
            primary_sale_happened: false,
            seller_fee_basis_points: 100,
        };

        let ix = Create {
            mint: mint.key(),
            payer: user.key(),
            authority: user.key(),
            initialize_mint: false,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: user.key(),
            spl_token_program: token_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            update_authority_as_signer: false,
            master_edition: Some(edition.key()),
            args: mpl_token_metadata::instruction::CreateArgs::V1 {
                asset_data,
                decimals: Some(0),
                print_supply: Some(mpl_token_metadata::state::PrintSupply::Zero),
            },
        }
        .instruction();

        invoke(
            &ix,
            &[
                mint,
                user,
                user_presona_token_ata,
                metadata,
                edition,
                mpl_program,
                associated_token_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
        )?;

        Ok(())
    }

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.collection.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        let collection_metadata= self.collection_metadata.to_account_info();
        let collection_authority_record = self.collection_authority_record.to_account_info();
        let system_program = self.system_program.to_account_info();
        let sysvar_instructions= self.sysvar_instructions.to_account_info();

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

    pub fn burn_activation_token(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let user_activation_token_ata = self.user_activation_token_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let associated_token_program = self.associated_token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.activation_token_metadata.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        // let main_state = &mut self.main_state;

        let ix = Burn {
            mint: mint.key(),
            metadata: metadata.key(),
            token: user_activation_token_ata.key(),
            authority: user.key(),
            spl_token_program: token_program.key(),
            system_program: system_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            collection_metadata: None,
            edition: None,
            master_edition: None,
            token_record: None,
            edition_marker: None,
            master_edition_mint: None,
            master_edition_token: None,
            args: mpl_token_metadata::instruction::BurnArgs::V1 { amount: 1 },
        }
        .instruction();

        invoke(
            &ix,
            &[
                mint,
                user,
                user_activation_token_ata,
                system_program,
                token_program,
                mpl_program,
                associated_token_program,
                metadata,
                sysvar_instructions,
            ],
            // &[&[SEED_MAIN_STATE, &[self.main_state._bump]]],
        )?;

        Ok(())
    }

    pub fn approve_sub_collection_authority_to_main(&mut self) -> Result<()> {
        let mint = self.collection.to_account_info();
        let payer = self.user.to_account_info();
        let system_program = self.system_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.collection_metadata.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;
        let sub_collection_authority_record =
            self.sub_collection_authority_record.to_account_info();

        let ix = approve_collection_authority(
            mpl_program.key(),
            sub_collection_authority_record.key(),
            main_state.key(),
            main_state.key(),
            payer.key(),
            metadata.key(),
            mint.key(),
        );

        invoke_signed(
            &ix,
            &[
                mint,
                payer,
                main_state.to_account_info(),
                sub_collection_authority_record,
                metadata,
                mpl_program,
                system_program,
                sysvar_instructions,
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;
        Ok(())
    }
}
