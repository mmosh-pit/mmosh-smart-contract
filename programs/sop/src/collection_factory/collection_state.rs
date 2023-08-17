use anchor_lang::prelude::*;

#[account]
pub struct CollectionState {
    pub genesis_profile: Option<Pubkey>,
    pub collection_id: Pubkey,
}

impl CollectionState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();
}
