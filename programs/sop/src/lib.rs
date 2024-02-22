#![allow(unused)]
use anchor_lang::prelude::*;
declare_id!("62toyp2z8hsx3xj1Mx2vHMdsXMfgxTCvJ1tT6BehXpxF");

pub mod _main;
pub mod activation_token;
pub mod collection_factory;
pub mod fake_id;
pub mod offer;
pub mod profile;

pub mod constants;
pub mod error;
pub mod other_states;
pub mod utils;

use _main::*;
use activation_token::*;
use collection_factory::*;
use fake_id::*;
use offer::*;
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

    pub fn set_common_lut(ctx: Context<AUpdateMainState>, lut: Pubkey) -> Result<()> {
        ctx.accounts.main_state.common_lut = lut;
        Ok(())
    }

    pub fn reset_main(ctx: Context<AResetMain>) -> Result<()> {
        Ok(())
    }

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
    pub fn mint_profile_by_at(
        ctx: Context<AMintProfileByAt>,
        name: Box<String>,
        symbol: Box<String>,
        // uri: Box<String>,
        uri_hash: Box<String>,
        recent_slot: u64,
    ) -> Result<()> {
        profile::mint_profile_by_at(ctx, name, symbol, uri_hash, recent_slot)?;
        Ok(())
    }

    //User calls
    pub fn mint_profile_distribution(
        ctx: Context<MintCostDistribution>,
    ) -> Result<()> {
        profile::mint_profile_distribution(ctx)?;
        Ok(())
    }

    pub fn init_activation_token(
        ctx: Context<AInitActivationToken>,
        name: String,
        symbol: String,
        uri: String
    ) -> Result<()> {
        activation_token::init_activation_token(ctx, name, symbol, uri)?;
        Ok(())
    }

    pub fn mint_activation_token(ctx: Context<AMintActivationToken>, amount: u64) -> Result<()> {
        activation_token::mint_activation_token(ctx, amount)?;
        Ok(())
    }

    pub fn mint_offer(
        ctx: Context<AMintOffer>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        offer::mint_offer(ctx, name, symbol, uri)?;
        Ok(())
    }
}
