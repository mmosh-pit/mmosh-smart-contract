import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Mmoshforge } from "../target/types/mmoshforge";
import {
  LineageInfo,
  MainState,
  MainStateInput,
  MintProfileByAdminInput,
  Result,
  TxPassType,
} from "./web3Types";
import Config from "./web3Config.json";
import { getAssociatedTokenAddressSync, getNonTransferable, unpackAccount } from "@solana/spl-token";
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
  oposToken
} = web3Consts;
const log = console.log;

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Connectivity {
  programId: web3.PublicKey;
  provider: AnchorProvider;
  txis: web3.TransactionInstruction[] = [];
  extraSigns: web3.Keypair[] = [];
  multiSignInfo: any[] = [];
  program: Program<Mmoshforge>;
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
      console.log("error is ",e)
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

  async resetMain(): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const signature = await this.program.methods.resetMain().accounts({
        owner: this.provider.publicKey,
        mainState: this.mainState,
        systemProgram,
      }).rpc();
      return { Ok: { signature } };
    } catch (e) {
      return { Err: e };
    }
  }

  async createCollection(input: { name?: string, symbol?: string, uri?: string, parrentCollection?: web3.PublicKey, collectionType: string }): Promise<Result<TxPassType<{ collection: string }>, any>> {
    try {
      this.reinit();
      let {
        name,
        symbol,
        uri,
        parrentCollection,
        collectionType
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

      const rootCollection = parrentCollection ? parrentCollection : mintKp.publicKey

      const parentCollectionMetadata = BaseMpl.getMetadataAccount(rootCollection)
      const parentCollectionEdition = BaseMpl.getEditionAccount(rootCollection)

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

      const ix = await this.program.methods.createCollection(name, symbol, uri, collectionType).accounts({
        admin,
        adminAta,
        mainState: this.mainState,
        associatedTokenProgram,
        collection: mint,
        collectionEdition: edition,
        collectionMetadata: metadata,
        collectionAuthorityRecord,
        collectionState,
        parentCollection: rootCollection,
        parentCollectionEdition: parentCollectionEdition,
        parentCollectionMetadata: parentCollectionMetadata,
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

  async updateCollection(input: { name?: string, symbol?: string, uri?: string, mint?: web3.PublicKey, parrentCollection?: web3.PublicKey}): Promise<Result<TxPassType<{ collection: string }>, any>> {
    try {
      this.reinit();
      let {
        name,
        symbol,
        uri,
        mint,
        parrentCollection,
      } = input;
      name = name ?? ""
      symbol = symbol ?? ""
      uri = uri ?? ""
      const admin = this.provider.publicKey;
      if (!admin) throw "Wallet not found"

      const adminAta = getAssociatedTokenAddressSync(mint, admin);
      const metadata = BaseMpl.getMetadataAccount(mint)
      const edition = BaseMpl.getEditionAccount(mint)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(mint, this.mainState)
      const collectionState = this.__getCollectionStateAccount(mint)

      const rootCollection = parrentCollection ? parrentCollection : mint
      const parentCollectionMetadata = BaseMpl.getMetadataAccount(rootCollection)
      const parentCollectionEdition = BaseMpl.getEditionAccount(rootCollection)

      const cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 3000_00 })
      this.txis.push(cuBudgetIncIx)

      const ix = await this.program.methods.updateCollection(name, symbol, uri).accounts({
        admin,
        mainState: this.mainState,
        associatedTokenProgram,
        collection: mint,
        collectionEdition: edition,
        collectionMetadata: metadata,
        parentCollection: rootCollection,
        parentCollectionEdition,
        parentCollectionMetadata,
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


  // async mintGenesisProfile(input: { name: string, symbol: string, uri: string }): Promise<Result<TxPassType<{ profile: string }>, any>> {
  async mintGenesisProfile(input: MintProfileByAdminInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      const admin = this.provider.publicKey;
      if (!admin) throw "Wallet not found"
      const mainState = await this.program.account.mainState.fetch(this.mainState)
      if (mainState.genesisProfile.toBase58() != web3.SystemProgram.programId.toBase58()) {
        return { Ok: { signature: "", info: { profile: mainState.genesisProfile.toBase58() } } }
      }
      const collection = mainState.profileCollection
      const collectionState = this.__getCollectionStateAccount(collection)
      // const __profileCollectionInfo = await this.program.account.collectionState.fetch(collectionState)
      // const __genesisProfile = __profileCollectionInfo.genesisProfile?.toBase58()
      // if (__genesisProfile && __genesisProfile != web3.SystemProgram.programId.toBase58()) return { Ok: { signature: "", info: { profile: __profileCollectionInfo.genesisProfile?.toBase58() } } }

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

      // const args: MintProfileByAdminInput = {
      //   name: input.name,
      //   symbol: input.symbol,
      //   uri: input.uri,
      //   lineage: {
      //     parent: profile,
      //     creator: admin,
      //     generation: new anchor.BN(1),
      //     totalChild: new BN(0),//not require
      //     grandParent: profile,
      //     greatGrandParent: profile,
      //     ggreateGrandParent: profile,
      //   },
      //   parentMint: profile,
      // }

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

  return

  async initActivationToken(input: { name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ activationToken: string }>, any>> {
    try {
      const user = this.provider.publicKey;
      this.reinit();
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

      const parentCollection = web3Consts.badgeCollection
      const parentCollectionMetadata = BaseMpl.getMetadataAccount(parentCollection)
      const parentCollectionEdition = BaseMpl.getEditionAccount(parentCollection)

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
        parentCollection,
        parentCollectionMetadata,
        parentCollectionEdition
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


  async mintActivationToken(amount: number, receiver?: web3.PublicKey | string,): Promise<Result<TxPassType<any>, any>> {
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

      const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(activationTokenState)
      const parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileState = this.__getProfileStateAccount(parentProfile);
      const parentProfileStateInfo = await this.program.account.profileState.fetch(this.__getProfileStateAccount(parentProfile))

      const {
        //profiles
        // genesisProfile,
        // parentProfile,
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,
        //
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGrandParentProfileHolder,
        currentGenesisProfileHolder,
        currentParentProfileHolder,
        //
        currentParentProfileHolderAta,
        currentGenesisProfileHolderAta,
        currentGrandParentProfileHolderAta,
        currentGreatGrandParentProfileHolderAta,
        currentGgreatGrandParentProfileHolderAta,
        //
        parentProfileHolderOposAta,
        genesisProfileHolderOposAta,
        grandParentProfileHolderOposAta,
        greatGrandParentProfileHolderOposAta,
        ggreatGrandParentProfileHolderOposAta,
      } = await this.__getProfileHoldersInfo(parentProfileStateInfo.lineage, parentProfile, profile)

      const userOposAta = getAssociatedTokenAddressSync(oposToken, user)
      
      const ix = await this.program.methods.mintActivationToken(new BN(amount)).accounts({
        activationTokenState,
        tokenProgram,
        activationToken,
        profile,
        profileState,
        minterProfileAta,
        mainState: this.mainState,
        minter: user,
        receiverAta,
        //NOTE: Profile minting cost distributaion account
        oposToken,
        systemProgram,
        associatedTokenProgram,
        userOposAta,
        parentProfileState,

        //Profiles
        parentProfile,
        genesisProfile: profile,
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,

        //verification ata
        currentParentProfileHolderAta,
        currentGrandParentProfileHolderAta,
        currentGreatGrandParentProfileHolderAta,
        currentGgreatGrandParentProfileHolderAta,
        currentGenesisProfileHolderAta,
        // profile owners
        currentParentProfileHolder,
        currentGrandParentProfileHolder,
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGenesisProfileHolder,

        // holder opos ata
        parentProfileHolderOposAta,
        grandParentProfileHolderOposAta,
        greatGrandParentProfileHolderOposAta,
        ggreatGrandParentProfileHolderOposAta,
        genesisProfileHolderOposAta,
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

  async setupLookupTable(addresses: web3.PublicKey[] = []): Promise<Result<TxPassType<{ lookupTable: string }>, any>> {
    try {
      const slot = await this.connection.getSlot();
      const [lookupTableInst, lookupTableAddress] =
        web3.AddressLookupTableProgram.createLookupTable({
          authority: this.provider.publicKey,
          payer: this.provider.publicKey,
          recentSlot: slot - 1,
        });

      const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
        payer: this.provider.publicKey,
        authority: this.provider.publicKey,
        lookupTable: lookupTableAddress,
        addresses,
      });
      const freezeInstruction = web3.AddressLookupTableProgram.freezeLookupTable({
        lookupTable: lookupTableAddress, // The address of the lookup table to freeze
        authority: this.provider.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
      });

      const transaction = new web3.Transaction().add(lookupTableInst, extendInstruction, freezeInstruction)
      const signature = await this.provider.sendAndConfirm(transaction as any);
      return { Ok: { signature, info: { lookupTable: lookupTableAddress.toBase58() } } }
    } catch (err) {
      log("Error: ", err)
      return { Err: err }
    }
  }

  async setCommonLut(lut: web3.PublicKey | string): Promise<Result<TxPassType<any>, any>> {
    try {
      if (typeof lut == 'string') lut = new web3.PublicKey(lut)
      const signature = await this.program.methods.setCommonLut(lut).accounts({
        owner: this.provider.publicKey,
        mainState: this.mainState,
      }).rpc();

      return {
        Ok: { signature }
      }
    } catch (error) {
      log("setCommonLut Error: ", error)
      return { Err: error }
    }
  }

  async getMainStateInfo() {
    const res = await this.program.account.mainState.fetch(this.mainState);
    return res;
  }

  async __getProfileHoldersInfo(input: LineageInfo, parentProfile: web3.PublicKey, genesisProfile: web3.PublicKey): Promise<{
    //profiles:
    parentProfile: web3.PublicKey,
    grandParentProfile: web3.PublicKey,
    greatGrandParentProfile: web3.PublicKey,
    ggreateGrandParentProfile: web3.PublicKey,
    genesisProfile: web3.PublicKey,
    //Profile holder ata
    currentParentProfileHolderAta: web3.PublicKey,
    currentGrandParentProfileHolderAta: web3.PublicKey,
    currentGreatGrandParentProfileHolderAta: web3.PublicKey,
    currentGgreatGrandParentProfileHolderAta: web3.PublicKey,
    currentGenesisProfileHolderAta: web3.PublicKey,
    // profile owners
    currentParentProfileHolder: web3.PublicKey,
    currentGrandParentProfileHolder: web3.PublicKey,
    currentGreatGrandParentProfileHolder: web3.PublicKey,
    currentGgreatGrandParentProfileHolder: web3.PublicKey,
    currentGenesisProfileHolder: web3.PublicKey,
    // opos accounts
    parentProfileHolderOposAta: web3.PublicKey,
    grandParentProfileHolderOposAta: web3.PublicKey,
    greatGrandParentProfileHolderOposAta: web3.PublicKey,
    ggreatGrandParentProfileHolderOposAta: web3.PublicKey,
    genesisProfileHolderOposAta: web3.PublicKey,
  }> {
    const grandParentProfile = input.parent
    const greatGrandParentProfile = input.grandParent;
    const ggreateGrandParentProfile = input.greatGrandParent;

    const currentParentProfileHolderAta = (await this.connection.getTokenLargestAccounts(parentProfile)).value[0].address
    const currentGrandParentProfileHolderAta = (await this.connection.getTokenLargestAccounts(grandParentProfile)).value[0].address
    const currentGreatGrandParentProfileHolderAta = (await this.connection.getTokenLargestAccounts(greatGrandParentProfile)).value[0].address
    const currentGgreatGrandParentProfileHolderAta = (await this.connection.getTokenLargestAccounts(ggreateGrandParentProfile)).value[0].address
    const currentGenesisProfileHolderAta = (await this.connection.getTokenLargestAccounts(genesisProfile)).value[0].address

    const atasInfo = await this.connection.getMultipleAccountsInfo([
      currentParentProfileHolderAta,
      currentGrandParentProfileHolderAta,
      currentGreatGrandParentProfileHolderAta,
      currentGgreatGrandParentProfileHolderAta,
      currentGenesisProfileHolderAta
    ])

    const currentParentProfileHolder = unpackAccount(currentParentProfileHolderAta, atasInfo[0]).owner
    const currentGrandParentProfileHolder = unpackAccount(currentGrandParentProfileHolderAta, atasInfo[1]).owner
    const currentGreatGrandParentProfileHolder = unpackAccount(currentGreatGrandParentProfileHolderAta, atasInfo[2]).owner
    const currentGgreatGrandParentProfileHolder = unpackAccount(currentGgreatGrandParentProfileHolderAta, atasInfo[3]).owner
    const currentGenesisProfileHolder = unpackAccount(currentGenesisProfileHolderAta, atasInfo[4]).owner

    return {
      //profiles:
      parentProfile,
      grandParentProfile,
      greatGrandParentProfile,
      ggreateGrandParentProfile,
      genesisProfile,
      // profile holder profile ata
      currentParentProfileHolderAta,
      currentGrandParentProfileHolderAta,
      currentGreatGrandParentProfileHolderAta,
      currentGgreatGrandParentProfileHolderAta,
      currentGenesisProfileHolderAta,

      // profile holders
      currentParentProfileHolder,
      currentGrandParentProfileHolder,
      currentGreatGrandParentProfileHolder,
      currentGgreatGrandParentProfileHolder,
      currentGenesisProfileHolder,

      // profile holder oposAta
      parentProfileHolderOposAta: getAssociatedTokenAddressSync(oposToken, currentParentProfileHolder),
      grandParentProfileHolderOposAta: getAssociatedTokenAddressSync(oposToken, currentGrandParentProfileHolder),
      greatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(oposToken, currentGreatGrandParentProfileHolder),
      ggreatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(oposToken, currentGgreatGrandParentProfileHolder),
      genesisProfileHolderOposAta: getAssociatedTokenAddressSync(oposToken, currentGenesisProfileHolder),
    }
  }
}


