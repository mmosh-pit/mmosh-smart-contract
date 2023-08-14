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
use collection_factory::*;
use fake_id::*;
use other_states::LineageInfo;
use profile::*;

#[program]
pub mod sop {
    use crate::utils::get_vault_id;

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

    pub fn create_collection(
        ctx: Context<ACreateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        collection_factory::create_collection(ctx, name, symbol, uri)?;
        Ok(())
    }

    pub fn mint_profile_by_admin(
        ctx: Context<AMintProfileByAdmin>,
        input: MintProfileByAdminInput,
    ) -> Result<()> {
        profile::mint_profile_by_admin(ctx, input)?;
        Ok(())
    }

    //User calls
    pub fn mint_profile(
        ctx: Context<AMintProfile>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        // profile::mint_profile(ctx, name, symbol, uri)?;
        get_vault_id(ctx.accounts.parent_profile_state.mint);
        msg!("{:?}", ctx.accounts.parent_vault_usdc_ata);
        Ok(())
    }
}
