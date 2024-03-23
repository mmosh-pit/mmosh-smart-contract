use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{builders::Create, verify_sized_collection_item, InstructionBuilder},
    state::{
        AssetData, Creator, PrintSupply, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED
    },
    ID as MPL_ID,
};
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    coins::CoinTokenState,
    constants::SEED_MAIN_STATE,
    error::MyError,
    utils::init_ata_if_needed,
};

pub fn init_coin_token(
    ctx: Context<AInitCoinToken>,
    name: String,
    symbol: String,
    uri: String,
    amount: u64
) -> Result<()> {
    {
        //NOTE: minting
        ctx.accounts.init_token(name, symbol, uri, amount)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct AInitCoinToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    ///CHECK:
    #[account(mut)]
    pub user_coin_token_ata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    ///CHECK:
    #[account(mut, signer)]
    pub coin_token: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            coin_token.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub coin_token_metadata: AccountInfo<'info>,


    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AInitCoinToken<'info> {
    pub fn init_token(
        &mut self,
        name: String,
        symbol: String,
        uri: String,
        amount: u64
    ) -> Result<()> {
        let mint = self.coin_token.to_account_info();
        let user = self.user.to_account_info();
        let user_coin_token_ata = self.user_coin_token_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.coin_token_metadata.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let ata_program = self.associated_token_program.to_account_info();
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
                    address: main_state.key(),
                    verified: true,
                    share: 0,
                },
                Creator {
                    address: user.key(),
                    verified: false,
                    share: 100,
                },
            ]),
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
            authority: main_state.key(),
            initialize_mint: true,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: main_state.key(),
            spl_token_program: token_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            update_authority_as_signer: true,
            master_edition: None,
            args: mpl_token_metadata::instruction::CreateArgs::V1 {
                asset_data,
                decimals: Some(9),
                print_supply: Some(PrintSupply::Unlimited),
            },
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                mint.to_account_info(),
                user.to_account_info(),
                user_coin_token_ata.to_account_info(),
                main_state.to_account_info(),
                metadata,
                mpl_program,
                token_program.to_account_info(),
                system_program.to_account_info(),
                sysvar_instructions,
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;

        //Minting tokens
        init_ata_if_needed(
            mint.to_account_info(),
            user_coin_token_ata.to_account_info(),
            user.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program,
            self.associated_token_program.to_account_info(),
        )?;

        let cpi_accounts = MintTo {
            authority: main_state.to_account_info(),
            mint: mint.to_account_info(),
            to: user_coin_token_ata.to_account_info(),
        };
        token::mint_to(
            CpiContext::new_with_signer(
                token_program,
                cpi_accounts,
                &[&[SEED_MAIN_STATE, &[main_state._bump]]],
            ),
            amount,
        )?;
        
        Ok(())
    }

}
