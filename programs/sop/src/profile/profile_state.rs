use crate::other_states::LineageInfo;
use anchor_lang::prelude::*;

#[account]
pub struct ProfileState {
    pub lineage: LineageInfo,
    pub mint: Pubkey,
    pub activation_token: Option<Pubkey>,
}

impl ProfileState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
