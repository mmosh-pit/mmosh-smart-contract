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
  Result,
  TxPassType,
  _MintProfileByAtInput,
  _MintProfileInput,
  _MintSubscriptionToken,
} from "./web3Types";
import Config from "./web3Config.json";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from './web3Consts'
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, NATIVE_MINT, getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import { Metaplex, Metadata as MetadataM } from '@metaplex-foundation/js'
import { BaseSpl } from "./base/baseSpl";
import { BondingPricing, IBuyArgs, ICreateTokenBondingArgs, ICreateTokenBondingOutput, ICurve, IInitializeCurveArgs, IPricingCurve, ISellArgs, fromCurve } from "./curves";
import { InstructionResult, TypedAccountParser, amountAsNum, createMintInstructions, getMintInfo, getTokenAccount, percent, toBN } from "@strata-foundation/spl-utils";
import { IdlAccounts, Idl } from '@project-serum/anchor';

import { Token } from "spl-token-curve";
import { BondingHierarchy } from "./bondingHierarchy";
import { asDecimal, toNumber } from "./utils";
import { CreateMetadataV2, DataV2, Metadata } from "@metaplex-foundation/mpl-token-metadata";

export type ProgramStateV0 = IdlAccounts<Sop>["programStateV0"]
export type CurveV0 = IdlAccounts<Sop>["curveV0"]
export type TokenBondingV0 = IdlAccounts<Sop>["tokenBondingV0"]

export interface IProgramState extends ProgramStateV0 {
  publicKey: anchor.web3.PublicKey;
}

export interface ITokenBonding extends TokenBondingV0 {
  publicKey: anchor.web3.PublicKey;
}

export interface ICurveConfig {
  toRawConfig(): CurveV0;
}

const {
  systemProgram,
  associatedTokenProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds,
  oposToken,
  LAMPORTS_PER_OPOS,
  addressLookupTableProgram,
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
  program: Program<Sop>;
  mainState: web3.PublicKey;
  connection: web3.Connection;
  metaplex: Metaplex
  baseSpl: BaseSpl
  state: IProgramState | undefined;
  account

  tokenBondingDecoder: TypedAccountParser<ITokenBonding> = (
    pubkey,
    account
  ) => {
    const coded = this.program.coder.accounts.decode<ITokenBonding>(
      "tokenBondingV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

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
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState],
      this.programId
    )[0];
    this.metaplex = new Metaplex(this.connection);
    this.baseSpl = new BaseSpl(this.connection)
    this.account = this.program.account;
  }

  curveDecoder: TypedAccountParser<ICurve> = (pubkey, account) => {
    const coded = this.program.coder.accounts.decode<CurveV0>(
      "curveV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  reinit() {
    this.txis = [];
    this.extraSigns = [];
    this.multiSignInfo = [];
  }

  ixCallBack = (ixs?: web3.TransactionInstruction[]) => {
    if (ixs) {
      this.txis.push(...ixs)
    }
  }
  __getProfileStateAccount(mint: web3.PublicKey | string): web3.PublicKey {
    if (typeof mint == 'string') mint = new web3.PublicKey(mint)
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

  __getActivationTokenStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.activationTokenState,
      mint.toBuffer()
    ], this.programId)[0]
  }
  __getValutAccount(profile: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.vault,
      profile.toBuffer()
    ], this.programId)[0]
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


  async mintProfileByActivationToken(input: _MintProfileByAtInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"
      let {
        name, symbol, uriHash,
        activationToken,
        genesisProfile,
        commonLut,
      } = input;
      if (typeof activationToken == 'string') activationToken = new web3.PublicKey(activationToken)
      if (typeof genesisProfile == 'string') genesisProfile = new web3.PublicKey(activationToken)
      if (typeof commonLut == 'string') commonLut = new web3.PublicKey(commonLut)
      symbol = symbol ?? ""
      uriHash = uriHash ?? ""

      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(activationTokenState)
      const parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileStateInfo = await this.program.account.profileState.fetch(this.__getProfileStateAccount(parentProfile))
      const lut = parentProfileStateInfo.lut;
      const parentProfileNftInfo = await this.metaplex.nfts().findByMint({ mintAddress: parentProfile, loadJsonMetadata: false })
      const collection = parentProfileNftInfo?.collection?.address
      if (!collection) return { Err: "Collection info not found" }
      const collectionMetadata = BaseMpl.getMetadataAccount(collection)
      const collectionEdition = BaseMpl.getEditionAccount(collection)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(collection, this.mainState)
      const mintKp = web3.Keypair.generate()
      const profile = mintKp.publicKey
      const userProfileAta = getAssociatedTokenAddressSync(profile, user);
      const { ata: userActivationTokenAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: activationToken, owner: user }, this.ixCallBack)
      const activationTokenMetadata = BaseMpl.getMetadataAccount(activationToken)
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const profileState = this.__getProfileStateAccount(profile)
      const parentProfileMetadata = BaseMpl.getMetadataAccount(parentProfile)
      const parentProfileState = this.__getProfileStateAccount(parentProfile)
      const subCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState)
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
      } = await this.__getProfileHoldersInfo(parentProfileStateInfo.lineage, parentProfile, genesisProfile)
      const userOposAta = getAssociatedTokenAddressSync(oposToken, user)

      const recentSlot = (await this.connection.getSlot() - 2);

      // const lookupResult = await this.setupLookupTable([
      //   profile, 
      //   user,
      //   oposToken, // 1
      //   userOposAta,
      //   userProfileAta,
      //   profileState,
      //   profileEdition,
      //   activationToken,
      //   profileMetadata,
      //   parentProfileState,
      //   sysvarInstructions, // 9
      //   userActivationTokenAta,
      //   parentProfile,
      //   currentParentProfileHolder,
      //   currentGrandParentProfileHolder,
      //   currentGreatGrandParentProfileHolder,
      //   currentGgreatGrandParentProfileHolder,
      //   currentGenesisProfileHolder,
      //   parentProfileHolderOposAta,
      //   grandParentProfileHolderOposAta,
      //   greatGrandParentProfileHolderOposAta,
      //   ggreatGrandParentProfileHolderOposAta,
      //   genesisProfileHolderOposAta,
      // ])

      // console.log("lookupResult ", lookupResult)

      // const profileLut= new web3.PublicKey(lookupResult.Ok.info.lookupTable)

      let cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 8000_00 })
      this.txis.push(cuBudgetIncIx)

      const ix = await this.program.methods.mintProfileByAt(
        name, symbol, uriHash
      ).accounts({
        profile, 
        user,
        oposToken, // 1
        userOposAta,
        userProfileAta,
        mainState: this.mainState, // 2
        collection, // 4
        mplProgram, // 3
        profileState,
        tokenProgram, // 5
        systemProgram, // 6
        profileEdition,
        activationToken,
        profileMetadata,
        collectionEdition, // 7
        collectionMetadata, // 8
        parentProfileState,
        sysvarInstructions, // 9
        userActivationTokenAta,
        associatedTokenProgram, // 10
        parentProfile,
        currentParentProfileHolder,
        currentGrandParentProfileHolder,
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGenesisProfileHolder,
        parentProfileHolderOposAta,
        grandParentProfileHolderOposAta,
        greatGrandParentProfileHolderOposAta,
        ggreatGrandParentProfileHolderOposAta,
        genesisProfileHolderOposAta,
      }).instruction()
      this.txis.push(ix)


      const commonLutInfo = await (await (this.connection.getAddressLookupTable(commonLut))).value

      const lutsInfo = [commonLutInfo]

      const blockhash = (await this.connection.getLatestBlockhash()).blockhash
      const message = new web3.TransactionMessage({
        payerKey: this.provider.publicKey,
        recentBlockhash: blockhash,
        instructions: [...this.txis],
      }).compileToV0Message(lutsInfo);

      const tx = new web3.VersionedTransaction(message);
      tx.sign([mintKp])
      this.txis = []

      const signedTx = await this.provider.wallet.signTransaction(tx as any);
      const txLen = signedTx.serialize().length;


      log({ txLen, luts: lutsInfo.length });

    

      const signature = await this.provider.sendAndConfirm(tx as any);

      return {
        Ok: {
          signature, info: { profile: profile.toBase58() }
        }
      }
    } catch (error) {
      log({ error })
      return { Err: error };
    }
  }

  async initSubscriptionBadge(input: { profile: web3.PublicKey | string, name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ subscriptionToken: string }>, any>> {
    try {
      const user = this.provider.publicKey;
      this.reinit()
      let { profile, name, symbol, uri } = input;
      symbol = symbol ?? ""
      uri = uri ?? ""

      if (typeof profile == 'string') profile = new web3.PublicKey(profile)
      const profileState = this.__getProfileStateAccount(profile)
      const profileStateInfo = await this.program.account.profileState.fetch(profileState)
      if (profileStateInfo.activationToken) return { Ok: { signature: "", info: { subscriptionToken: profileStateInfo.activationToken.toBase58() } } }
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const profileCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState)
      const { ata: userProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: profile, owner: user }, this.ixCallBack)
      const activationTokenKp = web3.Keypair.generate();
      const activationToken = activationTokenKp.publicKey
      const activationTokenMetadata = BaseMpl.getMetadataAccount(activationToken)
      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const userActivationTokenAta = getAssociatedTokenAddressSync(activationToken, user)

      const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
      const parentCollection = web3Consts.badgeCollection
      const parentCollectionMetadata = BaseMpl.getMetadataAccount(parentCollection)
      const parentCollectionEdition = BaseMpl.getEditionAccount(parentCollection)


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
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx, [activationTokenKp]);
      return { Ok: { signature, info: { subscriptionToken: activationToken.toBase58() } } }
    } catch (e) {
      log({ error: e })
      return { Err: e };
    }
  }

  async mintSubscriptionToken(input: _MintSubscriptionToken): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"
      let {
        subscriptionToken,
        receiver,
        parentProfile,
        amount
      } = input;
      amount = amount ?? 1;

      let subscriptionTokenState: web3.PublicKey = null;
      if (!subscriptionToken) {
        if (!parentProfile) throw "Parent Profile not found"
        if (typeof parentProfile == 'string') parentProfile = new web3.PublicKey(parentProfile)
        const parentProfileStateInfoData = await this.program.account.profileState.fetch(this.__getProfileStateAccount(parentProfile))
        subscriptionToken = parentProfileStateInfoData.activationToken;
        if (!subscriptionToken) throw "Subscription Token not initialised"
        subscriptionTokenState = this.__getActivationTokenStateAccount(subscriptionToken)
      } else {
        if (typeof subscriptionToken == 'string') subscriptionToken = new web3.PublicKey(subscriptionToken)
        subscriptionTokenState = this.__getActivationTokenStateAccount(subscriptionToken)
      }

      const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(subscriptionTokenState)
      parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileState = this.__getProfileStateAccount(parentProfile);
      let parentProfileStateInfo = await this.program.account.profileState.fetch(parentProfileState)

      if (!receiver) receiver = user;
      if (typeof receiver == 'string') receiver = new web3.PublicKey(receiver)
      const { ata: receiverAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: subscriptionToken, owner: receiver }, this.ixCallBack)

      // const profile = activationTokenStateInfo.parentProfile
      const profileState = this.__getProfileStateAccount(parentProfile)
      const { ata: minterProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: parentProfile, owner: user }, this.ixCallBack)

      const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
      const profileCollection = mainStateInfo.profileCollection;
      const profileCollectionState = await this.program.account.collectionState.fetch(this.__getCollectionStateAccount(profileCollection))
      const genesisProfile = profileCollectionState.genesisProfile;
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
      } = await this.__getProfileHoldersInfo(parentProfileStateInfo.lineage, parentProfile, genesisProfile)

      const userOposAta = getAssociatedTokenAddressSync(oposToken, user)

      const ix = await this.program.methods.mintActivationToken(new BN(amount)).accounts({
        activationTokenState: subscriptionTokenState,
        tokenProgram,
        activationToken: subscriptionToken,
        profile: parentProfile,
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
         genesisProfile,
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
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx)
      return { Ok: { signature, info: {} } }
    } catch (error) {
      log({ error })
      return { Err: error }
    }
  }


  async getUserInfo() {
    const user = this.provider.publicKey
    if (!user) throw "Wallet not found"
    const userOposAta = getAssociatedTokenAddressSync(oposToken, user);

    const infoes = await this.connection.getMultipleAccountsInfo([user, userOposAta])
    const solBalance = infoes[0].lamports / 1000_000_000
    let oposTokenBalance = 0;
    if (infoes[1]) {
      const tokenAccount = unpackAccount(userOposAta, infoes[1])
      oposTokenBalance = (parseInt(tokenAccount?.amount?.toString()) ?? 0) / LAMPORTS_PER_OPOS;
    }

    const mainStateInfo = await this.program.account.mainState.fetch(this.mainState)
    const profileCollection = mainStateInfo.profileCollection;
    const profileCollectionState = await this.program.account.collectionState.fetch(this.__getCollectionStateAccount(profileCollection))
    const genesisProfile = profileCollectionState.genesisProfile;

    const _userNfts = await this.metaplex.nfts().findAllByOwner({ owner: user });
    const profiles = []
    const activationTokens = []
    for (let i of _userNfts) {
      const collectionInfo = i?.collection;
      if (collectionInfo?.address.toBase58() == profileCollection.toBase58()) {
        profiles.push({ name: i.name })
      } else if (collectionInfo?.address.toBase58() == genesisProfile.toBase58()) {
        activationTokens.push({ name: i.name })
      }
    }

    return {
      solBalance,
      oposTokenBalance,
      profiles,
      activationTokens,
    }
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


    /**
   * This is an admin function run once to initialize the smart contract.
   *
   * @returns Instructions needed to create sol storage
   */
    async initializeSolStorageInstructions({
      mintKeypair,
    }: {
      mintKeypair: anchor.web3.Keypair;
    }): Promise<InstructionResult<null>> {
      const exists = await this.getState();
  
      if (exists) {
        return {
          output: null,
          instructions: [],
          signers: [],
        };
      }
  
      console.log("Sol storage does not exist, creating...");
      const [state, bumpSeed] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("state", "utf-8")],
        this.programId
      );
      const [solStorage, solStorageBumpSeed] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("sol-storage", "utf-8")],
        this.programId
      );
      const [wrappedSolAuthority, mintAuthorityBumpSeed] =
        anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("wrapped-sol-authority", "utf-8")],
          this.programId
      );

      const instructions: anchor.web3.TransactionInstruction[] = [];
      const signers: anchor.web3.Signer[] = [];
      signers.push(mintKeypair);
  
      instructions.push(
        ...[
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: this.provider.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: 82,
            lamports:
              await this.provider.connection.getMinimumBalanceForRentExemption(
                82
              ),
            programId: TOKEN_PROGRAM_ID,
          }),
          Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            mintKeypair.publicKey,
            9,
            this.provider.publicKey,
            wrappedSolAuthority
          ),
        ]
      );
  
      // instructions.push(
      //   ...new CreateMetadataV2(
      //     {
      //       feePayer: this.provider.publicKey,
      //     },
      //     {
      //       metadata: await Metadata.getPDA(mintKeypair.publicKey),
      //       mint: mintKeypair.publicKey,
      //       metadataData: new DataV2({
      //         name: "MMOSH Bonding Wrapped SOL",
      //         symbol: "mwSOL",
      //         uri: "",
      //         sellerFeeBasisPoints: 0,
      //         // @ts-ignore
      //         creators: null,
      //         collection: null,
      //         uses: null,
      //       }),
      //       mintAuthority: this.provider.publicKey,
      //       updateAuthority: this.provider.publicKey,
      //     }
      //   ).instructions
      // );
  
      instructions.push(
        Token.createSetAuthorityInstruction(
          TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          wrappedSolAuthority,
          "MintTokens",
          this.provider.publicKey,
          []
        )
      );

  
      instructions.push(
        await this.program.methods.initializeSolStorageV0(
          {
            solStorageBumpSeed,
            bumpSeed,
            mintAuthorityBumpSeed,
          }).accounts(
          {
              state,
              payer: this.provider.publicKey,
              solStorage,
              mintAuthority: wrappedSolAuthority,
              wrappedSolMint: mintKeypair.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          }
        ).instruction()
      );
  
      return {
        instructions,
        signers,
        output: null,
      };
    }
  
    /**
     * Admin command run once to initialize the smart contract
     */
    async initializeSolStorage({
      mintKeypair,
    }: {
      mintKeypair: anchor.web3.Keypair;
    }): Promise<string> {

      try {
        const tokenObj = await this.initializeSolStorageInstructions({ mintKeypair })
        const tx = new web3.Transaction().add(...tokenObj.instructions)
        const signature = await this.provider.sendAndConfirm(tx,tokenObj.signers)
  
        return signature;
      } catch (error) {
        console.log(error);
      }

    }


  async createTokenBonding(
    args: ICreateTokenBondingArgs,
  ): Promise<ICreateTokenBondingOutput> {
    const tokenObj = await this.createTokenBondingInstructions(args)
    const tx = new web3.Transaction().add(...tokenObj.instructions)
    const signature = await this.provider.sendAndConfirm(tx,tokenObj.signers)

    console.log("createTokenBonding ",signature)
    return tokenObj.output;
  }

    /**
 * Create a bonding curve
 *
 * @param param0
 * @returns
 */
  async createTokenBondingInstructions({
    generalAuthority = this.provider.publicKey,
    curveAuthority = null,
    reserveAuthority = null,
    payer = this.provider.publicKey,
    curve,
    baseMint,
    targetMint,
    buyBaseRoyalties,
    buyBaseRoyaltiesOwner = this.provider.publicKey,
    buyTargetRoyalties,
    buyTargetRoyaltiesOwner = this.provider.publicKey,
    sellBaseRoyalties,
    sellBaseRoyaltiesOwner = this.provider.publicKey,
    sellTargetRoyalties,
    sellTargetRoyaltiesOwner = this.provider.publicKey,
    buyBaseRoyaltyPercentage = 0,
    buyTargetRoyaltyPercentage = 0,
    sellBaseRoyaltyPercentage = 0,
    sellTargetRoyaltyPercentage = 0,
    mintCap,
    purchaseCap,
    goLiveDate,
    freezeBuyDate,
    targetMintDecimals,
    targetMintKeypair = anchor.web3.Keypair.generate(),
    buyFrozen = false,
    ignoreExternalReserveChanges = false,
    ignoreExternalSupplyChanges = false,
    sellFrozen = false,
    index,
    advanced = {
      initialSupplyPad: 0,
      initialReservesPad: 0,
    },
  }: ICreateTokenBondingArgs): Promise<
    InstructionResult<ICreateTokenBondingOutput>
  > {
    if (!targetMint) {
      if (sellTargetRoyalties || buyTargetRoyalties) {
        throw new Error(
          "Cannot define target royalties if mint is not defined"
        );
      }

      if (typeof targetMintDecimals == "undefined") {
        throw new Error("Cannot define mint without decimals ");
      }
    }

    if (!goLiveDate) {
      goLiveDate = new Date(0);
      goLiveDate.setUTCSeconds((await this.getUnixTime()) - 10);
    }

    const provider = this.provider;
    const state = (await this.getState())!;
    
    // let isNative =
    //   baseMint.equals(NATIVE_MINT) || baseMint.equals(state.wrappedSolMint);
    let isNative = false;
    if (isNative) {
      baseMint = state.wrappedSolMint;
    }

    const instructions: anchor.web3.TransactionInstruction[] = [];
    const signers: anchor.web3.Signer[] = [];
    let shouldCreateMint = false;
    if (!targetMint) {
      signers.push(targetMintKeypair);
      targetMint = targetMintKeypair.publicKey;
      shouldCreateMint = true;
    }

    // Find the proper bonding index to use that isn't taken.
    let indexToUse = index || 0;
    const getTokenBonding: () => Promise<[anchor.web3.PublicKey, Number]> = () => {
      return this.tokenBondingKey(targetMint!, indexToUse, this.programId);
    };
    const getTokenBondingAccount = async () => {
      return this.provider.connection.getAccountInfo(
        (await getTokenBonding())[0]
      );
    };
    if (!index) {
      // Find an empty voucher account
      while (await getTokenBondingAccount()) {
        indexToUse++;
      }
    } else {
      indexToUse = index;
    }

    const [tokenBonding, bumpSeed] = await this.tokenBondingKey(
      targetMint!,
      indexToUse,
      this.programId
    );

    if (shouldCreateMint) {
      instructions.push(
        ...(await createMintInstructions(
          provider,
          tokenBonding,
          targetMint,
          targetMintDecimals
        ))
      );
    }

    const baseStorageKeypair = anchor.web3.Keypair.generate();
    signers.push(baseStorageKeypair);
    const baseStorage = baseStorageKeypair.publicKey;

    console.log("baseMint ",baseMint.toBase58())
    console.log("baseStorage ",baseStorage.toBase58())
    console.log("tokenBonding ",tokenBonding.toBase58())

    instructions.push(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: baseStorage!,
        space: AccountLayout.span,
        programId: TOKEN_PROGRAM_ID,
        lamports:
          await this.provider.connection.getMinimumBalanceForRentExemption(
            AccountLayout.span
          ),
      }),
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        baseMint,
        baseStorage,
        tokenBonding
      )
    );

    console.log("createInitAccountInstruction completed")

    if (isNative) {
      buyBaseRoyalties =
        buyBaseRoyalties === null
          ? null
          : buyBaseRoyalties || buyBaseRoyaltiesOwner;
      sellBaseRoyalties =
        sellBaseRoyalties === null
          ? null
          : sellBaseRoyalties || sellBaseRoyaltiesOwner;
    }

    let createdAccts: Set<string> = new Set();
    if (typeof buyTargetRoyalties === "undefined") {
      buyTargetRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        targetMint,
        buyTargetRoyaltiesOwner,
        true
      );

      // If sell target royalties are undefined, we'll do this in the next step
      if (
        !createdAccts.has(buyTargetRoyalties.toBase58()) &&
        !(await this.accountExists(buyTargetRoyalties))
      ) {
        console.log("Creating buy target royalties...");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            targetMint,
            buyTargetRoyalties,
            buyTargetRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyTargetRoyalties.toBase58());
      }
    }

    if (typeof sellTargetRoyalties === "undefined") {
      sellTargetRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        targetMint,
        sellTargetRoyaltiesOwner,
        true
      );

      if (
        !createdAccts.has(sellTargetRoyalties.toBase58()) &&
        !(await this.accountExists(sellTargetRoyalties))
      ) {
        console.log("Creating sell target royalties...");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            targetMint,
            sellTargetRoyalties,
            sellTargetRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyTargetRoyalties!.toBase58());
      }
    }

    if (typeof buyBaseRoyalties === "undefined") {
      buyBaseRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        baseMint,
        buyBaseRoyaltiesOwner,
        true
      );

      // If sell base royalties are undefined, we'll do this in the next step
      if (
        !createdAccts.has(buyBaseRoyalties.toBase58()) &&
        !(await this.accountExists(buyBaseRoyalties))
      ) {
        console.log("Creating base royalties...", buyBaseRoyalties.toBase58());
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            baseMint,
            buyBaseRoyalties,
            buyBaseRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyBaseRoyalties.toBase58());
      }
    }

    if (typeof sellBaseRoyalties === "undefined") {
      sellBaseRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        baseMint,
        sellBaseRoyaltiesOwner,
        true
      );

      if (
        !createdAccts.has(sellBaseRoyalties.toBase58()) &&
        !(await this.accountExists(sellBaseRoyalties))
      ) {
        console.log("Creating base royalties...", sellBaseRoyalties.toBase58());
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            baseMint,
            sellBaseRoyalties,
            sellBaseRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(sellBaseRoyalties.toBase58());
      }
    }
    const pads = {
      initialReservesPad: advanced.initialReservesPad
        ? toBN(
            advanced.initialReservesPad,
            await getMintInfo(this.provider, baseMint)
          )
        : new BN(0),
      initialSupplyPad: advanced.initialSupplyPad
        ? toBN(
            advanced.initialSupplyPad,
            typeof targetMintDecimals == "undefined"
              ? (await getMintInfo(this.provider, targetMint)).decimals
              : targetMintDecimals
          )
        : new BN(0),
    };

    const ix = await this.program.methods.initializeTokenBondingV0({
      index: indexToUse,
      goLiveUnixTime: new BN(Math.floor(goLiveDate.valueOf() / 1000)),
      freezeBuyUnixTime: freezeBuyDate
        ? new BN(Math.floor(freezeBuyDate.valueOf() / 1000))
        : null,
      buyBaseRoyaltyPercentage: percent(buyBaseRoyaltyPercentage) || 0,
      buyTargetRoyaltyPercentage: percent(buyTargetRoyaltyPercentage) || 0,
      sellBaseRoyaltyPercentage: percent(sellBaseRoyaltyPercentage) || 0,
      sellTargetRoyaltyPercentage:
        percent(sellTargetRoyaltyPercentage) || 0,
      mintCap: mintCap || null,
      purchaseCap: purchaseCap || null,
      generalAuthority,
      curveAuthority,
      reserveAuthority,
      bumpSeed,
      buyFrozen,
      ignoreExternalReserveChanges,
      ignoreExternalSupplyChanges,
      sellFrozen,
      ...pads,
    }).accounts({
      payer: payer,
      curve,
      tokenBonding,
      baseMint,
      targetMint,
      baseStorage,
      buyBaseRoyalties:
        buyBaseRoyalties === null
          ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
          : buyBaseRoyalties,
      buyTargetRoyalties:
        buyTargetRoyalties === null
          ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
          : buyTargetRoyalties,
      sellBaseRoyalties:
        sellBaseRoyalties === null
          ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
          : sellBaseRoyalties,
      sellTargetRoyalties:
        sellTargetRoyalties === null
          ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
          : sellTargetRoyalties,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    }).instruction();

    instructions.push(ix);

    return {
      output: {
        baseMint,
        tokenBonding,
        targetMint,
        buyBaseRoyalties: buyBaseRoyalties || this.provider.publicKey,
        buyTargetRoyalties: buyTargetRoyalties || this.provider.publicKey,
        sellBaseRoyalties: sellBaseRoyalties || this.provider.publicKey,
        sellTargetRoyalties: sellTargetRoyalties || this.provider.publicKey,
        baseStorage,
      },
      instructions,
      signers,
    };
  }

  async initializeCurve(
    args: IInitializeCurveArgs,
  ): Promise<anchor.web3.PublicKey> {
    const tokenObj = await this.initializeCurveInstructions(args)
    const tx = new web3.Transaction().add(...tokenObj.instructions)
    const signature = await this.provider.sendAndConfirm(tx,tokenObj.signers)
    console.log("initializeCurve ",signature)
    console.log("initializeCurve ",tokenObj.output.curve.toBase58())
    return tokenObj.output.curve;
  }

  async initializeCurveInstructions({
    payer = this.provider.publicKey,
    config: curveConfig,
    curveKeypair = anchor.web3.Keypair.generate(),
  }: IInitializeCurveArgs): Promise<InstructionResult<{ curve: anchor.web3.PublicKey }>> {

    const curve = curveConfig.toRawConfig();
    return {
      output: {
        curve: curveKeypair.publicKey,
      },
      signers: [curveKeypair],
      instructions: [
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: payer,
          newAccountPubkey: curveKeypair.publicKey,
          space: 500,
          lamports:
            await this.provider.connection.getMinimumBalanceForRentExemption(
              500
            ),
          programId: this.programId,
        }),
        await this.program.methods.createCurveV0(curve).accounts({
            payer,
            curve: curveKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }).instruction(),
      ],
    };

  }


  async buy(
    args: IBuyArgs,
  ): Promise<string> {
    const tokenObj = await this.buyInstructions(args)
    const tx = new web3.Transaction().add(...tokenObj.instructions)
    const signature = await this.provider.sendAndConfirm(tx,tokenObj.signers)
    console.log("buy ",signature)
    return signature;
  }

  /**
   * Issue a command to buy `targetMint` tokens with `baseMint` tokens.
   *
   * @param param0
   * @returns
   */
  async buyInstructions({
    tokenBonding,
    source,
    sourceAuthority = this.provider.publicKey,
    destination,
    desiredTargetAmount,
    baseAmount,
    expectedOutputAmount,
    expectedBaseAmount,
    slippage,
    payer = this.provider.publicKey,
  }: IBuyArgs): Promise<InstructionResult<null>> {
    const state = (await this.getState())!;

    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    // const isNative =
    //   tokenBondingAcct.baseMint.equals(NATIVE_MINT) ||
    //   tokenBondingAcct.baseMint.equals(state.wrappedSolMint);

    const isNative = false;

    // @ts-ignore
    const targetMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.targetMint
    );

    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );

    const baseStorage = await getTokenAccount(
      this.provider,
      tokenBondingAcct.baseStorage
    );

    const curve = await this.getPricingCurve(
      tokenBondingAcct.curve,
      amountAsNum(
        tokenBondingAcct.ignoreExternalReserveChanges
          ? tokenBondingAcct.reserveBalanceFromBonding
          : baseStorage.amount,
        baseMint
      ),
      amountAsNum(
        tokenBondingAcct.ignoreExternalSupplyChanges
          ? tokenBondingAcct.supplyFromBonding
          : targetMint.supply,
        targetMint
      ),
      tokenBondingAcct.goLiveUnixTime.toNumber()
    );

    const instructions: anchor.web3.TransactionInstruction[] = [];
    // let req = ComputeBudgetProgram.setComputeUnitLimit({units: 400000});
    // instructions.push(req);

    if (!destination) {
      destination = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenBondingAcct.targetMint,
        sourceAuthority,
        true
      );

      if (!(await this.accountExists(destination))) {
        console.log("Creating target account");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenBondingAcct.targetMint,
            destination,
            sourceAuthority,
            payer
          )
        );
      }
    }

    let buyTargetAmount: any = null;
    let buyWithBase: any = null;
    let maxPrice: number = 0;

    const unixTime = await this.getUnixTime();

    if (desiredTargetAmount) {
      const desiredTargetAmountNum = toNumber(desiredTargetAmount, targetMint);

      const neededAmount =
        desiredTargetAmountNum *
        (1 / (1 - asDecimal(tokenBondingAcct.buyTargetRoyaltyPercentage)));

      const min = expectedBaseAmount
        ? toNumber(expectedBaseAmount, targetMint)
        : curve.buyTargetAmount(
            desiredTargetAmountNum,
            tokenBondingAcct.buyBaseRoyaltyPercentage,
            tokenBondingAcct.buyTargetRoyaltyPercentage,
            unixTime
          );

      maxPrice = min * (1 + slippage);

      buyTargetAmount = {
        targetAmount: new BN(
          Math.floor(neededAmount * Math.pow(10, targetMint.decimals))
        ),
        maximumPrice: toBN(maxPrice, baseMint),
      };
    }

    if (baseAmount) {
      const baseAmountNum = toNumber(baseAmount, baseMint);
      maxPrice = baseAmountNum;

      const min = expectedOutputAmount
        ? toNumber(expectedOutputAmount, targetMint)
        : curve.buyWithBaseAmount(
            baseAmountNum,
            tokenBondingAcct.buyBaseRoyaltyPercentage,
            tokenBondingAcct.buyTargetRoyaltyPercentage,
            unixTime
          );

      buyWithBase = {
        baseAmount: toBN(baseAmount, baseMint),
        minimumTargetAmount: new BN(
          Math.ceil(min * (1 - slippage) * Math.pow(10, targetMint.decimals))
        ),
      };
    }

    if (!source) {
      if (isNative) {
        source = sourceAuthority;
      } else {
        source = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenBondingAcct.baseMint,
          sourceAuthority,
          true
        );

        if (!(await this.accountExists(source))) {
          console.warn(
            "Source account for bonding buy does not exist, if it is not created in an earlier instruction this can cause an error"
          );
        }
      }
    }

    const args: anchor.IdlTypes<Sop>["BuyV0Args"] = {
      // @ts-ignore
      buyTargetAmount,
      // @ts-ignore
      buyWithBase,
    };

    const common = {
      tokenBonding,
      // @ts-ignore
      curve: tokenBondingAcct.curve,
      baseMint: tokenBondingAcct.baseMint,
      targetMint: tokenBondingAcct.targetMint,
      baseStorage: tokenBondingAcct.baseStorage,
      buyBaseRoyalties: tokenBondingAcct.buyBaseRoyalties,
      buyTargetRoyalties: tokenBondingAcct.buyTargetRoyalties,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      destination,
    };

    if (isNative) {
      instructions.push(
        await this.program.methods.buyNativeV0(args).accounts({
            common,
            state: state.publicKey,
            wrappedSolMint: state.wrappedSolMint,
            mintAuthority: (
              await this.wrappedSolMintAuthorityKey(this.programId)
            )[0],
            solStorage: state.solStorage,
            systemProgram: anchor.web3.SystemProgram.programId,
            source,
        }).instruction()
      );
    } else {
      instructions.push(
        await this.program.methods.buyV1(args).accounts({
            common,
            state: state.publicKey,
            source,
            sourceAuthority,
        }).instruction()
      );
    }

    return {
      output: null,
      signers: [],
      instructions,
    };
  }


  async sell(
    args: ISellArgs,
  ): Promise<string> {
    const tokenObj = await this.sellInstructions(args)
    const tx = new web3.Transaction().add(...tokenObj.instructions)
    const signature = await this.provider.sendAndConfirm(tx,tokenObj.signers)
    console.log("sell ",signature)
    return signature;
  }
  
  /**
   * Instructions to burn `targetMint` tokens in exchange for `baseMint` tokens
   *
   * @param param0
   * @returns
   */
   async sellInstructions({
    tokenBonding,
    source,
    sourceAuthority = this.provider.publicKey,
    destination,
    targetAmount,
    expectedOutputAmount,
    slippage,
    payer = this.provider.publicKey,
  }: ISellArgs): Promise<InstructionResult<null>> {
    const state = (await this.getState())!;
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    if (tokenBondingAcct.sellFrozen) {
      throw new Error("Sell is frozen on this bonding curve");
    }

    const isNative =
      tokenBondingAcct.baseMint.equals(NATIVE_MINT) ||
      tokenBondingAcct.baseMint.equals(state.wrappedSolMint);

    // @ts-ignore
    const targetMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.targetMint
    );
    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );
    const baseStorage = await getTokenAccount(
      this.provider,
      tokenBondingAcct.baseStorage
    );
    // @ts-ignore
    const curve = await this.getPricingCurve(
      tokenBondingAcct.curve,
      amountAsNum(
        tokenBondingAcct.ignoreExternalReserveChanges
          ? tokenBondingAcct.reserveBalanceFromBonding
          : baseStorage.amount,
        baseMint
      ),
      amountAsNum(
        tokenBondingAcct.ignoreExternalSupplyChanges
          ? tokenBondingAcct.supplyFromBonding
          : targetMint.supply,
        targetMint
      ),
      tokenBondingAcct.goLiveUnixTime.toNumber()
    );

    const instructions: anchor.web3.TransactionInstruction[] = [];
    // let req = ComputeBudgetProgram.setComputeUnitLimit({units: 350000});
    // instructions.push(req);
    if (!source) {
      source = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenBondingAcct.targetMint,
        sourceAuthority,
        true
      );

      if (!(await this.accountExists(source))) {
        console.warn(
          "Source account for bonding buy does not exist, if it is not created in an earlier instruction this can cause an error"
        );
      }
    }

    if (!destination) {
      if (isNative) {
        destination = sourceAuthority;
      } else {
        destination = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenBondingAcct.baseMint,
          sourceAuthority,
          true
        );

        if (!(await this.accountExists(destination))) {
          console.log("Creating base account");
          instructions.push(
            Token.createAssociatedTokenAccountInstruction(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              tokenBondingAcct.baseMint,
              destination,
              sourceAuthority,
              payer
            )
          );
        }
      }
    }

    const unixTime = await this.getUnixTime();
    const targetAmountNum = toNumber(targetAmount, targetMint);

    const min = expectedOutputAmount
      ? toNumber(expectedOutputAmount, baseMint)
      : curve.sellTargetAmount(
          targetAmountNum,
          tokenBondingAcct.sellBaseRoyaltyPercentage,
          tokenBondingAcct.sellTargetRoyaltyPercentage,
          unixTime
        );

    const args: anchor.IdlTypes<Sop>["SellV0Args"] = {
      targetAmount: toBN(targetAmount, targetMint),
      minimumPrice: new BN(
        Math.ceil(min * (1 - slippage) * Math.pow(10, baseMint.decimals))
      ),
    };

    const common = {
      tokenBonding,
      // @ts-ignore
      curve: tokenBondingAcct.curve,
      baseMint: tokenBondingAcct.baseMint,
      targetMint: tokenBondingAcct.targetMint,
      baseStorage: tokenBondingAcct.baseStorage,
      sellBaseRoyalties: tokenBondingAcct.sellBaseRoyalties,
      sellTargetRoyalties: tokenBondingAcct.sellTargetRoyalties,
      source,
      sourceAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    };
    if (isNative) {
      instructions.push(
        await this.program.methods.sellNativeV0(args).accounts({
          common,
          destination,
          state: state.publicKey,
          wrappedSolMint: state.wrappedSolMint,
          mintAuthority: (
            await this.wrappedSolMintAuthorityKey(this.programId)
          )[0],
          solStorage: state.solStorage,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).instruction()
      );
    } else {
      instructions.push(
        await this.program.methods.sellV1(args).accounts({
            common,
            state: state.publicKey,
            destination,
        }).instruction()
      );
    }

    return {
      output: null,
      signers: [],
      instructions,
    };
   }


  async getUnixTime(): Promise<number> {
    const acc = await this.provider.connection.getAccountInfo(
      anchor.web3.SYSVAR_CLOCK_PUBKEY,
    );
    //@ts-ignore
    return Number(acc!.data.readBigInt64LE(8 * 4));
  }

  async getState(): Promise<(IProgramState & { publicKey: anchor.web3.PublicKey }) | null> {
    if (this.state) {
      return this.state;
    }

    const stateAddress = (
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("state", "utf-8")],
        this.programId
      )
    )[0];

    const stateRaw = await this.program.account.programStateV0.fetchNullable(
      stateAddress
    );

    const state: IProgramState | null = stateRaw
      ? {
          ...stateRaw,
          publicKey: stateAddress,
        }
      : null;
    if (state) {
      this.state = state;
    }

    return state;
  }

  async getAccount<T>(
    key: anchor.web3.PublicKey,
    decoder: TypedAccountParser<T>
  ): Promise<T | null> {
    const account = await this.provider.connection.getAccountInfo(key);

    if (account) {
      return decoder(key, account);
    }

    return null;
  }

  getTokenBonding(tokenBondingKey: anchor.web3.PublicKey): Promise<ITokenBonding | null> {
    return this.getAccount(tokenBondingKey, this.tokenBondingDecoder);
  }

  async tokenBondingKey(
    targetMint: anchor.web3.PublicKey,
    index: number = 0,
    programId: anchor.web3.PublicKey
  ): Promise<[anchor.web3.PublicKey, number]> {
    const pad = Buffer.alloc(2);
    new BN(index, 16, "le").toArrayLike(Buffer).copy(pad);
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token-bonding", "utf-8"), targetMint!.toBuffer(), pad],
      programId
    );
  }

  
  async accountExists(account: anchor.web3.PublicKey): Promise<boolean> {
    return Boolean(await this.provider.connection.getAccountInfo(account));
  }

  getCurve(curveKey: anchor.web3.PublicKey): Promise<ICurve | null> {
    return this.getAccount(curveKey, this.curveDecoder);
  }

  /**
   * Given some reserves and supply, get a pricing model for a curve at `key`.
   *
   * @param key
   * @param baseAmount
   * @param targetSupply
   * @param goLiveUnixTime
   * @returns
   */
  async getPricingCurve(
    key: anchor.web3.PublicKey,
    baseAmount: number,
    targetSupply: number,
    goLiveUnixTime: number
  ): Promise<IPricingCurve> {
    const curve = await this.getCurve(key);
    return fromCurve(curve, baseAmount, targetSupply, goLiveUnixTime);
  }

  async getPricing(
    tokenBondingKey: anchor.web3.PublicKey | undefined
  ): Promise<BondingPricing | undefined> {
    const hierarchy = await this.getBondingHierarchy(tokenBondingKey);
    if (hierarchy) {
      return new BondingPricing({
        hierarchy: hierarchy,
      });
    }
  }
  

  async getBondingHierarchy(
    tokenBondingKey: anchor.web3.PublicKey | undefined,
    stopAtMint?: anchor.web3.PublicKey | undefined
  ): Promise<BondingHierarchy | undefined> {
    if (!tokenBondingKey) {
      return;
    }

    const [wrappedSolMint, tokenBonding] = await Promise.all([
      this.getState().then((s) => s?.wrappedSolMint!),
      this.getTokenBonding(tokenBondingKey),
    ]);

    if (stopAtMint?.equals(NATIVE_MINT)) {
      stopAtMint = wrappedSolMint;
    }

    if (!tokenBonding) {
      return;
    }

    const pricingCurve = await this.getBondingPricingCurve(tokenBondingKey);

    const parentKey = (
      await this.tokenBondingKey(tokenBonding.baseMint,0,this.programId)
    )[0];
    const ret = new BondingHierarchy({
      parent: stopAtMint?.equals(tokenBonding.baseMint)
        ? undefined
        : await this.getBondingHierarchy(parentKey, stopAtMint),
      tokenBonding,
      pricingCurve,
      wrappedSolMint,
    });
    (ret.parent || ({} as any)).child = ret;
    return ret;
  }

    /**
   * Get a class capable of displaying pricing information or this token bonding at its current reserve and supply
   *
   * @param tokenBonding
   * @returns
   */
    async getBondingPricingCurve(
      tokenBonding: anchor.web3.PublicKey
    ): Promise<IPricingCurve> {
      const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
      const targetMint = await getMintInfo(
        this.provider,
        tokenBondingAcct.targetMint
      );
      const baseMint = await getMintInfo(
        this.provider,
        tokenBondingAcct.baseMint
      );
      const baseStorage = await getTokenAccount(
        this.provider,
        tokenBondingAcct.baseStorage
      );
  
      return await this.getPricingCurve(
        tokenBondingAcct.curve,
        amountAsNum(
          tokenBondingAcct.ignoreExternalReserveChanges
            ? tokenBondingAcct.reserveBalanceFromBonding
            : baseStorage.amount,
          baseMint
        ),
        amountAsNum(
          tokenBondingAcct.ignoreExternalSupplyChanges
            ? tokenBondingAcct.supplyFromBonding
            : targetMint.supply,
          targetMint
        ),
        tokenBondingAcct.goLiveUnixTime.toNumber()
      );
    }

    async wrappedSolMintAuthorityKey(
      programId: anchor.web3.PublicKey = this.programId
    ): Promise<[ anchor.web3.PublicKey, number]> {
      return  anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("wrapped-sol-authority", "utf-8")],
        programId
      );
    }

}

