use crate::{_main::main_state::MainState, constants::SEED_MAIN_STATE};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use mpl_token_metadata::instruction::verify_sized_collection_item;
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
        ],
        &[&[SEED_MAIN_STATE, &[main_state._bump]]],
    )?;

    Ok(())
}
