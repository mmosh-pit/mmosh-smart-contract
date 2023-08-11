use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use mpl_token_metadata::state::Creator;

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct LineageInfo {
    pub creator: Pubkey,
    pub parent: Pubkey,
    pub grand_parent: Pubkey,
    pub greate_grand_parent: Pubkey,
    pub uncle_psy: Pubkey,
    pub generation: u64,
    pub total_child: u64,
}
