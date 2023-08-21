use anchor_lang::prelude::error_code;

#[error_code]
pub enum MyError {
    #[msg("first erorr")]
    FirstError,

    #[msg("Value assing already")]
    AlreadySet,

    #[msg("This method can only be called by onwer")]
    OnlyOwnerCanCall,

    #[msg("Unknown NFT")]
    UnknownNft,

    #[msg("Invalid Nft holder")]
    InvalidNftHolder,

    #[msg("Genesis nft already created")]
    GenesisNftAlreadyMinted,

    #[msg("Activation token not found")]
    ActivationTokenNotFound,

    #[msg("Activation Token already initialize")]
    ActivationTokenAlreadyInitialize,

    #[msg("Only Profile Holder can call")]
    OnlyProfileHolderAllow,

    #[msg("Not have enough token to mint")]
    NotEnoughTokenToMint,
}
