import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3 } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Sop } from "../target/types/sop";
import {
  LineageInfo,
  MainState,
  MainStateInput,
  MintProfileByAdminInput,
  Result,
  TxPassType,
} from "./web3Types";
import Config from "./web3Config.json";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from './web3Consts'
import { BaseSpl } from "./base/baseSpl";

const {
  systemProgram,
  associatedTokenProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds,
  usdcMint
} = web3Consts;
const log = console.log;

export class Connectivity {
  programId: web3.PublicKey;
  provider: AnchorProvider;
  txis: web3.TransactionInstruction[] = [];
  extraSigns: web3.Keypair[] = [];
  multiSignInfo: any[] = [];
  program: Program<Sop>;
  owner: web3.PublicKey;
  mainState: web3.PublicKey;
  connection: web3.Connection;
  baseSpl: BaseSpl;

  // constructor(wallet: anchor.Wallet) {
  constructor(provider: AnchorProvider, programId: web3.PublicKey) {
    web3.SystemProgram.programId;
    // this.connection = new web3.Connection(Config.rpcURL);
    // this.provider = new anchor.AnchorProvider(this.connection, wallet, {
    //   commitment: "confirmed",
    // });
    this.provider = provider;
    this.connection = provider.connection

    this.programId = programId
    this.program = new Program(IDL, programId, this.provider);
    this.owner = this.provider.publicKey;
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState],
      this.programId
    )[0];
    this.baseSpl = new BaseSpl(this.connection)
  }

  reinit() {
    this.txis = [];
    this.extraSigns = [];
    this.multiSignInfo = [];
  }

  __getProfileStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.profileState,
      mint.toBuffer()
    ], this.programId)[0]
  }

  async initMainState(input: MainStateInput): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods
        .initMainState(input)
        .accounts({
          owner: this.owner,
          mainState: this.mainState,
          systemProgram,
        })
        .rpc();
      return { Ok: { signature } };
    } catch (e) {
      return { Err: e };
    }
  }

  async updateMainState(
    input: MainStateInput
  ): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods
        .updateMainState(input)
        .accounts({
          owner: this.owner,
          mainState: this.mainState,
        })
        .rpc();
      return { Ok: { signature } };
    } catch (e) {
      return { Err: e };
    }
  }

  async updateMainStateOwner(
    newOwner: web3.PublicKey
  ): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods
        .updateMainStateOwner(newOwner)
        .accounts({
          owner: this.owner,
          mainState: this.mainState,
        })
        .rpc();
      return { Ok: { signature } };
    } catch (e) {
      return { Err: e };
    }
  }

  // async initFakeIdState(
  //   newOwner: web3.PublicKey
  // ): Promise<Result<TxPassType, any>> {
  //   try {
  //     this.reinit();
  //     const signature = await this.program.methods
  //       .initFakeIdState()
  //       .accounts({
  //         owner: this.owner,
  //         mainState: this.mainState,
  //       })
  //       .rpc();
  //     return { Ok: { signature } };
  //   } catch (e) {
  //     return { Err: e };
  //   }
  // }
  //

  // async setupGenessisFakeId(
  //   lineage: LineageInfo
  // ): Promise<Result<TxPassType, any>> {
  //   try {
  //     this.reinit();
  //     const signature = await this.program.methods
  //       .setupGenesFakeId(lineage)
  //       .accounts({
  //         owner: this.owner,
  //         mainState: this.mainState,
  //       })
  //       .rpc();
  //     return { Ok: { signature } };
  //   } catch (e) {
  //     return { Err: e };
  //   }
  // }

  async createCollection(input: { name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ collection: string }>, any>> {
    try {
      this.reinit();
      let {
        name,
        symbol,
        uri,
      } = input;
      name = name ?? ""
      symbol = symbol ?? ""
      uri = uri ?? ""
      const admin = this.provider.publicKey;
      if (!admin) throw "Wallet not found"
      const mintKp = web3.Keypair.generate()
      const mint = mintKp.publicKey
      const adminAta = getAssociatedTokenAddressSync(mint, admin);
      const metadata = BaseMpl.getMetadataAccount(mint)
      const edition = BaseMpl.getEditionAccount(mint)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(mint, this.mainState)

      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: admin,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: 1,
          tokenReceiver: admin,
        }
      })
      const mintTx = new web3.Transaction().add(...mintIxs)
      const mintTxSignature = await this.provider.sendAndConfirm(mintTx, [mintKp])

      const cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 3000_00 })
      this.txis.push(cuBudgetIncIx)

      const ix = await this.program.methods.createCollection(name, symbol, uri).accounts({
        admin,
        adminAta,
        mainState: this.mainState,
        associatedTokenProgram,
        collection: mint,
        collectionEdition: edition,
        collectionMetadata: metadata,
        collectionAuthorityRecord,
        mplProgram,
        tokenProgram,
        systemProgram,
        sysvarInstructions,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx)

      return {
        Ok: { signature, info: { collection: mint.toBase58() } }
      }
    } catch (e) {
      log({ error: e })
      return { Err: e };
    }
  }

  async mintProfileByAdmin(input: MintProfileByAdminInput, collection: web3.PublicKey): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      const admin = this.provider.publicKey;
      if (!admin) throw "Wallet not found"
      const mintKp = web3.Keypair.generate()
      const profile = mintKp.publicKey
      const profileState = this.__getProfileStateAccount(profile);
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const collectionMetadata = BaseMpl.getMetadataAccount(collection)
      const collectionEdition = BaseMpl.getEditionAccount(collection)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(collection, this.mainState)
      const adminAta = getAssociatedTokenAddressSync(profile, admin);

      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: admin,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: 1,
          tokenReceiver: admin,
        }
      })
      const mintTx = new web3.Transaction().add(...mintIxs)
      const mintTxSignature = await this.provider.sendAndConfirm(mintTx, [mintKp])

      const cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 3000_00 })
      this.txis.push(cuBudgetIncIx)

      const ix = await this.program.methods.mintProfileByAdmin(input).accounts({
        admin,
        adminAta,
        profile,
        mainState: this.mainState,
        collection,
        mplProgram,
        profileState,
        associatedTokenProgram,
        tokenProgram,
        systemProgram,
        profileEdition,
        profileMetadata,
        collectionEdition,
        collectionMetadata,
        collectionAuthorityRecord,
        sysvarInstructions,
      }).instruction();
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx)

      return {
        Ok: { signature, info: { profile: profile.toBase58() } }
      }
    } catch (e) {
      log({ error: e })
      return { Err: e };
    }
  }

  async getMainStateInfo() {
    const res = await this.program.account.mainState.fetch(this.mainState);
    return res;
  }
}
