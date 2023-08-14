use crate::{
    _main::main_state::MainState,
    constants::{SEED_MAIN_STATE, SEED_VAULT},
    error::MyError,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use mpl_token_metadata::{
    instruction::verify_sized_collection_item,
    state::{Metadata, TokenMetadataAccount},
};
use solana_program::program::invoke_signed;

pub fn transfer_tokens<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        authority,
        to,
        from,
    };
    token::transfer(CpiContext::new(token_program, cpi_accounts), amount)?;
    Ok(())
}

pub fn transfer_tokens_from_main<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    main: &Account<'info, MainState>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        authority: main.to_account_info(),
        to,
        from,
    };
    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            cpi_accounts,
            &[&[SEED_MAIN_STATE, &[main._bump]]],
        ),
        amount,
    )?;
    Ok(())
}

pub fn verify_collection_item_by_main<'info>(
    mint: AccountInfo<'info>,
    metadata: AccountInfo<'info>,
    collection: AccountInfo<'info>,
    collection_metadata: AccountInfo<'info>,
    collection_edition: AccountInfo<'info>,
    collection_authority_record: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    main_state: &Account<'info, MainState>,
    mpl_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
) -> Result<()> {
    let ix = verify_sized_collection_item(
        mpl_program.key(),
        metadata.key(),
        main_state.key(),
        payer.key(),
        mint.key(),
        collection.key(),
        collection_edition.key(),
        // Some(collection_authority_record.key()),
        None,
    );

    invoke_signed(
        &ix,
        &[
            mint,
            payer,
            metadata,
            main_state.to_account_info(),
            collection,
            collection_metadata,
            collection_edition,
            mpl_program,
            system_program,
            // collection_authority_record,
        ],
        &[&[SEED_MAIN_STATE, &[main_state._bump]]],
    )?;

    Ok(())
}

pub fn get_vault_id(profile_mint: Pubkey) -> Pubkey {
    msg!("profile: {}", profile_mint);
    return Pubkey::find_program_address(&[SEED_VAULT, profile_mint.as_ref()], &crate::ID).0;
}

pub fn _verify_collection(metadata_account: &AccountInfo, collection_id: Pubkey) -> Result<()> {
    let metadata =
        Metadata::from_account_info(metadata_account).map_err(|_| MyError::UnknownNft)?;
    let collection_info = metadata.collection.ok_or_else(|| MyError::UnknownNft)?;
    if collection_info.key == collection_id && collection_info.verified {
        return Ok(());
    }
    anchor_lang::err!(MyError::UnknownNft)
}
