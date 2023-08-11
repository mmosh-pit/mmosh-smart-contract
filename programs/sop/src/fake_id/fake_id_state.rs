use crate::other_states::LineageInfo;
use anchor_lang::prelude::*;

#[account]
pub struct FakeIdState {
    pub lineage: LineageInfo,
    pub mint: Pubkey,
}

impl FakeIdState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
