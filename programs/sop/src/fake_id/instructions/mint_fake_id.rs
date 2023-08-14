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
    constants::{SEED_PROFILE_STATE, SEED_MAIN_STATE},
    error::MyError,
    fake_id::{self, FakeIdState},
    other_states::LineageInfo,
};

pub fn mint_fake_id(
    ctx: Context<AMintFakeId>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let mut nft_creators = Vec::<Creator>::new();
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let fake_id_state = &mut ctx.accounts.fake_id_state;
        let fake_id_metadata = ctx.accounts.fake_id_metadata.to_account_info();
        let parent_fake_id_state = &mut ctx.accounts.parent_fake_id_state;
        let parent_fake_id_metadata = ctx.accounts.parent_fake_id_metadata.to_account_info();
        //verification
        main_state.verify_fake_id(&fake_id_metadata)?;
        main_state.verify_fake_id(&parent_fake_id_metadata)?;
        //state changes
        fake_id_state.lineage.creator = ctx.accounts.user.key();
        fake_id_state.lineage.parent = parent_fake_id_state.mint;
        fake_id_state.lineage.grand_parent = parent_fake_id_state.lineage.parent;
        fake_id_state.lineage.greate_grand_parent = parent_fake_id_state.lineage.grand_parent;
        fake_id_state.lineage.generation = parent_fake_id_state.lineage.generation + 1;
        parent_fake_id_state.lineage.total_child += 1;
        // current_lineage = fake_id_state.lineage;

        //TODO: update some main state if fiels are avaible (may be in future)
        main_state.total_minted_fake_id += 1;
        // main_state.reload()?;
        // fake_id_state.reload()?;
        // parent_fake_id_state.reload()?;

        //NOTE: Royalty Distribution
    }
    {
        //NOTE: minting
        ctx.accounts.mint(name, symbol, uri, nft_creators)?;
    }
    {
        //NOTE: created mint collection verifiaction
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintFakeId<'info> {
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
    pub fake_id: AccountInfo<'info>,

    #[account(
        init,
        payer =  user,
        seeds = [SEED_PROFILE_STATE, fake_id.key().as_ref()],
        bump,
        space= 8 + FakeIdState::MAX_SIZE
    )]
    pub fake_id_state: Box<Account<'info, FakeIdState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            fake_id.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub fake_id_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            fake_id.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub fake_id_edition: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, parent_fake_id_state.mint.as_ref()],
        bump,
    )]
    pub parent_fake_id_state: Box<Account<'info, FakeIdState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            parent_fake_id_state.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub parent_fake_id_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(mut, address = main_state.fake_id_collection_id)]
    pub fake_id_collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            main_state.fake_id_collection_id.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub fake_id_collection_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            main_state.fake_id_collection_id.as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub fake_id_collection_edition: AccountInfo<'info>,

    //PERF: not sure parent fake_id nft collection verification are require or not (think it
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

    //USDC receivers
    #[account(
        mut,
        token::mint = parent_fake_id_state.mint,
        constraint = pfid_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    )]
    pub pfid_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = parent_fake_id_state.mint,
        constraint = pfid_parent_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    )]
    pub pfid_parent_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = parent_fake_id_state.mint,
        constraint = pfid_gparent_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    )]
    pub pfid_gparent_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = parent_fake_id_state.mint,
        constraint = pfid_uncle_nft_holder_usdc_ata.amount == 1 @ MyError::InvalidNftHolder,
    )]
    pub pfid_uncle_nft_holder_usdc_ata: Box<Account<'info, TokenAccount>>,
}

impl<'info> AMintFakeId<'info> {
    pub fn mint(
        &mut self,
        name: String,
        symbol: String,
        uri: String,
        creators: Vec<Creator>,
    ) -> Result<()> {
        let mint = self.fake_id.to_account_info();
        let user = self.user.to_account_info();
        let user_ata = self.user_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.fake_id_metadata.to_account_info();
        let edition = self.fake_id_edition.to_account_info();
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
                key: main_state.fake_id_collection_id,
            }),
            uses: None,
            creators: Some(creators),
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
        let mint = self.fake_id.to_account_info();
        let user = self.user.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.fake_id_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let fake_id_collection = self.fake_id_collection.to_account_info();
        let fake_id_collection_metadata= self.fake_id_collection_metadata.to_account_info();
        let fake_id_collection_edition = self.fake_id_collection_edition.to_account_info();

        let ix = verify_sized_collection_item(
            mpl_program.key(),
            metadata.key(),
            main_state.key(),
            user.key(),
            mint.key(),
            fake_id_collection.key(),
            fake_id_collection_edition.key(),
            None,
        );

        let (_, bump) = Pubkey::find_program_address(&[SEED_MAIN_STATE], program_id);
        invoke_signed(
            &ix,
            &[
                mint,
                user,
                metadata,
                main_state.to_account_info(),
                fake_id_collection,
                fake_id_collection_metadata,
                fake_id_collection_edition,
                system_program,
                token_program,
                mpl_program,
            ],
            &[&[SEED_MAIN_STATE, &[bump]]],
        )?;

        Ok(())
    }
}
