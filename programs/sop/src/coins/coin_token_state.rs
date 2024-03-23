use crate::other_states::LineageInfo;
use anchor_lang::prelude::*;

#[account]
pub struct CoinTokenState {
    pub parent_profile: Pubkey,
    pub creator: Pubkey,
}

impl CoinTokenState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
