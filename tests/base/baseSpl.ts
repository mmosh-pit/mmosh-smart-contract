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
  mintAuthority: web3.PublicKey;
  /** default (`mintAuthority`) */
  payer?: web3.PublicKey;
  /** default (`mintAuthority`) */
  freezAuthority?: web3.PublicKey;
  /** default (`0`) */
  decimal?: number;
  /** default (`Keypair.genrate()`) */
  mintKeypair?: web3.Keypair,
  mintingInfo?: {
    tokenReceiver?: web3.PublicKey;
    /** default (`1`) */
    tokenAmount?: number;
    /** default (`false`) */
    allowOffCurveOwner?: boolean;
  };
};

export type getOrCreateTokenAccountOptons = {
  mint: web3.PublicKey,
  owner: web3.PublicKey,
  /** default (`owner`) */
  payer?: web3.PublicKey,
  /** default (`false`) */
  allowOffCurveOwner?: boolean;
}


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
    let {
      mintAuthority,
      mintingInfo,
      decimal,
      payer,
      freezAuthority,
      mintKeypair,
    } = opts;

    payer = payer ?? mintAuthority;
    freezAuthority = freezAuthority ?? mintAuthority;
    decimal = decimal ?? 0;
    mintKeypair = mintKeypair ?? web3.Keypair.generate();

    const mint = mintKeypair.publicKey;
    const rent = await this.__connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );

    const ix1 = web3.SystemProgram.createAccount({
      fromPubkey: payer,
      lamports: rent,
      newAccountPubkey: mint,
      programId: TOKEN_PROGRAM_ID,
      space: MINT_SIZE,
    });
    this.__splIxs.push(ix1);

    const ix2 = createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimal,
      mintAuthority,
      freezAuthority
    );
    this.__splIxs.push(ix2);

    if (opts?.mintingInfo) {
      let {
        tokenReceiver,
        allowOffCurveOwner,
        tokenAmount
      } = mintingInfo;
      tokenReceiver = mintingInfo?.tokenReceiver ?? opts?.mintAuthority;
      allowOffCurveOwner = allowOffCurveOwner ?? false;
      tokenAmount = tokenAmount ?? 1

      const { ata, ix: createTokenAccountIx } =
        this.__getCreateTokenAccountInstruction(
          mint,
          tokenReceiver,
          allowOffCurveOwner,
          payer,
        );
      this.__splIxs.push(createTokenAccountIx);

      const ix3 = createMintToInstruction(
        mint,
        ata,
        mintAuthority,
        tokenAmount
      );
      this.__splIxs.push(ix3);
    }

    return {
      mintKp: mintKeypair,
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
    input: getOrCreateTokenAccountOptons,
    ixCallBack?: (ixs?: web3.TransactionInstruction[]) => void
  ) {
    let {
      owner,
      mint,
      payer,
      allowOffCurveOwner,
    } = input;
    allowOffCurveOwner = allowOffCurveOwner ?? false
    payer = payer ?? owner;

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
      if (ixCallBack) {
        ixCallBack([ix])
      }
    }

    return {
      ata,
      ix,
    };
  }
}
