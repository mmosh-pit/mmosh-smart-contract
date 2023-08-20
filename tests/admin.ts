import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@project-serum/anchor";
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
import { getAssociatedTokenAddressSync, getNonTransferable } from "@solana/spl-token";
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
  oposToken: usdcMint
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

  ixCallBack = (ixs?: web3.TransactionInstruction[]) => {
    if (ixs) {
      this.txis.push(...ixs)
    }
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

  __getCollectionStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.collectionState,
      mint.toBuffer()
    ], this.programId)[0]
  }

  __getActivationTokenStateAccount(token: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.activationTokenState,
      token.toBuffer()
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

  async createProfileCollection(input: { name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ collection: string }>, any>> {
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
      const collectionState = this.__getCollectionStateAccount(mint)

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

      const ix = await this.program.methods.createProfileCollection(name, symbol, uri).accounts({
        admin,
        adminAta,
        mainState: this.mainState,
        associatedTokenProgram,
        collection: mint,
        collectionEdition: edition,
        collectionMetadata: metadata,
        collectionAuthorityRecord,
        collectionState,
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

  async mintGenesisProfile(input: MintProfileByAdminInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      const admin = this.provider.publicKey;
      if (!admin) throw "Wallet not found"
      const mainState = await this.program.account.mainState.fetch(this.mainState)
      const collection = mainState.profileCollection
      const collectionState = this.__getCollectionStateAccount(collection)
      const __profileCollectionInfo = await this.program.account.collectionState.fetch(collectionState)
      const __genesisProfile = __profileCollectionInfo.genesisProfile?.toBase58()
      if (__genesisProfile && __genesisProfile != web3.SystemProgram.programId.toBase58()) return { Ok: { signature: "", info: { profile: __profileCollectionInfo.genesisProfile?.toBase58() } } }

      const mintKp = web3.Keypair.generate()
      const profile = mintKp.publicKey
      const profileState = this.__getProfileStateAccount(profile);
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const collectionMetadata = BaseMpl.getMetadataAccount(collection)
      const collectionEdition = BaseMpl.getEditionAccount(collection)
      // const collectionState = this.__getCollectionStateAccount(collection)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(collection, this.mainState)
      const subCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState)
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

      const ix = await this.program.methods.mintGenesisProfile(input).accounts({
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
        collectionState,
        subCollectionAuthorityRecord,
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

  async initActivationToken(input: { name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ activationToken: string }>, any>> {
    try {
      const user = this.provider.publicKey;


      const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
      const collectionStateAccount = this.__getCollectionStateAccount(mainStateInfo.profileCollection)
      const collectionStateInfo = await this.program.account.collectionState.fetch(collectionStateAccount)
      const profile = collectionStateInfo.genesisProfile
      if (!profile) return { Err: "Genesis profile not found" }
      const profileState = this.__getProfileStateAccount(profile)
      const profileStateInfo = await this.program.account.profileState.fetch(profileState)
      if (profileStateInfo.activationToken) return { Ok: { signature: "", info: { activationToken: profileStateInfo.activationToken.toBase58() } } }

      // const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
      // const collectionStateAccount = this.__getCollectionStateAccount(mainStateInfo.profileCollection)
      // const collectionStateInfo = await this.program.account.collectionState.fetch(collectionStateAccount)
      // const profile = collectionStateInfo.genesisProfile
      // if (!profile) return { Err: "Genesis profile not found" }
      // const profileState = this.__getProfileStateAccount(profile)

      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const profileCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState)
      const { ata: userProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: profile, owner: user }, this.ixCallBack)
      const activationTokenKp = web3.Keypair.generate();
      const activationToken = activationTokenKp.publicKey
      const activationTokenMetadata = BaseMpl.getMetadataAccount(activationToken)
      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const userActivationTokenAta = getAssociatedTokenAddressSync(activationToken, user)

      let { name, symbol, uri } = input;
      symbol = symbol ?? ""
      uri = uri ?? ""
      const ix = await this.program.methods.initActivationToken(name, symbol, uri).accounts({
        profile,
        mainState: this.mainState,
        user,
        associatedTokenProgram,
        mplProgram,
        profileState,
        tokenProgram,
        systemProgram,
        profileEdition,
        userProfileAta,
        activationToken,
        profileMetadata,
        sysvarInstructions,
        activationTokenState,
        userActivationTokenAta,
        activationTokenMetadata,
        profileCollectionAuthorityRecord,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      const signature = await this.provider.sendAndConfirm(tx, [activationTokenKp]);
      return { Ok: { signature, info: { activationToken: activationToken.toBase58() } } }
    } catch (e) {
      log({ error: e })
      return { Err: e };
    }
  }

  async mintActivationToken(receiver?: web3.PublicKey | string): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"

      const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
      const collectionStateAccount = this.__getCollectionStateAccount(mainStateInfo.profileCollection)
      const collectionStateInfo = await this.program.account.collectionState.fetch(collectionStateAccount)
      const profile = collectionStateInfo.genesisProfile
      const profileState = this.__getProfileStateAccount(profile)
      const profileStateInfo = await this.program.account.profileState.fetch(profileState)
      const activationToken = profileStateInfo.activationToken
      if (!activationToken) return { Err: "Activation Not Found" }
      // if (typeof _activationToken == 'string') activationToken = new web3.PublicKey(_activationToken)
      if (!receiver) receiver = user;
      if (typeof receiver == 'string') receiver = new web3.PublicKey(receiver)
      const { ata: receiverAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: activationToken, owner: receiver, payer: user }, this.ixCallBack)
      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      // const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(activationTokenState)
      // const profile = activationTokenStateInfo.parentProfile
      // const profileState = this.__getProfileStateAccount(profile)
      const { ata: minterProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: profile, owner: user }, this.ixCallBack)

      const ix = await this.program.methods.mintActivationToken(new BN(1)).accounts({
        activationTokenState,
        tokenProgram,
        activationToken,
        profile,
        profileState,
        minterProfileAta,
        mainState: this.mainState,
        minter: user,
        receiverAta,
      }).instruction()
      this.txis.push(ix)
      const tx = new web3.Transaction().add(...this.txis)
      const signature = await this.provider.sendAndConfirm(tx)
      return { Ok: { signature, info: {} } }
    } catch (error) {
      log({ error })
      return { Err: error }
    }
  }

  // async setMembershipCollection(collection: string | web3.PublicKey): Promise<Result<TxPassType<any>, any>> {
  //   try {
  //     if (typeof collection == 'string') collection = new web3.PublicKey(collection)
  //     const signature = await this.program.methods.setMembershipCollection(collection).accounts({ owner: this.provider.publicKey, mainState: this.mainState }).rpc();
  //     return {
  //       Ok: { signature }
  //     }
  //   } catch (e) {
  //     log({ error: e })
  //     return { Err: e };
  //   }
  // }

  // async setBrandCollection(collection: string | web3.PublicKey): Promise<Result<TxPassType<any>, any>> {
  //   try {
  //     if (typeof collection == 'string') collection = new web3.PublicKey(collection)
  //     const signature = await this.program.methods.setBrandCollection(collection).accounts({ owner: this.provider.publicKey, mainState: this.mainState }).rpc();
  //     return {
  //       Ok: { signature }
  //     }
  //   } catch (e) {
  //     log({ error: e })
  //     return { Err: e };
  //   }
  // }


  async getMainStateInfo() {
    const res = await this.program.account.mainState.fetch(this.mainState);
    return res;
  }
}
