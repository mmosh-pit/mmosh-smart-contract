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
    state::{AssetData, Creator, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED},
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    collection_factory::CollectionState,
    constants::{SEED_COLLECTION_STATE, SEED_MAIN_STATE, SEED_PEEP_STATE},
    error::MyError,
    fake_id::{self, FakeIdState},
    other_states::LineageInfo,
};

///TODO: there should be
pub fn create_collection(
    ctx: Context<ACreateCollection>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    {
        let collection_state = &mut ctx.accounts.collection_state;
        collection_state.mint = ctx.accounts.collection.key();
    }
    {
        ctx.accounts.mint(name, symbol, uri)?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ACreateCollection<'info> {
    #[account(mut, address = main_state.owner @ MyError::OnlyOwnerCanCall)]
    pub owner: Signer<'info>,

    ///CHECK:
    pub owner_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        init,
        payer = owner,
        seeds = [SEED_COLLECTION_STATE, collection.key().as_ref()],
        bump,
        space = 8 + CollectionState::MAX_SIZE
    )]
    pub collection_state: Box<Account<'info, CollectionState>>,

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
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> ACreateCollection<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.collection.to_account_info();
        let mint_owner = self.owner.to_account_info();
        let ata = self.owner_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.collection_metadata.to_account_info();
        let edition = self.collection_edition.to_account_info();
        let ata_program = self.ata_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            //TODO: may be require to add parent collection info
            // collection: Some(mpl_token_metadata::state::Collection {
            //     verified: false,
            //     key: self.parent_collection.key(),
            // }),
            collection: None,
            uses: None,
            creators: Some(vec![Creator {
                address: mint_owner.key(),
                verified: true,
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
            payer: mint_owner.key(),
            authority: main_state.key(),
            initialize_mint: true,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: main_state.key(),
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
                mint_owner,
                ata,
                metadata,
                edition,
                mpl_program,
                ata_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
        )?;

        Ok(())
    }

    // /// collection verification for created activation token
    // pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
    //     let mint = self.collection.to_account_info();
    //     let user = self.owner.to_account_info();
    //     let system_program = self.system_program.to_account_info();
    //     let token_program = self.token_program.to_account_info();
    //     let mpl_program = self.mpl_program.to_account_info();
    //     let metadata = self.collection_metadata.to_account_info();
    //     let main_state = &mut self.main_state;
    //     let parent_collection = self.parent_collection.to_account_info();
    //     let parent_collection_metadata = self.parent_collection_metadata.to_account_info();
    //     let parent_collection_edition = self.parent_collection_edition.to_account_info();
    //
    //     let ix = verify_sized_collection_item(
    //         mpl_program.key(),
    //         metadata.key(),
    //         main_state.key(),
    //         user.key(),
    //         mint.key(),
    //         parent_collection.key(),
    //         parent_collection_edition.key(),
    //         None,
    //     );
    //
    //     let (_, bump) = Pubkey::find_program_address(&[SEED_MAIN_STATE], program_id);
    //     invoke_signed(
    //         &ix,
    //         &[
    //             mint,
    //             user,
    //             metadata,
    //             main_state.to_account_info(),
    //             parent_collection,
    //             parent_collection_metadata,
    //             parent_collection_edition,
    //             system_program,
    //             token_program,
    //             mpl_program,
    //         ],
    //         &[&[SEED_MAIN_STATE, &[bump]]],
    //     )?;
    //
    //     Ok(())
    // }
}
