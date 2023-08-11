import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAccount as getTokenAccountInfo,
  unpackAccount as unpackTokenAccount,
  createBurnInstruction,
} from "@solana/spl-token";
import { web3 } from "@project-serum/anchor";

export type createTokenOptions = {
  payer: web3.PublicKey;
  mintAuthority: web3.PublicKey;
  freezAuthority: web3.PublicKey;
  decimal: number;
  mint: {
    allowMint: boolean;
    tokenReceiver: web3.PublicKey;
    tokenAmount: number;
    allowOffCurveOwner: boolean;
  };
};

export class BaseSpl {
  __connection: web3.Connection;
  __splIxs: web3.TransactionInstruction[] = [];

  constructor(connection: web3.Connection) {
    this.__connection = connection;
  }

  __reinit() {
    this.__splIxs = [];
  }

  async __getCreateTokenInstructions(opts: createTokenOptions = null) {
    this.__reinit();
    opts.payer = opts.payer ?? opts.mintAuthority;
    opts.freezAuthority = opts.freezAuthority ?? opts.mintAuthority;

    const token_keypair = web3.Keypair.generate();
    const mint = token_keypair.publicKey;
    const rent = await this.__connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );

    const ix1 = web3.SystemProgram.createAccount({
      fromPubkey: opts.payer ?? opts.mintAuthority,
      lamports: rent,
      newAccountPubkey: token_keypair.publicKey,
      programId: TOKEN_PROGRAM_ID,
      space: MINT_SIZE,
    });
    this.__splIxs.push(ix1);

    const ix2 = createInitializeMintInstruction(
      token_keypair.publicKey,
      opts.decimal ?? 0,
      opts.mintAuthority,
      opts.freezAuthority
    );
    this.__splIxs.push(ix2);

    if (opts?.mint?.allowMint) {
      const tokenReceiver = opts?.mint?.tokenReceiver ?? opts?.mintAuthority;

      const { ata, ix: createTokenAccountIx } =
        this.__getCreateTokenAccountInstruction(
          mint,
          tokenReceiver,
          opts?.mint?.allowOffCurveOwner,
          opts?.payer
        );
      this.__splIxs.push(createTokenAccountIx);

      const ix3 = createMintToInstruction(
        mint,
        ata,
        opts?.mintAuthority,
        opts?.mint?.tokenAmount ?? 1
      );
      this.__splIxs.push(ix2);
    }

    return {
      mintKp: token_keypair,
      ixs: this.__splIxs,
    };
  }

  __getCreateTokenAccountInstruction(
    mint: web3.PublicKey,
    owner: web3.PublicKey,
    allowOffCurveOwner: boolean = false,
    payer: web3.PublicKey = null
  ) {
    const ata = getAssociatedTokenAddressSync(mint, owner, allowOffCurveOwner);
    const ix = createAssociatedTokenAccountInstruction(
      payer ?? owner,
      ata,
      owner,
      mint
    );

    return {
      ata,
      ix,
    };
  }

  async __getOrCreateTokenAccountInstruction(
    mint: web3.PublicKey,
    owner: web3.PublicKey,
    allowOffCurveOwner: boolean = false,
    payer: web3.PublicKey = null
  ) {
    const ata = getAssociatedTokenAddressSync(mint, owner, allowOffCurveOwner);
    let ix = null;
    const info = await this.__connection.getAccountInfo(ata);

    if (!info) {
      ix = createAssociatedTokenAccountInstruction(
        payer ?? owner,
        ata,
        owner,
        mint
      );
    }

    return {
      ata,
      ix,
    };
  }
}
