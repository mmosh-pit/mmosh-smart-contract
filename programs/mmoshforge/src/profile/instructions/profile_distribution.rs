use std::collections::HashMap;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::ID as MPL_ID;
use solana_program::program::{invoke, invoke_signed};

use crate::{
    _main::MainState,
    activation_token::ActivationTokenState,
    constants::{
        SEED_ACTIVATION_TOKEN_STATE, SEED_MAIN_STATE, SEED_PROFILE_STATE, SEED_VAULT,
        TOTAL_SELLER_BASIS_POINTS,
    },
    error::MyError,
    other_states::LineageInfo,
    profile_state::ProfileState,
    utils::{
        get_vault_pda, init_ata_if_needed, transfer_tokens,
        verify_collection_item_by_main,
    },
};

///MINT FakeID by activation_token
pub fn profile_distribution(
    ctx: Context<AProfileDistribution>
) -> Result<()> {
    {
        //NOTE: distribute project price
        ctx.accounts.distribute()?;
    }
    Ok(())
}



#[derive(Accounts)]
pub struct AProfileDistribution<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    ///CHECK:
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    ///CHECK:
    #[account(address = main_state.opos_token)]
    pub opos_token: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]

    pub main_state: Box<Account<'info, MainState>>,

    //NOTE: profile minting cost distribution account

    // Current profile holders
    ///CHECK:
    pub current_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    pub current_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    pub current_great_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    pub current_ggreat_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    pub current_genesis_profile_holder: AccountInfo<'info>,

    // Current Profile holder's opos token ata
    #[account(
        mut,
        token::mint = opos_token,
        token::authority = user,
        constraint= user_opos_ata.amount >= main_state.profile_minting_cost @ MyError::NotEnoughTokenToMint
    )]
    pub user_opos_ata: Box<Account<'info, TokenAccount>>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            parent_profile_holder_opos_ata.to_account_info(),
            current_parent_profile_holder.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
    )]
    // pub parent_profile_holder_opos_ata: Box<Account<'info, TokenAccount>>,
    pub parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            grand_parent_profile_holder_opos_ata.to_account_info(),
            current_grand_parent_profile_holder.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
    )]
    pub grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            great_grand_parent_profile_holder_opos_ata.to_account_info(),
            current_great_grand_parent_profile_holder.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
    )]
    pub great_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            ggreat_grand_parent_profile_holder_opos_ata.to_account_info(),
            current_ggreat_grand_parent_profile_holder.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
    )]
    pub ggreat_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    ///CHECK:
    #[account(
        mut,
        constraint = init_ata_if_needed(
            opos_token.to_account_info(),
            genesis_profile_holder_opos_ata.to_account_info(),
            current_genesis_profile_holder.to_account_info(),
            user.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            associated_token_program.to_account_info(),
        ) == Ok(())
    )]
    pub genesis_profile_holder_opos_ata: AccountInfo<'info>,
}

impl<'info> AProfileDistribution<'info> {
    pub fn distribute(&mut self) -> Result<()> {
        let user = self.user.to_account_info();
        // let user_profile_ata = self.user_profile_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let main_state = &mut self.main_state;



        // NOTE: minting cost distribution
        let sender_ata = self.user_opos_ata.to_account_info();
        let cost = main_state.profile_minting_cost;
        let minting_cost_distribution = main_state.minting_cost_distribution;


        let mut transfer_data = Vec::new();

        transfer_data.push(
            TransferModel{
               account_opos_ata: self
               .parent_profile_holder_opos_ata.to_account_info(),
               value: (cost as u128 * minting_cost_distribution.parent as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
                key: self
                .parent_profile_holder_opos_ata
                .to_account_info().key().to_string()
            }
        );

        let gparent = TransferModel{
            account_opos_ata: self
            .grand_parent_profile_holder_opos_ata.to_account_info(),
            value: (cost as u128 * minting_cost_distribution.grand_parent as u128
             / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
             key: self
             .grand_parent_profile_holder_opos_ata
             .to_account_info().key().to_string()
         };

         let gparent_index = get_transfer_index(transfer_data.clone(), gparent.clone().key);
        if gparent_index == -1 {
            transfer_data.push(gparent)
        } else {
            transfer_data[gparent_index as usize].value = transfer_data[gparent_index as usize].value + gparent.value;
        }


        let ggparent = TransferModel{
            account_opos_ata: self
            .great_grand_parent_profile_holder_opos_ata.to_account_info(),
            value: (cost as u128 * minting_cost_distribution.great_grand_parent as u128
             / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
             key: self
             .great_grand_parent_profile_holder_opos_ata
             .to_account_info().key().to_string()
         };

         let ggparent_index = get_transfer_index(transfer_data.clone(), ggparent.clone().key);
        if ggparent_index == -1 {
            transfer_data.push(ggparent.clone())
        } else {
            transfer_data[ggparent_index as usize].value = transfer_data[ggparent_index as usize].value + ggparent.clone().value;
        }


        let gggparent = TransferModel{
            account_opos_ata: self
            .ggreat_grand_parent_profile_holder_opos_ata.to_account_info(),
            value: (cost as u128 * minting_cost_distribution.ggreat_grand_parent as u128
             / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
             key: self
             .ggreat_grand_parent_profile_holder_opos_ata
             .to_account_info().key().to_string()
         };

        let gggparent_index = get_transfer_index(transfer_data.clone(), gggparent.clone().key);
        if gggparent_index == -1 {
            transfer_data.push(gggparent.clone())
        } else {
            transfer_data[gggparent_index as usize].value = transfer_data[gggparent_index as usize].value + gggparent.clone().value;
        }

        let gensis = TransferModel{
            account_opos_ata: self
            .genesis_profile_holder_opos_ata.to_account_info(),
            value: (cost as u128 * minting_cost_distribution.genesis as u128
             / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
             key: self
             .genesis_profile_holder_opos_ata
             .to_account_info().key().to_string()
         };

         let gensis_index = get_transfer_index(transfer_data.clone(), gensis.clone().key);
        if gensis_index == -1 {
            transfer_data.push(gensis.clone())
        } else {
            transfer_data[gensis_index as usize].value = transfer_data[gensis_index as usize].value + gensis.clone().value;
        }
        

        for transfer_item in transfer_data {
            transfer_tokens(
                sender_ata.to_account_info(),
                transfer_item.account_opos_ata.to_account_info(),
                user.to_account_info(),
                token_program.to_account_info(),
                transfer_item.value,
            )?;
        }

        Ok(())
    }

}



#[derive(Clone)]
pub struct TransferModel<'info> {
    pub account_opos_ata: AccountInfo<'info>,
    pub key: String,
    pub value: u64
}

pub fn get_transfer_index(datas: Vec<TransferModel>, key: String) -> i32 {
    let mut indexer = -1;
    for data in datas.into_iter().enumerate() {
       if data.1.key == key {
          indexer = data.0 as i32;
          break
       }
    }
    indexer
}