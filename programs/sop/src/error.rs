use anchor_lang::prelude::error_code;

#[error_code]
pub enum MyError {
    #[msg("first erorr")]
    FirstError,

    #[msg("This method can only be called by onwer")]
    OnlyOwnerCanCall,

    #[msg("Unknown NFT")]
    UnknownNft,

    #[msg("Invalid Nft holder")]
    InvalidNftHolder,

    #[msg("Genesis nft already created")]
    GenesisNftAlreadyMinted,
}
