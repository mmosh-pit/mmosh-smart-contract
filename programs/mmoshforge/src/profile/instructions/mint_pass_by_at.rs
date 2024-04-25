use std::collections::HashMap;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instructions::{
        ApproveCollectionAuthority, Create, CreateBuilder, Verify, VerifyInstructionArgs
    },
    types::{CreateArgs, Creator},
    ID as MPL_ID,
};
use solana_address_lookup_table_program::{
    instruction::{create_lookup_table, extend_lookup_table, freeze_lookup_table},
    ID as ADDRESS_LOOKUP_TABLE_PROGRAM,
};
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

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct MintPassByAtInput {
    pub name: String,
    pub symbol: String,
    // pub uri: String,
    pub uri_hash: String,
}

///MINT FakeID by activation_token
pub fn mint_pass_by_at(
    ctx: Context<AMintPassByAt>,
    name: Box<String>,
    symbol: Box<String>,
    uri_hash: Box<String>,
) -> Result<()> {
    let name = *name;
    let symbol = *symbol;
    let uri_hash = *uri_hash;
    {
        let user = ctx.accounts.user.to_account_info();
        let main_state = &mut ctx.accounts.main_state;
        let profile_state = &mut ctx.accounts.profile_state;
        let parent_profile_state = &mut ctx.accounts.parent_profile_state;
        // let parent_profile_metadata = ctx.accounts.parent_profile_metadata.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();


        //state changes
        profile_state.mint = ctx.accounts.profile.key();
        profile_state.lineage.creator = ctx.accounts.user.key();
        profile_state.lineage.parent = parent_profile_state.mint;
        profile_state.lineage.grand_parent = parent_profile_state.lineage.parent;
        profile_state.lineage.great_grand_parent = parent_profile_state.lineage.grand_parent;
        profile_state.lineage.ggreat_grand_parent = parent_profile_state.lineage.great_grand_parent;
        profile_state.lineage.generation = parent_profile_state.lineage.generation + 1;
        parent_profile_state.lineage.total_child += 1;
    }
    {
        //NOTE: minting
        ctx.accounts.mint(name, symbol, uri_hash)?;
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
#[instruction(
    name: Box<String>,
    symbol: Box<String>,
    uri: Box<String>,
)]
pub struct AMintPassByAt<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    ///CHECK:
    #[account(address = main_state.opos_token)]
    pub opos_token: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        token::mint = activation_token,
        token::authority = user,
        constraint = user_activation_token_ata.amount >= 1 @ MyError::ActivationTokenNotFound,
    )]
    pub user_activation_token_ata: Box<Account<'info, TokenAccount>>,

    ///CHECK:
    pub project: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [SEED_MAIN_STATE, project.key().as_ref()],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub parent_main_state: Box<Account<'info, MainState>>,


    #[account(mut)]
    pub activation_token: Box<Account<'info, Mint>>,

    ///CHECK:
    #[account(
        init,
        signer,
        payer = user,
        mint::decimals = 0,
        mint::authority = user,
        mint::freeze_authority = user,
    )]
    pub profile: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = user,
        associated_token::mint = profile,
        associated_token::authority = user,
    )]
    pub user_profile_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer =  user,
        seeds = [SEED_PROFILE_STATE, profile.key().as_ref()],
        bump,
        space= 8 + ProfileState::MAX_SIZE
    )]
    pub profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            "metadata".as_bytes(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_metadata: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            "metadata".as_bytes(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
            "edition".as_bytes(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_edition: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, parent_profile.key().as_ref()],
        bump,
    )]
    pub parent_profile_state: Box<Account<'info, ProfileState>>,

    ///CHECK: //PERF:
    #[account(mut)]
    pub collection: AccountInfo<'info>,

    ///CHECK:
    #[account(
        mut,
        seeds=[
            "metadata".as_bytes(),
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
            "metadata".as_bytes(),
            MPL_ID.as_ref(),
            collection.key().as_ref(),
            "edition".as_bytes(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub collection_edition: AccountInfo<'info>,

    ///CHECK:
    // #[account(address = ADDRESS_LOOKUP_TABLE_PROGRAM)]
    // pub address_lookup_table_program: AccountInfo<'info>,

    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    //NOTE: profile minting cost distribution account
    // #[account(address = activation_token_state.parent_profile @ MyError::ProfileIdMissMatch)]
    pub parent_profile: Box<Account<'info, Mint>>,


    //NOTE: profile minting cost distribution account

    // Current profile holders
    // ///CHECK:
    // pub current_parent_profile_holder: AccountInfo<'info>,
    // ///CHECK:
    // pub current_grand_parent_profile_holder: AccountInfo<'info>,
    // ///CHECK:
    // pub current_great_grand_parent_profile_holder: AccountInfo<'info>,
    // ///CHECK:
    // pub current_ggreat_grand_parent_profile_holder: AccountInfo<'info>,
    // ///CHECK:
    // pub current_genesis_profile_holder: AccountInfo<'info>,

    // // Current Profile holder's opos token ata
    // #[account(
    //     mut,
    //     token::mint = opos_token,
    //     token::authority = user,
    //     constraint= user_opos_ata.amount >= main_state.profile_minting_cost @ MyError::NotEnoughTokenToMint
    // )]
    // pub user_opos_ata: Box<Account<'info, TokenAccount>>,
    // ///CHECK:
    // #[account(
    //     mut,
    //     constraint = init_ata_if_needed(
    //         opos_token.to_account_info(),
    //         parent_profile_holder_opos_ata.to_account_info(),
    //         current_parent_profile_holder.to_account_info(),
    //         user.to_account_info(),
    //         token_program.to_account_info(),
    //         system_program.to_account_info(),
    //         associated_token_program.to_account_info(),
    //     ) == Ok(())
    //     // token::mint = opos_token,
    //     // token::authority = current_parent_profile_holder,
    // )]
    // // pub parent_profile_holder_opos_ata: Box<Account<'info, TokenAccount>>,
    // pub parent_profile_holder_opos_ata: AccountInfo<'info>,
    // ///CHECK:
    // #[account(
    //     mut,
    //     constraint = init_ata_if_needed(
    //         opos_token.to_account_info(),
    //         grand_parent_profile_holder_opos_ata.to_account_info(),
    //         current_grand_parent_profile_holder.to_account_info(),
    //         user.to_account_info(),
    //         token_program.to_account_info(),
    //         system_program.to_account_info(),
    //         associated_token_program.to_account_info(),
    //     ) == Ok(())
    //     // token::mint = opos_token,
    //     // token::authority = current_grand_parent_profile_holder,
    // )]
    // pub grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    // ///CHECK:
    // #[account(
    //     mut,
    //     constraint = init_ata_if_needed(
    //         opos_token.to_account_info(),
    //         great_grand_parent_profile_holder_opos_ata.to_account_info(),
    //         current_great_grand_parent_profile_holder.to_account_info(),
    //         user.to_account_info(),
    //         token_program.to_account_info(),
    //         system_program.to_account_info(),
    //         associated_token_program.to_account_info(),
    //     ) == Ok(())
    //     // token::mint = opos_token,
    //     // token::authority = current_great_grand_parent_profile_holder,
    // )]
    // pub great_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    // ///CHECK:
    // #[account(
    //     mut,
    //     constraint = init_ata_if_needed(
    //         opos_token.to_account_info(),
    //         ggreat_grand_parent_profile_holder_opos_ata.to_account_info(),
    //         current_ggreat_grand_parent_profile_holder.to_account_info(),
    //         user.to_account_info(),
    //         token_program.to_account_info(),
    //         system_program.to_account_info(),
    //         associated_token_program.to_account_info(),
    //     ) == Ok(())
    //     // token::mint = opos_token,
    //     // token::authority = current_ggreat_grand_parent_profile_holder,
    // )]
    // pub ggreat_grand_parent_profile_holder_opos_ata: AccountInfo<'info>,
    // ///CHECK:
    // #[account(
    //     mut,
    //     constraint = init_ata_if_needed(
    //         opos_token.to_account_info(),
    //         genesis_profile_holder_opos_ata.to_account_info(),
    //         current_genesis_profile_holder.to_account_info(),
    //         user.to_account_info(),
    //         token_program.to_account_info(),
    //         system_program.to_account_info(),
    //         associated_token_program.to_account_info(),
    //     ) == Ok(())
    //     // token::mint = opos_token,
    //     // token::authority = current_genesis_profile_holder,
    // )]
    // pub genesis_profile_holder_opos_ata: AccountInfo<'info>,
}

impl<'info> AMintPassByAt<'info> {
    pub fn mint(&mut self, name: String, symbol: String, uri_hash: String) -> Result<()> {
        let mint = self.profile.to_account_info();
        let user = self.user.to_account_info();
        let user_profile_ata = self.user_profile_ata.to_account_info();
        // let user_profile_ata = self.user_profile_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let edition = self.profile_edition.to_account_info();
        // let associated_token_program = self.associated_token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();
        let main_state = &mut self.main_state;

        //mint a token
        let cpi_acounts = MintTo {
            mint: mint.to_account_info(),
            to: user_profile_ata,
            authority: user.to_account_info(),
        };
        token::mint_to(
            CpiContext::new(token_program.to_account_info(), cpi_acounts),
            1,
        )?;

        // Creators Setup for royalty
        let trading_price_distribution = main_state.trading_price_distribution;
        let seller_fee_basis_points = TOTAL_SELLER_BASIS_POINTS - trading_price_distribution.seller;
        let creators = vec![
            //NOTE: currently not royalty info for creator
            Creator {
                address: user.key(),
                verified: false,
                share: 100,
            }
            // Creator {
            //     address: get_vault_pda(&self.profile_state.lineage.parent).0,
            //     verified: false,
            //     share: (trading_price_distribution.parent as u64 * 100u64
            //         / seller_fee_basis_points as u64) as u8,
            // },
            // Creator {
            //     address: get_vault_pda(&self.profile_state.lineage.grand_parent).0,
            //     verified: false,
            //     share: (trading_price_distribution.grand_parent as u64 * 100u64
            //         / seller_fee_basis_points as u64) as u8,
            // },
            // Creator {
            //     address: get_vault_pda(&self.profile_state.lineage.great_grand_parent).0,
            //     verified: false,
            //     share: (trading_price_distribution.great_grand_parent as u64 * 100u64
            //         / seller_fee_basis_points as u64) as u8,
            // },
            // Creator {
            //     address: get_vault_pda(&main_state.genesis_profile).0,
            //     verified: false,
            //     share: (trading_price_distribution.genesis as u64 * 100u64
            //         / seller_fee_basis_points as u64) as u8,
            // },
        ];

        let mut unique_creators = HashMap::<Pubkey, Creator>::new();
        for creator in creators.into_iter() {
            let res = unique_creators.get_mut(&creator.address);
            if let Some(value) = res {
                value.share += creator.share;
            } else {
                unique_creators.insert(creator.address, creator);
            }
        }

        let creators = Some(
            unique_creators
                .into_iter()
                .map(|(k, v)| v)
                .collect::<Vec<_>>(),
        );

        let asset_data = CreateArgs::V1 {
            name,
            symbol,
            uri: uri_hash,
            collection: Some(mpl_token_metadata::types::Collection {
                verified: false,
                key: self.collection.key(),
            }),
            uses: None,
            creators,
            // creators: None,
            collection_details: Some(mpl_token_metadata::types::CollectionDetails::V1 { size: 0 }),
            is_mutable: true, //NOTE: may be for testing
            rule_set: None,
            token_standard: mpl_token_metadata::types::TokenStandard::NonFungible,
            primary_sale_happened: true,
            seller_fee_basis_points, //EX: 20% (80% goes to seller)
            decimals: Some(0),
            print_supply: Some(mpl_token_metadata::types::PrintSupply::Zero),
        };

        let ix = CreateBuilder::new()
        .metadata(metadata.key())
        .master_edition(Some(edition.key()))
        .mint( mint.key(), false)
        .authority(user.key())
        .payer(user.key())
        .update_authority(main_state.key(),true)
        .spl_token_program(Some(token_program.key()))
        .sysvar_instructions(sysvar_instructions.key())
        .system_program(system_program.key())
        .create_args(asset_data)
        .instruction();


        // NOTE: minting cost distribution
        // let sender_ata = self.user_opos_ata.to_account_info();
        // let cost = main_state.profile_minting_cost;
        // let minting_cost_distribution = main_state.minting_cost_distribution;


        // let mut transfer_data = Vec::new();

        // transfer_data.push(
        //     TransferModel{
        //        account_opos_ata: self
        //        .parent_profile_holder_opos_ata.to_account_info(),
        //        value: (cost as u128 * minting_cost_distribution.parent as u128
        //         / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        //         key: self
        //         .parent_profile_holder_opos_ata
        //         .to_account_info().key().to_string()
        //     }
        // );

        // let gparent = TransferModel{
        //     account_opos_ata: self
        //     .grand_parent_profile_holder_opos_ata.to_account_info(),
        //     value: (cost as u128 * minting_cost_distribution.grand_parent as u128
        //      / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        //      key: self
        //      .grand_parent_profile_holder_opos_ata
        //      .to_account_info().key().to_string()
        //  };

        //  let gparent_index = get_transfer_index(transfer_data.clone(), gparent.clone().key);
        // if gparent_index == -1 {
        //     transfer_data.push(gparent)
        // } else {
        //     transfer_data[gparent_index as usize].value = transfer_data[gparent_index as usize].value + gparent.value;
        // }


        // let ggparent = TransferModel{
        //     account_opos_ata: self
        //     .great_grand_parent_profile_holder_opos_ata.to_account_info(),
        //     value: (cost as u128 * minting_cost_distribution.great_grand_parent as u128
        //      / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        //      key: self
        //      .great_grand_parent_profile_holder_opos_ata
        //      .to_account_info().key().to_string()
        //  };

        //  let ggparent_index = get_transfer_index(transfer_data.clone(), ggparent.clone().key);
        // if ggparent_index == -1 {
        //     transfer_data.push(ggparent.clone())
        // } else {
        //     transfer_data[ggparent_index as usize].value = transfer_data[ggparent_index as usize].value + ggparent.clone().value;
        // }


        // let gggparent = TransferModel{
        //     account_opos_ata: self
        //     .ggreat_grand_parent_profile_holder_opos_ata.to_account_info(),
        //     value: (cost as u128 * minting_cost_distribution.ggreat_grand_parent as u128
        //      / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        //      key: self
        //      .ggreat_grand_parent_profile_holder_opos_ata
        //      .to_account_info().key().to_string()
        //  };

        // let gggparent_index = get_transfer_index(transfer_data.clone(), gggparent.clone().key);
        // if gggparent_index == -1 {
        //     transfer_data.push(gggparent.clone())
        // } else {
        //     transfer_data[gggparent_index as usize].value = transfer_data[gggparent_index as usize].value + gggparent.clone().value;
        // }

        // let gensis = TransferModel{
        //     account_opos_ata: self
        //     .genesis_profile_holder_opos_ata.to_account_info(),
        //     value: (cost as u128 * minting_cost_distribution.genesis as u128
        //      / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        //      key: self
        //      .genesis_profile_holder_opos_ata
        //      .to_account_info().key().to_string()
        //  };

        //  let gensis_index = get_transfer_index(transfer_data.clone(), gensis.clone().key);
        // if gensis_index == -1 {
        //     transfer_data.push(gensis.clone())
        // } else {
        //     transfer_data[gensis_index as usize].value = transfer_data[gensis_index as usize].value + gensis.clone().value;
        // }
        

        // for transfer_item in transfer_data {
        //     transfer_tokens(
        //         sender_ata.to_account_info(),
        //         transfer_item.account_opos_ata.to_account_info(),
        //         user.to_account_info(),
        //         token_program.to_account_info(),
        //         transfer_item.value,
        //     )?;
        // }
    


        invoke_signed(
            &ix,
            &[
                mint,
                user,
                main_state.to_account_info(),
                metadata,
                edition,
                mpl_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
            &[
                &[SEED_MAIN_STATE, self.project.key().as_ref(), &[self.main_state._bump]],
            ],
        )?;

        Ok(())
    }

    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.parent_main_state;
        let collection = self.collection.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        // let collection_authority_record = self.collection_authority_record.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        let ix = Verify {
            collection_metadata: Some(collection_metadata.key()),
            metadata: metadata.key(),
            authority: main_state.key(),
            collection_mint: Some(collection.key()),
            collection_master_edition: Some(collection_edition.key()),
            system_program: system_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            // delegate_record: Some(collection_authority_record.key()),
            delegate_record: None,
        }
        .instruction(VerifyInstructionArgs {verification_args:mpl_token_metadata::types::VerificationArgs::CollectionV1});
    
    
        invoke_signed(
            &ix,
            &[
                metadata,
                main_state.to_account_info(),
                collection,
                collection_metadata,
                collection_edition,
                mpl_program,
                system_program,
                // collection_authority_record,
                sysvar_instructions,
            ],
            &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        )?;
        Ok(())
    }

    pub fn burn_activation_token(&mut self, program_id: &Pubkey) -> Result<()> {
        let mint = self.activation_token.to_account_info();
        let user = self.user.to_account_info();
        let user_activation_token_ata = self.user_activation_token_ata.to_account_info();
        let system_program = self.system_program.to_account_info();
        let token_program = self.token_program.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        let cpi_accounts = Burn {
            mint,
            from: user_activation_token_ata,
            authority: user,
        };

        token::burn(CpiContext::new(token_program, cpi_accounts), 1)?;
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