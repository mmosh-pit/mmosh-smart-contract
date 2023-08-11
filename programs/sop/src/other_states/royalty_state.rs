use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct RoyaltyInfo {
    pub creator: u16,
    pub parent: u16,
    pub grand_parent: u16,
    ///(Creator’s Parent)
    pub curator: u16,
    ///(Genesis Persona holder)
    pub psy: u16,
}
