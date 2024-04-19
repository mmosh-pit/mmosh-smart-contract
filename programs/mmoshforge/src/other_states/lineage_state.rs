use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct LineageInfo {
    pub creator: Pubkey,
    pub parent: Pubkey,
    pub grand_parent: Pubkey,
    pub great_grand_parent: Pubkey,
    pub ggreat_grand_parent: Pubkey,
    pub generation: u64,
    pub total_child: u64,
}
