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
    other_states::LineageInfo,
    peep::PeepState,
    utils::verify_collection_item_by_main,
};

pub fn mint_genesis_peep(
    ctx: Context<AMintGenesisPeep>,
    name: String,
    symbol: String,
    uri: String,
    lineage: LineageInfo,
) -> Result<()> {
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let peep_state = &mut ctx.accounts.peep_state;
        let collection_state = &mut ctx.accounts.peep_collection_state;
        //verification
        require!(
            !collection_state.is_genesis_peep_init,
            MyError::GenesisNftAlreadyMinted
        );
        //state changes
        //may me all lineage information might be same
        peep_state.mint = ctx.accounts.peep.key();
        peep_state.lineage.creator = lineage.creator;
        peep_state.lineage.parent = lineage.parent;
        peep_state.lineage.grand_parent = lineage.grand_parent;
        peep_state.lineage.greate_grand_parent = lineage.greate_grand_parent;
        peep_state.lineage.uncle_psy = lineage.uncle_psy;
        peep_state.lineage.generation = 1;

        main_state.total_minted_peep += 1;
        collection_state.is_genesis_peep_init = true;
        collection_state.genesis_peep = ctx.accounts.peep.key();
    }
    {
        //NOTE: minting
        ctx.accounts.mint(name, symbol, uri)?;
    }
    {
        //NOTE: created mint collection verifiaction
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintGenesisPeep<'info> {
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
    pub peep: AccountInfo<'info>,

    #[account(
        init,
        payer =  owner,
        seeds = [SEED_PEEP_STATE, peep.key().as_ref()],
        bump,
        space= 8 + PeepState::MAX_SIZE
    )]
    pub peep_state: Box<Account<'info, PeepState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            peep.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub peep_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            peep.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub peep_edition: AccountInfo<'info>,

    ///CHECK:
    #[account(mut)]
    pub peep_collection: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_COLLECTION_STATE, peep_collection.key().as_ref()],
        bump,
    )]
    pub peep_collection_state: Box<Account<'info, CollectionState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            peep_collection.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub peep_collection_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            peep_collection.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub peep_collection_edition: AccountInfo<'info>,

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

impl<'info> AMintGenesisPeep<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.peep.to_account_info();
        let owner = self.owner.to_account_info();
        let owner_ata = self.owner_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.peep_metadata.to_account_info();
        let edition = self.peep_edition.to_account_info();
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
                key: self.peep_collection.key(),
            }),
            uses: None,
            creators: Some(vec![Creator {
                address: owner.key(),
                share: 100,
                verified: true,
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
            payer: owner.key(),
            authority: owner.key(),
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
                print_supply: None,
            },
        }
        .instruction();

        invoke(
            &ix,
            &[
                mint,
                owner,
                owner_ata,
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

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.peep.to_account_info();
        let user = self.owner.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.peep_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.peep_collection.to_account_info();
        let collection_metadata = self.peep_collection_metadata.to_account_info();
        let collection_edition = self.peep_collection_edition.to_account_info();

        verify_collection_item_by_main(
            mint,
            metadata,
            collection,
            collection_metadata,
            collection_edition,
            user,
            main_state,
            mpl_program,
            system_program,
        )?;

        Ok(())
    }
}
