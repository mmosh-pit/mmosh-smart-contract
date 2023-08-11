#![allow(unused)]
use anchor_lang::prelude::*;
declare_id!("F7G5gQSsEZTAZeqbXQh9sfdQxpwzkJa9uRH2GpzdGDDF");

pub mod _main;
pub mod activation_token;
pub mod collection_factory;
pub mod fake_id;
pub mod peep;

pub mod constants;
pub mod error;
pub mod other_states;
pub mod utils;

use _main::*;
use collection_factory::*;
use fake_id::*;
use other_states::LineageInfo;
use peep::*;

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

    pub fn create_collection(
        ctx: Context<ACreateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        collection_factory::create_collection(ctx, name, symbol, uri)?;
        Ok(())
    }

    //User calls
    pub fn mint_peep(
        ctx: Context<AMintPeep>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        peep::mint_peep(ctx, name, symbol, uri)?;
        Ok(())
    }
}
