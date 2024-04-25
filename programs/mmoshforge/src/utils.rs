use crate::{
    _main::main_state::MainState,
    constants::{SEED_MAIN_STATE, SEED_VAULT},
    error::MyError,
};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::{create as create_ata, Create as CreateAta};
use anchor_spl::token::{self, initialize_account, Token, Transfer};

use mpl_token_metadata::{
    accounts::Metadata, instructions::{Verify, VerifyInstructionArgs}
};
use solana_program::program::{invoke, invoke_signed};

pub fn transfer_tokens<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from,
        to,
        authority,
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
    metadata: AccountInfo<'info>,
    collection: AccountInfo<'info>,
    collection_metadata: AccountInfo<'info>,
    collection_edition: AccountInfo<'info>,
    // collection_authority_record: AccountInfo<'info>,
    main_state: &Account<'info, MainState>,
    mpl_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    sysvar_instructions: AccountInfo<'info>,
) -> Result<()> {
    let ix = Verify {
        collection_metadata: Some(collection_metadata.key()),
        metadata: metadata.key(),
        authority: main_state.key(),
        collection_mint: Some(collection.key()),
        collection_master_edition: Some(collection_edition.key()),
        system_program: system_program.key(),
        sysvar_instructions: sysvar_instructions.key(),
        // delegate_record: Some(collection_authority_record.key()),
        delegate_record: None,
    }
    .instruction(VerifyInstructionArgs {verification_args:mpl_token_metadata::types::VerificationArgs::CollectionV1});

    invoke_signed(
        &ix,
        &[
            metadata,
            main_state.to_account_info(),
            collection,
            collection_metadata,
            collection_edition,
            mpl_program,
            system_program,
            // collection_authority_record,
            sysvar_instructions,
        ],
        &[&[SEED_MAIN_STATE, &[main_state._bump]]],
    )?;

    Ok(())
}

pub fn get_vault_pda(profile_mint: &Pubkey) -> (Pubkey, u8) {
    let res = Pubkey::find_program_address(&[SEED_VAULT, profile_mint.as_ref()], &crate::ID);
    // let sign_seed = [SEED_VAULT, profile_mint.as_ref(), &[res.1]].as_ref();

    res
}

pub fn _verify_collection(metadata_account: &AccountInfo, collection_id: Pubkey) -> Result<()> {
    let metadata =
        Metadata::try_from(metadata_account).map_err(|_| MyError::UnknownNft)?;
    let collection_info = metadata.collection.ok_or(MyError::UnknownNft)?;
    if collection_info.key == collection_id && collection_info.verified {
        return Ok(());
    }
    anchor_lang::err!(MyError::UnknownNft)
}

pub fn init_ata_if_needed<'info>(
    mint: AccountInfo<'info>,
    ata: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
) -> Result<()> {
    if *ata.owner == token::ID {
        return Ok(());
    }

    let cpi_accounts = CreateAta {
        associated_token: ata,
        mint,
        authority,
        payer,
        token_program,
        system_program,
    };

    create_ata(CpiContext::new(associated_token_program, cpi_accounts))?;
    Ok(())
}
