use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{builders::Create, verify_sized_collection_item, InstructionBuilder},
    state::{AssetData, Creator, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED},
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    activation_token::ActivationTokenState,
    constants::{SEED_ACTIVATION_TOKEN_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE},
    error::MyError,
    other_states::LineageInfo,
    fake_id::{self, FakeIdState},
};

pub fn mint_activation_token(ctx: Context<AMintActivationToken>) -> Result<()> {
    {
        //NOTE: setup and validation
        let main_state = &mut ctx.accounts.main_state;
        let activation_token_metadata = ctx.accounts.activation_token_metadata.to_account_info();
        let activation_token_state = &mut ctx.accounts.activation_token_state;
        let fake_id_metadata = ctx.accounts.fake_id_metadata.to_account_info();
        // let fake_id_state = &ctx.accounts.fake_id_state;

        //verification
        main_state.verify_activation_token(&activation_token_metadata)?;
        main_state.verify_profile(&fake_id_metadata)?;
        //state changes
        activation_token_state.parent_fake_id = ctx.accounts.fake_id.key();
        //TODO: update some main state if fiels are avaible (may be in future)
    }
    {
        //NOTE: minting
        ctx.accounts.mint()?;
    }
    {
        //NOTE: created mint collection verifiaction
        ctx.accounts.verify_collection_item(ctx.program_id)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AMintActivationToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    ///CHECK:
    pub user_activation_token_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub activation_token: AccountInfo<'info>,

    #[account(
        init,
        payer= user,
        seeds = [SEED_ACTIVATION_TOKEN_STATE,activation_token.key().as_ref()],
        bump,
        space = 8 + ActivationTokenState::MAX_SIZE,
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
    #[account(mut, address = main_state.activation_token_collection_id)]
    pub activation_token_collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            main_state.activation_token_collection_id.as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub activation_token_collection_edition: AccountInfo<'info>,

    #[account(address = main_state.genesis_fake_id)]
    pub fake_id: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE,fake_id.key().as_ref()],
        bump,
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
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub ata_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AMintActivationToken<'info> {
    pub fn mint(&mut self) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let user_activation_token_ata = self.user_activation_token_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.activation_token_metadata.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let ata_program = self.ata_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        let name = String::from("Activation Token");
        let symbol = String::from("AT");
        let uri = String::from("");

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            collection: Some(mpl_token_metadata::state::Collection {
                verified: false,
                key: main_state.activation_token_collection_id,
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
            token_standard: mpl_token_metadata::state::TokenStandard::Fungible,
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
            master_edition: None,
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
                user_activation_token_ata,
                metadata,
                mpl_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
        )?;

        Ok(())
    }

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.activation_token_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let activation_token_collection = self.activation_token_collection.to_account_info();
        let activation_token_collection_edition =
            self.activation_token_collection_edition.to_account_info();

        let ix = verify_sized_collection_item(
            mpl_program.key(),
            metadata.key(),
            main_state.key(),
            user.key(),
            mint.key(),
            activation_token_collection.key(),
            activation_token_collection_edition.key(),
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
                activation_token_collection,
                activation_token_collection_edition,
                system_program,
                token_program,
                mpl_program,
            ],
            &[&[SEED_MAIN_STATE, &[bump]]],
        )?;

        Ok(())
    }
}
