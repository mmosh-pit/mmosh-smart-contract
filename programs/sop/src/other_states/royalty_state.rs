use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct MintingRoyaltyInfo {
    pub creator: u16,
    pub parent: u16,
    pub grand_parent: u16,
    pub ggrand_parent: u16,

    //NOTE: left
    ///(Creator’s Parent)
    // pub curator: u16,

    ///(Genesis Persona holder)
    pub uncle_psy: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct TradingRoyaltyInfo {
    pub seller: u16,
    pub creator: u16,
    pub parent: u16,
    pub curator: u16,
    pub uncle_psy: u16,
}
