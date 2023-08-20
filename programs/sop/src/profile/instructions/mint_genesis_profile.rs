use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        approve_collection_authority,
        builders::{Burn, Create, Mint as MintNft, Verify},
        verify_sized_collection_item, InstructionBuilder, MintArgs,
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
    collection_factory::collection_state::CollectionState,
    constants::{SEED_COLLECTION_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE},
    error::MyError,
    other_states::LineageInfo,
    profile::ProfileState,
    utils::{_verify_collection, verify_collection_item_by_main},
};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct MintProfileByAdminInput {
    name: String,
    symbol: String,
    uri: String,
    lineage: LineageInfo,
    parent_mint: Pubkey,
}

pub fn mint_genesis_profile(
    ctx: Context<AMintProfileByAdmin>,
    input: MintProfileByAdminInput,
) -> Result<()> {
    // let mut nft_creators = Vec::<Creator>::new();
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let profile_state = &mut ctx.accounts.profile_state;
        let collection_state = &mut ctx.accounts.collection_state;

        //verification

        //state changes
        profile_state.mint = ctx.accounts.profile.key();
        profile_state.lineage.creator = ctx.accounts.admin.key();
        profile_state.lineage.parent = input.parent_mint;
        profile_state.lineage.grand_parent = input.lineage.parent;
        profile_state.lineage.great_grand_parent = input.lineage.grand_parent;
        profile_state.lineage.ggreate_grand_parent = input.lineage.ggreate_grand_parent;
        // profile_state.lineage.generation = input.lineage.generation;
        // profile_state.lineage.total_child = input.lineage.total_child;
        profile_state.lineage.generation = 0;
        profile_state.lineage.total_child = 0;

        if collection_state.genesis_profile != System::id() {
            return anchor_lang::err!(MyError::AlreadySet);
        }
        collection_state.genesis_profile = ctx.accounts.profile.key();

        //TODO: update some main state if fiels are avaible (may be in future)
        main_state.total_minted_profile += 1;
    }
    {
        //NOTE: minting
        ctx.accounts.mint(input.name, input.symbol, input.uri)?;
    }
    {
        //NOTE: created mint collection verifiaction
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintProfileByAdmin<'info> {
    #[account(mut, address = main_state.owner @ MyError::OnlyOwnerCanCall)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(
        mut,
        mint::decimals = 0,
        mint::authority = admin,
        mint::freeze_authority = admin
    )]
    pub profile: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = profile,
        token::authority = admin,
        constraint = admin_ata.amount == 1,
    )]
    pub admin_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer =  admin,
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
    #[account(mut)]
    pub collection: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_COLLECTION_STATE, collection.key().as_ref()],
        bump,
    )]
    pub collection_state: Account<'info, CollectionState>,

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

impl<'info> AMintProfileByAdmin<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.profile.to_account_info();
        let admin = self.admin.to_account_info();
        let admin_ata = self.admin_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let edition = self.profile_edition.to_account_info();
        let ata_program = self.associated_token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        //Mint a token
        // let cpi_mint_accounts = MintTo {
        //     authority: admin.clone(),
        //     mint: mint.clone(),
        //     to: admin_ata.clone(),
        // };
        // token::mint_to(CpiContext::new(token_program.clone(), cpi_mint_accounts), 1)?;

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
                verified: false,
                share: 100,
                address: self.admin.key(),
            }]),
            collection_details: Some(mpl_token_metadata::state::CollectionDetails::V1 { size: 0 }),
            is_mutable: true, //NOTE: may be for testing
            rule_set: None,
            token_standard: mpl_token_metadata::state::TokenStandard::NonFungible,
            primary_sale_happened: false,
            seller_fee_basis_points: main_state.seller_fee_basis_points,
        };

        let ix = Create {
            mint: mint.key(),
            payer: admin.key(),
            authority: admin.key(),
            initialize_mint: false,
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
                mint.clone(),
                admin.clone(),
                // admin_ata,
                metadata.clone(),
                edition.clone(),
                main_state.to_account_info(),
                mpl_program.clone(),
                ata_program.clone(),
                token_program.clone(),
                system_program.clone(),
                sysvar_instructions.clone(),
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;

        Ok(())
    }

    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.profile.to_account_info();
        let admin = self.admin.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.collection.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        let collection_authority_record = self.collection_authority_record.to_account_info();
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

    pub fn approve_sub_collection_authority_to_main(&mut self) -> Result<()> {
        let mint = self.collection.to_account_info();
        let payer = self.admin.to_account_info();
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
