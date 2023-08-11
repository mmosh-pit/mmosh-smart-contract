import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3 } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Sop } from "../target/types/sop";
import {
  FakeIdState,
  LineageInfo,
  MainState,
  MainStateInput,
  Result,
  TxPassType,
} from "./web3Types";
import Config from "./web3Config.json";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from './web3Consts'

const {
  systemProgram,
  ataProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds
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

  constructor(wallet: anchor.Wallet) {
    web3.SystemProgram.programId;
    this.connection = new web3.Connection(Config.rpcURL);
    this.provider = new anchor.AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });

    this.program = new Program(IDL, this.programId, this.provider);
    this.owner = this.provider.publicKey;
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState],
      this.programId
    )[0];
  }

  reinit() {
    this.txis = [];
    this.extraSigns = [];
    this.multiSignInfo = [];
  }

  async initMainState(input: MainStateInput): Promise<Result<TxPassType, any>> {
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
  ): Promise<Result<TxPassType, any>> {
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
  ): Promise<Result<TxPassType, any>> {
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

  async initFakeIdState(
    newOwner: web3.PublicKey
  ): Promise<Result<TxPassType, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods
        .initFakeIdState()
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

  async setupGenessisFakeId(
    lineage: LineageInfo
  ): Promise<Result<TxPassType, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods
        .setupGenesisFakeId(lineage)
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

  async createCollection(): Promise<Result<TxPassType, any>> {
    try {
      this.reinit();
      const owner = this.provider.publicKey;
      if (!owner) throw "Wallet not found"
      const mintKp = web3.Keypair.generate()
      const mint = mintKp.publicKey
      const ownerAta = getAssociatedTokenAddressSync(mint, owner);
      const metadata = BaseMpl.getMetadataAccount(mint)
      const edition = BaseMpl.getEditionAccount(mint)
      const name = ""
      const symbol = ""
      const uri = ""

      const signature = await this.program.methods.createCollection(name, symbol, uri).accounts({
        owner,
        ownerAta,
        mainState: this.mainState,
        ataProgram,
        collection: mint,
        mplProgram,
        tokenProgram,
        systemProgram,
        collectionEdition: edition,
        collectionMetadata: metadata,
        sysvarInstructions,
      })

    } catch (e) {
      return { Err: e };
    }
  }
}
