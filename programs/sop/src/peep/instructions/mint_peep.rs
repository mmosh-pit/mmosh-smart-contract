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
    constants::{SEED_MAIN_STATE, SEED_PEEP_STATE},
    error::MyError,
    other_states::LineageInfo,
    peep::PeepState,
    utils::verify_collection_item_by_main,
};

pub fn mint_peep(ctx: Context<AMintPeep>, name: String, symbol: String, uri: String) -> Result<()> {
    // let mut nft_creators = Vec::<Creator>::new();
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let peep_state = &mut ctx.accounts.peep_state;
        let peep_metadata = ctx.accounts.peep_metadata.to_account_info();
        let parent_peep_state = &mut ctx.accounts.parent_peep_state;
        let parent_peep_metadata = ctx.accounts.parent_peep_metadata.to_account_info();
        //verification

        //state changes
        peep_state.lineage.creator = ctx.accounts.user.key();
        peep_state.lineage.parent = parent_peep_state.mint;
        peep_state.lineage.grand_parent = parent_peep_state.lineage.parent;
        peep_state.lineage.greate_grand_parent = parent_peep_state.lineage.grand_parent;
        peep_state.lineage.generation = parent_peep_state.lineage.generation + 1;
        parent_peep_state.lineage.total_child += 1;
        // current_lineage = peep_state.lineage;

        //TODO: update some main state if fiels are avaible (may be in future)
        main_state.total_minted_peep += 1;
        // main_state.reload()?;
        // peep_state.reload()?;
        // parent_peep_state.reload()?;

        //NOTE: Royalty Distribution
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
pub struct AMintPeep<'info> {
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
    pub peep: AccountInfo<'info>,

    #[account(
        init,
        payer =  user,
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

    #[account(
        mut,
        seeds = [SEED_PEEP_STATE, parent_peep_state.mint.as_ref()],
        bump,
    )]
    pub parent_peep_state: Box<Account<'info, PeepState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            parent_peep_state.mint.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_peep_metadata: AccountInfo<'info>,
    ///TODO: peep checking later included

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

    //PERF: not sure parent peep nft collection verification are require or not (think it
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
    // //USDC receivers
    // #[account(mut)]
    // pub parent_nft_royalty_vault: AccountInfo<'info>,
    //
    // #[account(
    //     mut,
    //     token::mint = parent_peep_state.mint,
    //     constraint = pfid_parent_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    // )]
    // pub pfid_parent_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,
    //
    // #[account(
    //     mut,
    //     token::mint = parent_peep_state.mint,
    //     constraint = pfid_gparent_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    // )]
    // pub pfid_gparent_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,
    //
    // #[account(
    //     mut,
    //     token::mint = parent_peep_state.mint,
    //     constraint = pfid_uncle_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    // )]
    // pub pfid_uncle_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,
}

impl<'info> AMintPeep<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.peep.to_account_info();
        let user = self.user.to_account_info();
        let user_ata = self.user_ata.to_account_info();
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
                key: self.collection.key(),
            }),
            uses: None,
            creators: Some(vec![]),
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
                user,
                user_ata,
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
        let user = self.user.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.peep_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.collection.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();

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
