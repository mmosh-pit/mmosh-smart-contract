use crate::other_states::LineageInfo;
use anchor_lang::prelude::*;

#[account]
pub struct ProfileState {
    pub lineage: LineageInfo,
    pub mint: Pubkey,
    pub activation_token: Option<Pubkey>,
    pub total_minted_sft: u64,
    pub total_minted_offers: u64,
    pub lut: Pubkey,
}

impl ProfileState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}