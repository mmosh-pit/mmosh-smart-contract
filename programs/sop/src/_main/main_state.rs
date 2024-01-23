use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};

use crate::error::MyError;
use crate::other_states::{MintingCostDistribution, TradingPriceDistribution};

#[account]
pub struct MainState {
    pub owner: Pubkey,
    pub opos_token: Pubkey,
    pub profile_minting_cost: u64,
    pub minting_cost_distribution: MintingCostDistribution,
    pub trading_price_distribution: TradingPriceDistribution,
    pub seller_fee_basis_points: u16, //NOTE: may be later change
    pub _bump: u8,
    pub total_minted_profile: u64,
    pub profile_collection: Pubkey,
    pub genesis_profile: Pubkey,
    pub common_lut: Pubkey,
}

impl MainState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
    // pub fn verify_profile<'info>(&self, metadata_account_info: &'info AccountInfo) -> Result<()> {
    //     let metadata =
    //         Metadata::from_account_info(metadata_account_info).map_err(|_| MyError::UnknownNft)?;
    //     let collection_info = metadata.collection.ok_or_else(|| MyError::UnknownNft)?;
    //     Ok(())
    // }

    pub fn verify_activation_token(
        &self,
        metadata_account_info: &AccountInfo,
    ) -> Result<()> {
        let metadata =
            Metadata::from_account_info(metadata_account_info).map_err(|_| MyError::UnknownNft)?;
        let collection_info = metadata.collection.ok_or(MyError::UnknownNft)?;
        // require!(
        //     collection_info.key == self.activation_token_collection_id && collection_info.verified,
        //     MyError::UnknownNft
        // );
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct MainStateInput {
    pub profile_minting_cost: u64,
    pub opos_token: Pubkey,
    pub minting_cost_distribution: MintingCostDistribution,
    pub trading_price_distribution: TradingPriceDistribution,
    // pub activation_token_collection_id: Pubkey,
}

impl MainStateInput {
    pub fn set_value(&self, mut state: &mut MainState) {
        // state.activation_token_collection_id = self.activation_token_collection_id;
        state.opos_token = self.opos_token;
        state.minting_cost_distribution = self.minting_cost_distribution;
        state.trading_price_distribution = self.trading_price_distribution;
        state.profile_minting_cost = self.profile_minting_cost;
    }
}
