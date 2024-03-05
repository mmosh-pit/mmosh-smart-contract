use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::instruction::{CollectionDetailsToggle, RuleSetToggle, UpdateArgs, UsesToggle};
use mpl_token_metadata::{
    instruction::{
        approve_collection_authority,
        builders::Update,
        verify_sized_collection_item, InstructionBuilder, UpdateMetadataAccountArgsV2,
    },
    state::{
        AssetData, Collection, CollectionDetails, Creator, Data, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED
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
    other_states::LineageInfo, utils::verify_collection_item_by_main,
};

pub fn update_collection(
    ctx: Context<AUpdateCollection>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    {
        ctx.accounts.update(name, symbol, uri)?;
    }
    
    {
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct AUpdateCollection<'info> {
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
    )]
    pub collection: Box<Account<'info, Mint>>,

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
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(mut)]
    pub parent_collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            parent_collection.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_collection_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            parent_collection.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_collection_edition: AccountInfo<'info>,
    

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> AUpdateCollection<'info> {
    pub fn update(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.collection.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        let main_state = self.main_state.clone();
        let system_program = self.system_program.clone().to_account_info();
    
        let ata_program =  self.associated_token_program.to_account_info();
        let mpl_program =  self.mpl_program.to_account_info();
    
        let payer = self.admin.to_account_info();
    
        let token_program = self.token_program.to_account_info();
    
        let data_vtwo = Data {
                    name,
                    symbol,
                    uri,
                    seller_fee_basis_points: main_state.seller_fee_basis_points,
                    creators: Some(vec![
                        Creator {
                            address: payer.key(),

                            // verified: true,
                            verified: false,
                            share: 100,
                        }
                    ]),
        };
    
        let data = UpdateArgs::V1 { new_update_authority: None, data: Some(data_vtwo), primary_sale_happened: None, is_mutable: None, collection: mpl_token_metadata::instruction::CollectionToggle::Set(mpl_token_metadata::state::Collection {
            verified: false,
            key: self.parent_collection.key(),
        }), collection_details: CollectionDetailsToggle::None, uses: UsesToggle::None, rule_set: RuleSetToggle::None, authorization_data: None };
    
        let ix = Update {
           mint: mint.key(),
           metadata: collection_metadata.key(),
           edition: Some(collection_edition.key()),
           token: None,
           payer: payer.key(),
           args: data,
           authority: main_state.key(),
           delegate_record: None,
           authorization_rules: None,
           authorization_rules_program: None,
           system_program: system_program.key(),
           sysvar_instructions: self.sysvar_instructions.clone().key()
        }.instruction();
    
    
        invoke_signed(&ix, &[
            mint,
            payer,
            collection_metadata,
            collection_edition,
            mpl_program,
            ata_program,
            token_program,
            system_program,
            self.sysvar_instructions.clone(),
            main_state.to_account_info(),
            ], &[&[SEED_MAIN_STATE, &[main_state._bump]]],)?;
    

        Ok(())
    }

    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.collection_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.parent_collection.to_account_info();
        let collection_metadata = self.parent_collection_metadata.to_account_info();
        let collection_edition = self.parent_collection_edition.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        verify_collection_item_by_main(
            metadata,
            collection,
            collection_metadata,
            collection_edition,
            main_state,
            mpl_program,
            system_program,
            sysvar_instructions,
        )?;
        Ok(())
    }
}
