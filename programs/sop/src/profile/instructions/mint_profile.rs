use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        builders::{Burn, Create},
        verify_sized_collection_item, InstructionBuilder,
    },
    state::{
        AssetData, Creator, PrintSupply, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA,
        TOKEN_RECORD_SEED,
    },
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    constants::{SEED_MAIN_STATE, SEED_PROFILE_STATE},
    error::MyError,
    other_states::LineageInfo,
    profile::ProfileState,
    utils::{_verify_collection, get_vault_id, transfer_tokens, verify_collection_item_by_main},
};

pub fn mint_profile(
    ctx: Context<AMintProfile>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    // let mut nft_creators = Vec::<Creator>::new();
    {
        //NOTE: setup and validation
        let user = ctx.accounts.grand_parent_vault_usdc_ata.to_account_info();
        let main_state = &mut ctx.accounts.main_state;
        let profile_state = &mut ctx.accounts.profile_state;
        let parent_profile_state = &mut ctx.accounts.parent_profile_state;
        let parent_profile_metadata = ctx.accounts.parent_profile_metadata.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();

        //TODO: verification(parent nft collection check)
        _verify_collection(&parent_profile_metadata, ctx.accounts.collection.key())?;

        //state changes
        profile_state.mint = ctx.accounts.profile.key();
        profile_state.lineage.creator = ctx.accounts.user.key();
        profile_state.lineage.parent = parent_profile_state.mint;
        profile_state.lineage.grand_parent = parent_profile_state.lineage.parent;
        profile_state.lineage.great_grand_parent = parent_profile_state.lineage.grand_parent;
        profile_state.lineage.generation = parent_profile_state.lineage.generation + 1;
        parent_profile_state.lineage.total_child += 1;
        // current_lineage = profile_state.lineage;

        //TODO: update some main state if fiels are avaible (may be in future)
        main_state.total_minted_profile += 1;
        //NOTE: Royalty Distribution

        //TODO:
        let user_key = user.key();
        let from = ctx.accounts.user_usdc_ata.to_account_info();

        let receiver_ata = &mut ctx.accounts.creator_usdc_ata;
        if receiver_ata.owner != user_key {
            transfer_tokens(
                from.clone(),
                receiver_ata.to_account_info(),
                user.clone(),
                token_program.to_account_info(),
                1,
            )?;
        }

        let receiver_ata = &mut ctx.accounts.parent_vault_usdc_ata;
        if receiver_ata.owner != user_key {
            transfer_tokens(
                from.clone(),
                receiver_ata.to_account_info(),
                user.clone(),
                token_program.to_account_info(),
                1,
            )?;
        }

        let receiver_ata = &mut ctx.accounts.grand_parent_vault_usdc_ata;
        if receiver_ata.owner != user_key {
            transfer_tokens(
                from.clone(),
                receiver_ata.to_account_info(),
                user.clone(),
                token_program.to_account_info(),
                1,
            )?;
        }

        let receiver_ata = &mut ctx.accounts.ggrand_parent_vault_usdc_ata;
        if receiver_ata.owner != user_key {
            transfer_tokens(
                from.clone(),
                receiver_ata.to_account_info(),
                user.clone(),
                token_program.to_account_info(),
                1,
            )?;
        }

        let receiver_ata = &mut ctx.accounts.uncle_vault_usdc_ata;
        if receiver_ata.owner != user_key {
            transfer_tokens(
                from.clone(),
                receiver_ata.to_account_info(),
                user.clone(),
                token_program.to_account_info(),
                1,
            )?;
        }
    }
    {
        //NOTE: minting
        ctx.accounts.mint(name, symbol, uri)?;
    }
    {
        //NOTE: created mint collection verifiaction
        // ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintProfile<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    ///CHECK:
    #[account(mut)]
    pub user_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub profile: AccountInfo<'info>,

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

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, parent_profile_state.mint.as_ref()],
        bump,
    )]
    pub parent_profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            parent_profile_state.mint.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_profile_metadata: AccountInfo<'info>,
    ///TODO: profile checking later included

    ///CHECK:
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

    //PERF: not sure parent profile nft collection verification are require or not (think it
    //already secure)
    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    //NOTE: For Royalty Distribution
    #[account(
        mut,
        token::authority = user,
        token::mint = main_state.usdc_mint,
    )]
    pub user_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::authority = parent_profile_state.lineage.creator,
        token::mint = main_state.usdc_mint,
    )]
    pub creator_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // token::authority = get_vault_id(parent_profile_state.mint),
        token::mint = main_state.usdc_mint,
    )]
    pub parent_vault_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // token::authority = get_vault_id(parent_profile_state.lineage.parent),
        // token::mint = main_state.usdc_mint,
    )]
    pub grand_parent_vault_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // token::authority = get_vault_id(parent_profile_state.lineage.great_grand_parent),
        // token::mint = main_state.usdc_mint,
    )]
    pub ggrand_parent_vault_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // token::authority = get_vault_id(parent_profile_state.lineage.uncle_psy),
        // token::mint = main_state.usdc_mint,
    )]
    pub uncle_vault_usdc_ata: Box<Account<'info, TokenAccount>>,
}

impl<'info> AMintProfile<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.profile.to_account_info();
        let user = self.user.to_account_info();
        let user_ata = self.user_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let edition = self.profile_edition.to_account_info();
        let ata_program = self.ata_program.to_account_info();
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
            seller_fee_basis_points: main_state.seller_fee_basis_points,
        };

        let ix = Create {
            mint: mint.key(),
            payer: user.key(),
            authority: user.key(),
            initialize_mint: true,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: main_state.key(),
            spl_token_program: token_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            update_authority_as_signer: true,
            master_edition: Some(edition.key()),
            args: mpl_token_metadata::instruction::CreateArgs::V1 {
                asset_data,
                decimals: Some(0),
                print_supply: Some(PrintSupply::Zero),
            },
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                mint,
                user,
                user_ata,
                metadata,
                edition,
                mpl_program,
                ata_program,
                token_program,
                system_program,
                sysvar_instructions,
                main_state.to_account_info(),
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;
        Ok(())
    }

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.profile.to_account_info();
        let user = self.user.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.collection.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        let collection_authority_record = self.collection_authority_record.to_account_info();

        verify_collection_item_by_main(
            mint,
            metadata,
            collection,
            collection_metadata,
            collection_edition,
            collection_authority_record,
            user,
            main_state,
            mpl_program,
            system_program,
        )?;

        // let ix = verify_sized_collection_item(
        //     mpl_program.key(),
        //     metadata.key(),
        //     main_state.key(),
        //     user.key(),
        //     mint.key(),
        //     collection.key(),
        //     collection_edition.key(),
        //     None,
        // );
        //
        // invoke_signed(
        //     &ix,
        //     &[
        //         mint,
        //         user,
        //         metadata,
        //         main_state.to_account_info(),
        //         collection,
        //         collection_metadata,
        //         collection_edition,
        //         system_program,
        //         token_program,
        //         mpl_program,
        //     ],
        //     &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        // )?;

        Ok(())
    }
}
