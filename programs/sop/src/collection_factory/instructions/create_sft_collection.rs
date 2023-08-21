use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        approve_collection_authority,
        builders::{Burn, Create},
        verify_sized_collection_item, InstructionBuilder,
    },
    state::{
        AssetData, CollectionDetails, Creator, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA,
        TOKEN_RECORD_SEED,
    },
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

///TODO: there should be
pub fn create_sft_collection(
    ctx: Context<ACreateSftCollection>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    {
        // Setup
        let collection_id = ctx.accounts.collection.key();
        ctx.accounts.main_state.profile_collection = collection_id;
        ctx.accounts.collection_state.collection_id = collection_id;
    }
    {
        ctx.accounts.mint(name, symbol, uri)?;
    }
    {
        ctx.accounts.approve_collection_authority_to_main()?;
    }
    {
        //TODO: creator verification
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ACreateSftCollection<'info> {
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
    pub collection: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = collection,
        token::authority = admin,
        constraint = admin_ata.amount == 1,
    )]
    pub admin_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = admin,
        seeds = [SEED_COLLECTION_STATE, collection.key().as_ref()],
        bump,
        space = 8 + CollectionState::MAX_SIZE
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
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> ACreateSftCollection<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.collection.to_account_info();
        let payer = self.admin.to_account_info();
        let ata = self.admin_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.collection_metadata.to_account_info();
        let edition = self.collection_edition.to_account_info();
        let ata_program = self.associated_token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            collection: None,
            uses: None,
            creators: Some(vec![
                Creator {
                    address: payer.key(),
                    //TODO: may be require to invoke another instruction to flip the bool
                    // verified: true,
                    verified: false,
                    share: 100,
                },
                // Creator {
                //     address: main_state.key(),
                //     //TODO: may be require to invoke another instruction to flip the bool
                //     // verified: true,
                //     verified: false,
                //     share: 10,
                // },
            ]),
            collection_details: Some(CollectionDetails::V1 { size: 0 }),
            // collection_details: None,
            is_mutable: true,
            rule_set: None,
            token_standard: mpl_token_metadata::state::TokenStandard::NonFungible,
            primary_sale_happened: false,
            seller_fee_basis_points: main_state.seller_fee_basis_points,
        };

        let ix = Create {
            mint: mint.key(),
            payer: payer.key(),
            authority: payer.key(),
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
                print_supply: Some(mpl_token_metadata::state::PrintSupply::Zero),
            },
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                mint,
                payer,
                ata,
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

    //Set up collection authority to main_state
    pub fn approve_collection_authority_to_main(&mut self) -> Result<()> {
        let mint = self.collection.to_account_info();
        let payer = self.admin.to_account_info();
        let system_program = self.system_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.collection_metadata.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;
        let collection_authority_record = self.collection_authority_record.to_account_info();

        let ix = approve_collection_authority(
            mpl_program.key(),
            collection_authority_record.key(),
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
                collection_authority_record,
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
