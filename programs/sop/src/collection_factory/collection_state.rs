use anchor_lang::prelude::*;

#[account]
pub struct CollectionState {
    pub genesis_profile: Pubkey,
    pub is_genesis_profile_init: bool,
    pub mint: Pubkey,
}

impl CollectionState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
