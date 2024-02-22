use std::collections::HashMap;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
    instruction::{
        approve_collection_authority,
        builders::{Create, Verify},
        verify_sized_collection_item, InstructionBuilder,
    },
    state::{
        AssetData, Creator, COLLECTION_AUTHORITY, EDITION, PREFIX as METADATA, TOKEN_RECORD_SEED,
    },
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
        _verify_collection, get_vault_pda, init_ata_if_needed, transfer_tokens,
        verify_collection_item_by_main,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct MintProfileByAtInput {
    pub name: String,
    pub symbol: String,
    // pub uri: String,
    pub uri_hash: String,
    pub recent_slot: u64,
}

///MINT FakeID by activation_token
pub fn mint_profile_by_at(
    ctx: Context<AMintProfileByAt>,
    name: Box<String>,
    symbol: Box<String>,
    // uri: Box<String>,
    uri_hash: Box<String>,
    recent_slot: u64,
    // MintProfileByAtInput {
    //     name,
    //     symbol,
    //     uri,
    //     recent_slot,
    // }: MintProfileByAtInput,
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

        //verification(parent nft collection check)
        // _verify_collection(&parent_profile_metadata, ctx.accounts.collection.key())?;

        //state changes
        profile_state.lut = ctx.accounts.new_lut.key();
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
    {
        //NOTE: create lookup table
        ctx.accounts.create_lookup_table(recent_slot)?;
    }
    Ok(())
}


///MINT FakeID by activation_token
pub fn mint_profile_distribution(
    ctx: Context<MintCostDistribution>,
) -> Result<()> {
    {
        // NOTE: minting cost distribution
        let token_program = ctx.accounts.token_program.to_account_info();
        let sender_ata = ctx.accounts.user_opos_ata.to_account_info();
        let authority = ctx.accounts.user.to_account_info();
        let main_state = &mut ctx.accounts.main_state;
        let cost = main_state.profile_minting_cost;
        let minting_cost_distribution = main_state.minting_cost_distribution;

        // Parent
        transfer_tokens(
            sender_ata.to_account_info(),
            ctx.accounts
                .parent_profile_holder_opos_ata
                .to_account_info(),
            authority.to_account_info(),
            token_program.to_account_info(),
            (cost as u128 * minting_cost_distribution.parent as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        )?;

        // Grand Parent
        transfer_tokens(
            sender_ata.to_account_info(),
            ctx.accounts
                .grand_parent_profile_holder_opos_ata
                .to_account_info(),
            authority.to_account_info(),
            token_program.to_account_info(),
            (cost as u128 * minting_cost_distribution.grand_parent as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        )?;

        // Great Grand Parent
        transfer_tokens(
            sender_ata.to_account_info(),
            ctx.accounts
                .great_grand_parent_profile_holder_opos_ata
                .to_account_info(),
            authority.to_account_info(),
            token_program.to_account_info(),
            (cost as u128 * minting_cost_distribution.great_grand_parent as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        )?;

        // Great Great Grand Parent
        transfer_tokens(
            sender_ata.to_account_info(),
            ctx.accounts
                .ggreat_grand_parent_profile_holder_opos_ata
                .to_account_info(),
            authority.to_account_info(),
            token_program.to_account_info(),
            (cost as u128 * minting_cost_distribution.ggreat_grand_parent as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        )?;

        // Genesis
        transfer_tokens(
            sender_ata.to_account_info(),
            ctx.accounts
                .genesis_profile_holder_opos_ata
                .to_account_info(),
            authority.to_account_info(),
            token_program.to_account_info(),
            (cost as u128 * minting_cost_distribution.genesis as u128
                / TOTAL_SELLER_BASIS_POINTS as u128) as u64,
        )?;
    }
    Ok(())
}


#[derive(Accounts)]
#[instruction(
    name: Box<String>,
    symbol: Box<String>,
    uri: Box<String>,
    recent_slot: u64,
)]
pub struct AMintProfileByAt<'info> {
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

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(mut)]
    pub activation_token: Box<Account<'info, Mint>>,

    // #[account(
    //     mut,
    //     seeds = [SEED_ACTIVATION_TOKEN_STATE,activation_token.key().as_ref()],
    //     bump,
    // )]
    // pub activation_token_state: Box<Account<'info, ActivationTokenState>>,
    //
    // ///CHECK:
    // #[account(
    //     mut,
    //     seeds=[
    //         METADATA.as_ref(),
    //         MPL_ID.as_ref(),
    //         activation_token.key().as_ref(),
    //     ],
    //     bump,
    //     seeds::program = MPL_ID
    // )]
    // pub activation_token_metadata: AccountInfo<'info>,
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
            METADATA.as_ref(),
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
            METADATA.as_ref(),
            MPL_ID.as_ref(),
            profile.key().as_ref(),
            EDITION.as_ref(),
        ],
        bump,
        seeds::program = MPL_ID
    )]
    pub profile_edition: AccountInfo<'info>,

    // ///CHECK:
    // #[account(
    //     mut,
    //     seeds=[
    //         METADATA.as_ref(),
    //         MPL_ID.as_ref(),
    //         activation_token_state.parent_profile.as_ref(),
    //     ],
    //     bump,
    //     seeds::program = MPL_ID
    // )]
    // pub parent_profile_metadata: AccountInfo<'info>,
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
    #[account(
        mut,
        // seeds = [profile_state.key().as_ref(), recent_slot.to_le_bytes().as_ref()],
        // bump,
        // seeds::program = ADDRESS_LOOKUP_TABLE_PROGRAM,
    )]
    pub new_lut: AccountInfo<'info>,

    ///CHECK:
    #[account(address = ADDRESS_LOOKUP_TABLE_PROGRAM)]
    pub address_lookup_table_program: AccountInfo<'info>,

    ///CHECK:
    #[account()]
    pub sysvar_instructions: AccountInfo<'info>,

    //NOTE: profile minting cost distribution account
    // #[account(address = activation_token_state.parent_profile @ MyError::ProfileIdMissMatch)]
    pub parent_profile: Box<Account<'info, Mint>>,
}

impl<'info> AMintProfileByAt<'info> {
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
                share: 0,
            },
            Creator {
                address: get_vault_pda(&self.profile_state.lineage.parent).0,
                verified: false,
                share: (trading_price_distribution.parent as u64 * 100u64
                    / seller_fee_basis_points as u64) as u8,
            },
            Creator {
                address: get_vault_pda(&self.profile_state.lineage.grand_parent).0,
                verified: false,
                share: (trading_price_distribution.grand_parent as u64 * 100u64
                    / seller_fee_basis_points as u64) as u8,
            },
            Creator {
                address: get_vault_pda(&self.profile_state.lineage.great_grand_parent).0,
                verified: false,
                share: (trading_price_distribution.great_grand_parent as u64 * 100u64
                    / seller_fee_basis_points as u64) as u8,
            },
            Creator {
                address: get_vault_pda(&main_state.genesis_profile).0,
                verified: false,
                share: (trading_price_distribution.genesis as u64 * 100u64
                    / seller_fee_basis_points as u64) as u8,
            },
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

        let entry_point = "https://shdw-drive.genesysgo.net/FuBjTTmQuqM7pGR2gFsaiBxDmdj8ExP5fzNwnZyE2PgC/".to_string();
        let uri = format!("{}{}", entry_point, uri_hash);

        let asset_data = AssetData {
            name,
            symbol,
            uri,
            collection: Some(mpl_token_metadata::state::Collection {
                verified: false,
                key: self.collection.key(),
            }),
            uses: None,
            creators,
            // creators: None,
            collection_details: Some(mpl_token_metadata::state::CollectionDetails::V1 { size: 0 }),
            is_mutable: true, //NOTE: may be for testing
            rule_set: None,
            token_standard: mpl_token_metadata::state::TokenStandard::NonFungible,
            primary_sale_happened: true,
            seller_fee_basis_points, //EX: 20% (80% goes to seller)
        };

        let ix = Create {
            mint: mint.key(),
            payer: user.key(),
            authority: user.key(),
            initialize_mint: false,
            system_program: system_program.key(),
            metadata: metadata.key(),
            update_authority: main_state.key(),
            spl_token_program: token_program.key(),
            sysvar_instructions: sysvar_instructions.key(),
            update_authority_as_signer: true,
            master_edition: Some(edition.key()),
            args: mpl_token_metadata::instruction::CreateArgs::V1 {
                asset_data,
                decimals: Some(0),
                print_supply: Some(mpl_token_metadata::state::PrintSupply::Zero),
            },
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                mint,
                user,
                // user_profile_ata,
                main_state.to_account_info(),
                metadata,
                edition,
                mpl_program,
                // associated_token_program,
                token_program,
                system_program,
                sysvar_instructions,
            ],
            &[
                &[SEED_MAIN_STATE, &[self.main_state._bump]],
                // &[
                //     SEED_VAULT,
                //     self.parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.grand_parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.grand_parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.great_grand_parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.great_grand_parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.genesis_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.genesis_profile_vault_ata.owner).1].as_ref(),
                // ],
            ],
        )?;

        Ok(())
    }

    /// collection verification for created activation token
    pub fn verify_collection_item(&mut self, program_id: &Pubkey) -> Result<()> {
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = &mut self.main_state;
        let collection = self.collection.to_account_info();
        let collection_edition = self.collection_edition.to_account_info();
        let collection_metadata = self.collection_metadata.to_account_info();
        // let collection_authority_record = self.collection_authority_record.to_account_info();
        let system_program = self.system_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        verify_collection_item_by_main(
            metadata,
            collection,
            collection_metadata,
            collection_edition,
            // collection_authority_record,
            main_state,
            mpl_program,
            system_program,
            sysvar_instructions,
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

    pub fn verify_creators(&mut self) -> Result<()> {
        let user = self.user.to_account_info();
        let mpl_program = self.mpl_program.to_account_info();
        let metadata = self.profile_metadata.to_account_info();
        let main_state = self.main_state.to_account_info();
        let system_program = self.system_program.to_account_info();
        let sysvar_instructions = self.sysvar_instructions.to_account_info();

        let ix = Verify {
            metadata: metadata.key(),
            sysvar_instructions: sysvar_instructions.key(),
            system_program: system_program.key(),
            collection_metadata: None,
            authority: main_state.key(),
            collection_mint: None,
            collection_master_edition: None,
            delegate_record: None,
            args: mpl_token_metadata::instruction::VerificationArgs::CreatorV1,
        }
        .instruction();

        invoke_signed(
            &ix,
            &[
                user,
                main_state.to_account_info(),
                metadata,
                mpl_program,
                system_program,
                sysvar_instructions,
            ],
            &[
                &[SEED_MAIN_STATE, &[self.main_state._bump]],
                // &[
                //     SEED_VAULT,
                //     self.parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.grand_parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.grand_parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.great_grand_parent_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.great_grand_parent_profile_vault_ata.owner).1].as_ref(),
                // ],
                // &[
                //     SEED_VAULT,
                //     self.genesis_profile_vault_ata.owner.as_ref(),
                //     [get_vault_pda(&self.genesis_profile_vault_ata.owner).1].as_ref(),
                // ],
            ],
        )?;

        Ok(())
    }

    pub fn approve_sub_collection_authority_to_main(&mut self) -> Result<()> {
        // let mint = self.collection.to_account_info();
        // let payer = self.user.to_account_info();
        // let system_program = self.system_program.to_account_info();
        // let mpl_program = self.mpl_program.to_account_info();
        // let metadata = self.collection_metadata.to_account_info();
        // let mpl_program = self.mpl_program.to_account_info();
        // let sysvar_instructions = self.sysvar_instructions.to_account_info();
        // let main_state = &mut self.main_state;
        // let sub_collection_authority_record =
        //     self.sub_collection_authority_record.to_account_info();
        //
        // let ix = approve_collection_authority(
        //     mpl_program.key(),
        //     sub_collection_authority_record.key(),
        //     payer.key(),
        //     main_state.key(),
        //     payer.key(),
        //     metadata.key(),
        //     mint.key(),
        // );
        //
        // invoke_signed(
        //     &ix,
        //     &[
        //         mint,
        //         payer,
        //         main_state.to_account_info(),
        //         sub_collection_authority_record,
        //         metadata,
        //         mpl_program,
        //         system_program,
        //         sysvar_instructions,
        //     ],
        //     &[&[SEED_MAIN_STATE, &[main_state._bump]]],
        // )?;
        Ok(())
    }

    pub fn create_lookup_table(&mut self, recent_slot: u64) -> Result<()> {
        let user = self.user.to_account_info();
        let authority = self.profile_state.to_account_info();
        let address_lookup_table_program = self.address_lookup_table_program.to_account_info();
        let system_program = self.system_program.to_account_info();

        let sft = self.activation_token.to_account_info();
        let profile = self.profile.to_account_info();
        let profile_state = self.profile_state.to_account_info();
        let parent_profile = self.parent_profile.to_account_info();

        let new_lut = self.new_lut.to_account_info();
        let (_, bump) =
            Pubkey::find_program_address(&[SEED_PROFILE_STATE, profile.key().as_ref()], &crate::ID);

        let (create_ix, _lut_id) = create_lookup_table(authority.key(), user.key(), recent_slot);
        invoke_signed(
            &create_ix,
            &[
                new_lut.to_account_info(),
                authority.to_account_info(),
                user.to_account_info(),
                address_lookup_table_program.to_account_info(),
                system_program.to_account_info(),
            ],
            &[&[SEED_PROFILE_STATE, profile.key().as_ref(), &[bump]]],
        )?;

        let extand_ix = extend_lookup_table(
            new_lut.key(),
            authority.key(),
            Some(user.key()),
            vec![
                sft.key(),
                authority.key(), // profile state
                profile.key(),
                parent_profile.key(),
            ],
        );
        invoke_signed(
            &extand_ix,
            &[
                new_lut.to_account_info(),
                authority.to_account_info(),
                user.to_account_info(),
                address_lookup_table_program.to_account_info(),
                system_program.to_account_info(),
            ],
            &[&[SEED_PROFILE_STATE, profile.key().as_ref(), &[bump]]],
        )?;

        let freez_ix = freeze_lookup_table(new_lut.key(), authority.key());
        invoke_signed(
            &freez_ix,
            &[
                new_lut.to_account_info(),
                authority.to_account_info(),
                address_lookup_table_program.to_account_info(),
            ],
            &[&[SEED_PROFILE_STATE, profile.key().as_ref(), &[bump]]],
        )?;

        Ok(())
    }
}


#[derive(Accounts)]
pub struct MintCostDistribution<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    ///CHECK:
    #[account(address = main_state.opos_token)]
    pub opos_token: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [SEED_MAIN_STATE],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>,

    #[account(
        mut,
        seeds = [SEED_PROFILE_STATE, parent_profile.key().as_ref()],
        bump,
    )]
    pub parent_profile_state: Box<Account<'info, ProfileState>>,


    ///CHECK:
    #[account(address = MPL_ID)]
    pub mpl_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    //NOTE: profile minting cost distribution account
    // #[account(address = activation_token_state.parent_profile @ MyError::ProfileIdMissMatch)]
    pub parent_profile: Box<Account<'info, Mint>>,
    pub grand_parent_profile: Box<Account<'info, Mint>>,
    pub great_grand_parent_profile: Box<Account<'info, Mint>>,
    pub ggreate_grand_parent_profile: Box<Account<'info, Mint>>,
    pub genesis_profile: Box<Account<'info, Mint>>,

    // Current parent profile holded ata
    #[account(
        token::mint = parent_profile_state.mint,
        constraint = current_parent_profile_holder_ata.amount == 1
    )]
    pub current_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.parent,
        constraint = current_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.grand_parent,
        constraint = current_great_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_great_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = parent_profile_state.lineage.great_grand_parent,
        constraint = current_ggreat_grand_parent_profile_holder_ata.amount == 1
    )]
    pub current_ggreat_grand_parent_profile_holder_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        token::mint = main_state.genesis_profile,
        constraint = current_genesis_profile_holder_ata.amount == 1
    )]
    pub current_genesis_profile_holder_ata: Box<Account<'info, TokenAccount>>,

    // Current profile holders
    ///CHECK:
    #[account(address = current_parent_profile_holder_ata.owner)]
    pub current_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_grand_parent_profile_holder_ata.owner)]
    pub current_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_great_grand_parent_profile_holder_ata.owner)]
    pub current_great_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_ggreat_grand_parent_profile_holder_ata.owner)]
    pub current_ggreat_grand_parent_profile_holder: AccountInfo<'info>,
    ///CHECK:
    #[account(address = current_genesis_profile_holder_ata.owner)]
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
        // token::mint = opos_token,
        // token::authority = current_parent_profile_holder,
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
        // token::mint = opos_token,
        // token::authority = current_grand_parent_profile_holder,
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
        // token::mint = opos_token,
        // token::authority = current_great_grand_parent_profile_holder,
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
        // token::mint = opos_token,
        // token::authority = current_ggreat_grand_parent_profile_holder,
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
        // token::mint = opos_token,
        // token::authority = current_genesis_profile_holder,
    )]
    pub genesis_profile_holder_opos_ata: AccountInfo<'info>,
}
