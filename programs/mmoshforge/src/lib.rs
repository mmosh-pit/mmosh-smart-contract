#![allow(unused)]
use anchor_lang::prelude::*;
declare_id!("DCy6L7FGjNZr6oYLZsojS9aC9LJ2XniiTiF7qhkEfBme");

pub mod _main;
pub mod activation_token;
pub mod collection_factory;
pub mod profile;
pub mod curve;

pub mod constants;
pub mod error;
pub mod other_states;
pub mod utils;

use _main::*;
use activation_token::*;
use collection_factory::*;
use other_states::LineageInfo;
use profile::*;
use curve::*;

#[program]
pub mod mmoshforge {

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

    pub fn create_collection(
        ctx: Context<ACreateCollection>,
        name: String,
        symbol: String,
        uri: String,
        collection_type: String
    ) -> Result<()> {
        collection_factory::create_collection(ctx, name, symbol, uri, collection_type)?;
        Ok(())
    }

    pub fn update_collection<'info>(
        ctx: Context<AUpdateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {

        collection_factory::update_collection(ctx, name, symbol, uri )?;
        Ok(())
    }


    pub fn mint_genesis_profile(
        ctx: Context<AMintProfileByAdmin>,
        input: MintProfileByAdminInput,
    ) -> Result<()> {
        profile::mint_genesis_profile(ctx, input)?;
        Ok(())
    }

    pub fn project_distribution(
      ctx: Context<AProjectDistribution>
  ) -> Result<()> {
      profile::project_distribution(ctx)?;
      Ok(())
  }


    //User calls
    pub fn mint_profile_by_at(
        ctx: Context<AMintProfileByAt>,
        name: Box<String>,
        symbol: Box<String>,
        // uri: Box<String>,
        uri_hash: Box<String>,
    ) -> Result<()> {
        profile::mint_profile_by_at(ctx, name, symbol, uri_hash)?;
        Ok(())
    }


    pub fn mint_genesis_pass(
      ctx: Context<AMintPassByAdmin>,
      name: Box<String>,
      symbol: Box<String>,
      // uri: Box<String>,
      uri_hash: Box<String>,
      input: MainStateInput
    ) -> Result<()> {
        profile::mint_genesis_pass(ctx, name, symbol, uri_hash, input)?;
        Ok(())
    }

    //User calls
    pub fn mint_pass_by_at(
        ctx: Context<AMintPassByAt>,
        name: Box<String>,
        symbol: Box<String>,
        // uri: Box<String>,
        uri_hash: Box<String>,
    ) -> Result<()> {
        profile::mint_pass_by_at(ctx, name, symbol, uri_hash)?;
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

    pub fn init_pass_token(
      ctx: Context<AInitPassToken>,
      name: String,
      symbol: String,
      uri: String
    ) -> Result<()> {
        activation_token::init_pass_token(ctx, name, symbol, uri)?;
        Ok(())
    }

    pub fn create_pass_token(ctx: Context<ACreatePassToken>, amount: u64) -> Result<()> {
      activation_token::create_pass_token(ctx, amount)?;
      Ok(())
    }

    // curve

    pub fn initialize_sol_storage_v0(
        ctx: Context<InitializeSolStorageV0>,
        args: InitializeSolStorageV0Args,
      ) -> Result<()> {
        curve::instructions::initialize_sol_storage_v0::handler(ctx, args)
      }
    
      pub fn buy_wrapped_sol_v0(
        ctx: Context<BuyWrappedSolV0>,
        args: BuyWrappedSolV0Args,
      ) -> Result<()> {
        curve::instructions::buy::buy_wrapped_sol_v0::handler(ctx, args)
      }
    
      pub fn sell_wrapped_sol_v0(
        ctx: Context<SellWrappedSolV0>,
        args: SellWrappedSolV0Args,
      ) -> Result<()> {
        curve::instructions::sell::sell_wrapped_sol_v0::handler(ctx, args)
      }
    
      pub fn create_curve_v0(ctx: Context<InitializeCurveV0>, args: CreateCurveV0Args) -> Result<()> {
        curve::instructions::create_curve_v0::handler(ctx, args)
      }
    
      pub fn initialize_token_bonding_v0(
        ctx: Context<InitializeTokenBondingV0>,
        args: InitializeTokenBondingV0Args,
      ) -> Result<()> {
        curve::instructions::initialize_token_bonding_v0::handler(ctx, args)
      }
    
      pub fn close_token_bonding_v0(ctx: Context<CloseTokenBondingV0>) -> Result<()> {
        curve::instructions::close_token_bonding_v0::handler(ctx)
      }
    
      pub fn transfer_reserves_v0(
        ctx: Context<TransferReservesV0>,
        args: TransferReservesV0Args,
      ) -> Result<()> {
        curve::instructions::transfer_reserves::transfer_reserves_v0::handler(ctx, args)
      }
    
      pub fn transfer_reserves_native_v0(
        ctx: Context<TransferReservesNativeV0>,
        args: TransferReservesV0Args,
      ) -> Result<()> {
        curve::instructions::transfer_reserves::transfer_reserves_native_v0::handler(ctx, args)
      }
    
      pub fn update_reserve_authority_v0(
        ctx: Context<UpdateReserveAuthorityV0>,
        args: UpdateReserveAuthorityV0Args,
      ) -> Result<()> {
        curve::instructions::update_reserve_authority_v0::handler(ctx, args)
      }
    
      pub fn update_curve_v0(ctx: Context<UpdateCurveV0>, args: UpdateCurveV0Args) -> Result<()> {
        curve::instructions::update_curve_v0::handler(ctx, args)
      }
    
      pub fn update_token_bonding_v0(
        ctx: Context<UpdateTokenBondingV0>,
        args: UpdateTokenBondingV0Args,
      ) -> Result<()> {
        curve::instructions::update_token_bonding_v0::handler(ctx, args)
      }
    
      pub fn buy_v1(ctx: Context<BuyV1>, args: BuyV0Args) -> Result<()> {
        curve::instructions::buy::buy_v1::handler(ctx, args)
      }
    
      pub fn buy_native_v0(ctx: Context<BuyNativeV0>, args: BuyV0Args) -> Result<()> {
        curve::instructions::buy::buy_native_v0::handler(ctx, args)
      }
    
      pub fn sell_v1(ctx: Context<SellV1>, args: SellV0Args) -> Result<()> {
        curve::instructions::sell::sell_v1::handler(ctx, args)
      }
    
      pub fn sell_native_v0(ctx: Context<SellNativeV0>, args: SellV0Args) -> Result<()> {
        curve::instructions::sell::sell_native_v0::handler(ctx, args)
      }

}
