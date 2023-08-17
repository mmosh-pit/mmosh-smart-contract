#![allow(unused)]
use anchor_lang::prelude::*;
declare_id!("7naVeywiE5AjY5SvwKyfRct9RQVqUTWNG36WhFu7JE6h");

pub mod _main;
pub mod activation_token;
pub mod collection_factory;
pub mod fake_id;
pub mod profile;

pub mod constants;
pub mod error;
pub mod other_states;
pub mod utils;

use _main::*;
use activation_token::*;
use collection_factory::*;
use fake_id::*;
use other_states::LineageInfo;
use profile::*;

#[program]
pub mod sop {
    use super::*;

    //Adming Calls
    pub fn init_main_state(ctx: Context<AInitMainState>, input: MainStateInput) -> Result<()> {
        _main::init_main_state(ctx, input)?;
        Ok(())
    }

    pub fn update_main_state(ctx: Context<AUpdateMainState>, input: MainStateInput) -> Result<()> {
        _main::update_main_state(ctx, input)?;
        Ok(())
    }

    pub fn update_main_state_owner(
        ctx: Context<AUpdateMainStateOwner>,
        new_owner: Pubkey,
    ) -> Result<()> {
        _main::update_main_state_owner(ctx, new_owner)?;
        Ok(())
    }

    // pub fn set_membership_collection(
    //     ctx: Context<ASetNativeCollection>,
    //     collection: Pubkey,
    // ) -> Result<()> {
    //     ctx.accounts.main_state.profile_collection = collection;
    //     Ok(())
    // }
    //
    // pub fn set_brand_collection(
    //     ctx: Context<ASetNativeCollection>,
    //     collection: Pubkey,
    // ) -> Result<()> {
    //     ctx.accounts.main_state.brand_collection = collection;
    //     Ok(())
    // }

    pub fn create_profile_collection(
        ctx: Context<ACreateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        collection_factory::create_profile_collection(ctx, name, symbol, uri)?;
        Ok(())
    }

    pub fn mint_genesis_profile(
        ctx: Context<AMintProfileByAdmin>,
        input: MintProfileByAdminInput,
    ) -> Result<()> {
        profile::mint_genesis_profile(ctx, input)?;
        Ok(())
    }

    //User calls
    // pub fn mint_(
    //     ctx: Context<AMintProfile>,
    //     name: String,
    //     symbol: String,
    //     uri: String,
    // ) -> Result<()> {
    //     profile::mint_profile(ctx, name, symbol, uri)?;
    //     Ok(())
    // }

    pub fn mint_profile_by_at(
        ctx: Context<AMintProfileByAt>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        profile::mint_profile_by_at(ctx, name, symbol, uri)?;
        Ok(())
    }

    pub fn init_activation_token(ctx: Context<AInitActivationToken>) -> Result<()> {
        activation_token::init_activation_token(ctx)?;
        Ok(())
    }

    pub fn mint_activation_token(ctx: Context<AMintActivationToken>, amount: u64) -> Result<()> {
        activation_token::mint_activation_token(ctx, amount)?;
        Ok(())
    }
}
