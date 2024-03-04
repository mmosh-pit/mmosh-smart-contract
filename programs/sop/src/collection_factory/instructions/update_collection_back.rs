use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use mpl_token_metadata::state::Data;
use mpl_token_metadata::{state::DataV2, ID};
use mpl_token_metadata::instruction::{CollectionDetailsToggle, RuleSetToggle, UpdateArgs, UsesToggle};
use mpl_token_metadata::instruction::builders::Update;
use std::ops::Deref;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        approve_collection_authority, builders::{Burn, Create}, update_metadata_accounts_v2, verify_sized_collection_item, InstructionBuilder, UpdateMetadataAccountArgsV2
    },
    state::{
        AssetData, Collection, CollectionDetails, Creator, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED
    },
    ID as MPL_ID,
};
use solana_program::program::invoke;

use crate::{
    _main::MainState, collection_factory::CollectionState, constants::{SEED_COLLECTION_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE}, error::MyError, fake_id::{self, FakeIdState}, other_states::LineageInfo, utils::verify_collection_item_by_main
};

pub fn update_collection(
    ctx: Context<UpdateMetadataAccountsV2>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let mint = ctx.accounts.collection.to_account_info();
    let collection_metadata = ctx.accounts.collection_metadata.to_account_info();
    let collection_edition = ctx.accounts.collection_edition.to_account_info();
    let main_state = ctx.accounts.main_state.clone();
    let system_program = ctx.accounts.system_program.clone().to_account_info();

    let ata_program =  ctx.accounts.associated_token_program.to_account_info();
    let mpl_program =  ctx.accounts.mpl_program.to_account_info();
    let mpl_program = ctx.accounts.mpl_program.to_account_info();

    let payer = ctx.accounts.admin.to_account_info();

    let token_program = ctx.accounts.token_program.to_account_info();

    let data_vtwo = Data {
                name,
                symbol,
                uri,
                seller_fee_basis_points: main_state.seller_fee_basis_points,
                creators: Some(vec![
                    Creator {
                        address: payer.key(),
                        //TODO: may be require to invoke another instruction to flip the bool
                        // verified: true,
                        verified: false,
                        share: 100,
                    }
                ]),
    };

    let data = UpdateArgs::V1 { new_update_authority: None, data: Some(data_vtwo), primary_sale_happened: None, is_mutable: None, collection: mpl_token_metadata::instruction::CollectionToggle::Set(mpl_token_metadata::state::Collection {
        verified: false,
        key: ctx.accounts.parent_collection.key(),
    }), collection_details: CollectionDetailsToggle::None, uses: UsesToggle::None, rule_set: RuleSetToggle::None, authorization_data: None };

    // let ix = Update{
    //     payer_info: &ctx.accounts.admin.to_account_info(),
        
    // }.instructions();

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
       sysvar_instructions: ctx.accounts.sysvar_instructions.clone().key()
    }.instruction();

    
    // let ix = mpl_token_metadata::instruction::update_metadata_accounts_v2(
    //     ID,
    //     *ctx.accounts.collection_metadata.key,
    //     *ctx.accounts.update_authority.key,
    //     None,
    //     Some(DataV2 {
    //         name,
    //         symbol,
    //         uri,
    //         seller_fee_basis_points: main_state.seller_fee_basis_points,
    //         creators: None,
    //         collection: None,
    //         uses: None
    //     }),
    //     None,
    //     None,
    // );

    invoke_signed(&ix, &[
        mint,
        payer,
        collection_metadata,
        collection_edition,
        mpl_program,
        ata_program,
        token_program,
        system_program,
        ctx.accounts.sysvar_instructions.clone(),
        main_state.to_account_info(),
        ], &[&[SEED_MAIN_STATE, &[main_state._bump]]],)?;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMetadataAccountsV2<'info> {
    #[account(mut, address = main_state.owner @ MyError::OnlyOwnerCanCall)]
    pub admin: Signer<'info>,

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
    
    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

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

}