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

const log = console.log;

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
  checkCache?: boolean
}

export type TranferTokenInputs = {
  sender: web3.PublicKey,
  receiver: web3.PublicKey,
  mint: web3.PublicKey,
  /** default (`1`) */
  amount?: number,
  /** default (`false`) */
  allowOffCurveOwner?: boolean
  /** default (`false`) */
  init_if_needed?: boolean,
  /** default (`sender`) */
  payer?: web3.PublicKey
}

export type MintToken = {
  mint: web3.PublicKey,
  authority: web3.PublicKey,
  /** default (`authority`) */
  payer?: web3.PublicKey,
  /** default (`authority`) */
  receiver?: web3.PublicKey,
  /** default (`1`) */
  amount?: number,
  /** default (`0`) */
  decimal?: number
}

export class BaseSpl {
  __connection: web3.Connection;
  __splIxs: web3.TransactionInstruction[] = [];
  __cacheAta: Set<String>;

  constructor(connection: web3.Connection) {
    this.__connection = connection;
    this.__cacheAta = new Set();
  }

  __reinit() {
    this.__splIxs = [];
    this.__cacheAta = new Set();
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
      checkCache
    } = input;
    allowOffCurveOwner = allowOffCurveOwner ?? false
    payer = payer ?? owner;

    const ata = getAssociatedTokenAddressSync(mint, owner, allowOffCurveOwner);
    let ix: web3.TransactionInstruction = null;
    const info = await this.__connection.getAccountInfo(ata);

    if (!info) {
      ix = createAssociatedTokenAccountInstruction(
        payer ?? owner,
        ata,
        owner,
        mint
      );
      if (ixCallBack) {
        if (checkCache) {
          if (!this.__cacheAta.has(ata.toBase58())) {
            ixCallBack([ix])
            this.__cacheAta.add(ata.toBase58())
          } else log("already exist")
        } else {
          ixCallBack([ix])
        }
      }
    }

    return {
      ata,
      ix,
    };
  }

  async transfer_token(input: TranferTokenInputs, ixCallBack?: (ixs?: web3.TransactionInstruction[]) => void) {
    this.__reinit();
    let {
      mint,
      sender,
      receiver,
      amount,
      payer,
      init_if_needed,
      allowOffCurveOwner,
    } = input;
    amount = amount ?? 1;
    payer = payer ?? sender
    init_if_needed = init_if_needed ?? false
    allowOffCurveOwner = allowOffCurveOwner ?? false
    let senderAta: web3.PublicKey = getAssociatedTokenAddressSync(mint, sender)
    let receiverAta: web3.PublicKey = getAssociatedTokenAddressSync(mint, receiver, allowOffCurveOwner)

    let ixs: web3.TransactionInstruction[] = []
    if (init_if_needed) {
      const { ix: initIx } = await this.__getOrCreateTokenAccountInstruction({ mint, allowOffCurveOwner, payer, owner: receiver, checkCache: true })
      ixs.push(initIx)
    }
    const transferIx = createTransferInstruction(senderAta, receiverAta, sender, amount);
    ixs.push(transferIx)
    if (ixCallBack) ixCallBack(ixs)

    return ixs
  }

  async mintToken(input: MintToken, ixCallBack?: (ixs?: web3.TransactionInstruction[]) => void) {
    this.__reinit();
    let {
      mint,
      authority,
      payer,
      receiver,
      amount,
      decimal,
    } = input;
    payer = payer ?? authority;
    receiver = receiver ?? authority
    amount = amount ?? 1
    decimal = decimal ?? 0
    if (decimal != 0) {
      amount = Math.trunc(Math.pow(10, decimal) * amount)
    }

    const { ata, ix: initAtaIx } = await this.__getOrCreateTokenAccountInstruction({ payer, mint, owner: receiver })
    if (initAtaIx) this.__splIxs.push(initAtaIx)

    const ix = createMintToInstruction(
      mint,
      ata,
      authority,
      amount
    );
    this.__splIxs.push(ix)

    return { ixs: this.__splIxs }
  }
}
