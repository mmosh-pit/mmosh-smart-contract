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
    activation_token::ActivationTokenState,
    constants::{SEED_ACTIVATION_TOKEN_STATE, SEED_MAIN_STATE, SEED_PEEP_STATE},
    error::MyError,
    other_states::LineageInfo,
    fake_id::{self, FakeIdState},
};

///MINT FakeID by activation_token
pub fn mint_fake_id_by_at(
    ctx: Context<AMintFakeIdByAt>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let activation_token_metadata = ctx.accounts.activation_token_metadata.to_account_info();
        let fake_id_state = &mut ctx.accounts.fake_id_state;
        let fake_id_metadata = ctx.accounts.fake_id_metadata.to_account_info();
        let parent_fake_id_state = &ctx.accounts.parent_fake_id_state;
        //verification
        main_state.verify_activation_token(&activation_token_metadata)?;
        main_state.verify_fake_id(&fake_id_metadata)?;
        //state changes
        fake_id_state.lineage.creator = ctx.accounts.user.key();
        //PERF: not sure about it require fake_id fake_id creator
        fake_id_state.lineage.parent = parent_fake_id_state.mint;
        fake_id_state.lineage.grand_parent = parent_fake_id_state.lineage.parent;
        fake_id_state.lineage.greate_grand_parent = parent_fake_id_state.lineage.grand_parent;
        fake_id_state.lineage.generation = fake_id_state.lineage.generation + 1;
        //TODO: update some main state if fiels are avaible (may be in future)
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
pub struct AMintFakeIdByAt<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    ///CHECK:
    pub user_activation_token_ata: AccountInfo<'info>,
    ///CHECK:
    pub user_presona_token_ata: AccountInfo<'info>,

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
    pub activation_token_collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            main_state.activation_token_collection_id.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub activation_token_collection_metadata: AccountInfo<'info>,

    // ///CHECK:
    // #[account(
    //     mut,
    //     seeds=[
    //         METADATA.as_ref(),
    //         MPL_ID.as_ref(),
    //         main_state.activation_token_collection_id.as_ref(),
    //     ],
    //     bump,
    //     seeds::program = MPL_ID
    // )]
    // pub activation_token_collection_edition: AccountInfo<'info>,

    ///CHECK:
    #[account(mut, signer)]
    pub fake_id: AccountInfo<'info>,

    #[account(
        init,
        payer =  user,
        seeds = [SEED_PEEP_STATE, fake_id.key().as_ref()],
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
        seeds = [SEED_PEEP_STATE, activation_token_state.parent_fake_id.as_ref()],
        bump,
    )]
    pub parent_fake_id_state: Box<Account<'info, FakeIdState>>,

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
}

impl<'info> AMintFakeIdByAt<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri: String) -> Result<()> {
        let mint = self.fake_id.to_account_info();
        let user = self.user.to_account_info();
        let user_presona_token_ata = self.user_presona_token_ata.to_account_info();
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
            creators: Some(vec![Creator {
                address: user.key(),
                verified: true,
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
            initialize_mint: true,
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
                print_supply: None,
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
        let metadata = self.activation_token_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let fake_id_collection = self.fake_id_collection.to_account_info();
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
                fake_id_collection_edition,
                system_program,
                token_program,
                mpl_program,
            ],
            &[&[SEED_MAIN_STATE, &[bump]]],
        )?;

        Ok(())
    }

    pub fn burn_activation_token(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let user_activation_token_ata = self.user_activation_token_ata.to_account_info();
        let activation_token_collection_metadata =
            self.activation_token_collection_metadata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let ata_program = self.ata_program.to_account_info();
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
            collection_metadata: Some(activation_token_collection_metadata.key()),
            edition: None,
            master_edition: None,
            token_record: None,
            edition_marker: None,
            master_edition_mint: None,
            master_edition_token: None,
            args: mpl_token_metadata::instruction::BurnArgs::V1 { amount: 1 },
        }
        .instruction();

        let (_, bump) = Pubkey::find_program_address(&[SEED_MAIN_STATE], program_id);
        invoke_signed(
            &ix,
            &[
                mint,
                user,
                user_activation_token_ata,
                activation_token_collection_metadata,
                system_program,
                token_program,
                mpl_program,
                ata_program,
                metadata,
                sysvar_instructions,
            ],
            &[&[SEED_MAIN_STATE, &[bump]]],
        )?;

        Ok(())
    }
}
