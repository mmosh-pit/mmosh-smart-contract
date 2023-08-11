use crate::other_states::LineageInfo;
use anchor_lang::prelude::*;

#[account]
pub struct PeepState {
    pub lineage: LineageInfo,
    pub mint: Pubkey,
}

impl PeepState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
