use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct MintingCostDistribution {
    pub parent: u16,
    pub grand_parent: u16,
    pub great_grand_parent: u16,
    pub ggreat_grand_parent: u16,
    pub genesis: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct TradingPriceDistribution {
    pub seller: u16,
    pub parent: u16,
    pub grand_parent: u16,
    pub great_grand_parent: u16,
    pub genesis: u16,
}
