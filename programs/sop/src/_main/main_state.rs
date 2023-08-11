use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};

use crate::error::MyError;
use crate::other_states::RoyaltyInfo;

#[account]
pub struct MainState {
    pub owner: Pubkey,
    //It's genesis NFT(First GENESIS NFT)
    // pub genesis_fake_id: Pubkey,
    // pub activation_token_collection_id: Pubkey,
    pub royalty_for_minting: RoyaltyInfo,
    pub royalty_for_trading: RoyaltyInfo,
    pub seller_fee_basis_points: u16,
    pub _bump: u8,
    pub total_minted_peep: u64,
}

impl MainState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();

    // pub fn verify_peep<'info>(&self, metadata_account_info: &'info AccountInfo) -> Result<()> {
    //     let metadata =
    //         Metadata::from_account_info(metadata_account_info).map_err(|_| MyError::UnknownNft)?;
    //     let collection_info = metadata.collection.ok_or_else(|| MyError::UnknownNft)?;
    //     Ok(())
    // }

    pub fn verify_activation_token<'info>(
        &self,
        metadata_account_info: &'info AccountInfo,
    ) -> Result<()> {
        let metadata =
            Metadata::from_account_info(metadata_account_info).map_err(|_| MyError::UnknownNft)?;
        let collection_info = metadata.collection.ok_or_else(|| MyError::UnknownNft)?;
        // require!(
        //     collection_info.key == self.activation_token_collection_id && collection_info.verified,
        //     MyError::UnknownNft
        // );
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct MainStateInput {
    pub royalty_for_minting: RoyaltyInfo,
    pub royalty_for_trading: RoyaltyInfo,
    // pub activation_token_collection_id: Pubkey,
}

impl MainStateInput {
    pub fn set_value(&self, mut state: &mut MainState) {
        // state.activation_token_collection_id = self.activation_token_collection_id;
        state.royalty_for_minting = self.royalty_for_minting;
        state.royalty_for_trading = self.royalty_for_trading;
    }
}
