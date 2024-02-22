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
import { getAssociatedTokenAddress, getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import { Metaplex, Metadata as MetadataM } from '@metaplex-foundation/js'
import { BaseSpl } from "./base/baseSpl";

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
  }

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
      const newLut = web3.PublicKey.findProgramAddressSync(
        [profileState.toBuffer(), new BN(recentSlot).toBuffer('le', 8)],
        addressLookupTableProgram,
      )[0];

      let cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 8000_00 })
      this.txis.push(cuBudgetIncIx)

      const ix_share = await this.program.methods.mintProfileDistribution().accounts({
        user,
        oposToken,
        userOposAta,
        mainState: this.mainState,
        parentProfileState,
        mplProgram,
        tokenProgram,
        systemProgram,
        associatedTokenProgram,
        parentProfile,
        genesisProfile,
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,
        // verification ata
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
   //   this.txis.push(ix_share)
     
      const ix = await this.program.methods.mintProfileByAt(
        name, symbol, uriHash, new BN(recentSlot)
      ).accounts({
        profile,
        user,
        oposToken,
        userProfileAta,
        mainState: this.mainState,
        collection,
        mplProgram,
        profileState,
        tokenProgram,
        systemProgram,
        addressLookupTableProgram,
        profileEdition,
        activationToken,
        profileMetadata,
        collectionEdition,
        collectionMetadata,
        newLut,
        parentProfileState,
        sysvarInstructions,
        userActivationTokenAta,
        associatedTokenProgram,


        //Profiles
        parentProfile,
        // genesisProfile,
        // grandParentProfile,
        // greatGrandParentProfile,
        // ggreateGrandParentProfile,

        //verification ata
        // currentParentProfileHolderAta,
        // currentGrandParentProfileHolderAta,
        // currentGreatGrandParentProfileHolderAta,
        // currentGgreatGrandParentProfileHolderAta,
        // currentGenesisProfileHolderAta,
        // profile owners
        // currentParentProfileHolder,
        // currentGrandParentProfileHolder,
        // currentGreatGrandParentProfileHolder,
        // currentGgreatGrandParentProfileHolder,
        // currentGenesisProfileHolder,

        // holder opos ata
        // parentProfileHolderOposAta,
        // grandParentProfileHolderOposAta,
        // greatGrandParentProfileHolderOposAta,
        // ggreatGrandParentProfileHolderOposAta,
        // genesisProfileHolderOposAta,
      }).instruction()
      this.txis.push(ix)

  

      const commonLutInfo = await (await (this.connection.getAddressLookupTable(commonLut))).value
      const lutsInfo = [commonLutInfo]
      if (lut.toBase58() != systemProgram.toBase58()) {
        const res = await (await (this.connection.getAddressLookupTable(lut))).value
        lutsInfo.push(res)
      }
      const blockhash = (await this.connection.getLatestBlockhash()).blockhash
      const message = new web3.TransactionMessage({
        payerKey: this.provider.publicKey,
        recentBlockhash: blockhash,
        instructions: [...this.txis],
      }).compileToV0Message(lutsInfo);

      const tx = new web3.VersionedTransaction(message);
      tx.sign([mintKp])
      this.txis = []
      // tx.sign([mintKp])
      // const signedTx = await this.provider.wallet.signTransaction(tx as any);

      // const txLen = signedTx.serialize().length;
      // log({ txLen, luts: lutsInfo.length });

      const share_tx = new web3.Transaction().add(ix_share)
      const sharesignature = await this.provider.sendAndConfirm(share_tx)

      console.log("sharesignature", sharesignature)
    

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

  async mintOffer(input: { profile: web3.PublicKey | string, name?: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ offer: string }>, any>> {
    try {
      const user = this.provider.publicKey;
      this.reinit()
      let { profile, name, symbol, uri } = input;
      symbol = symbol ?? ""
      uri = uri ?? ""

      if (typeof profile == 'string') profile = new web3.PublicKey(profile)
      const profileState = this.__getProfileStateAccount(profile)
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const profileCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState)
      const { ata: userProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: profile, owner: user }, this.ixCallBack)
      const mintKp = web3.Keypair.generate();
      const offer = mintKp.publicKey
      const offerMetadata = BaseMpl.getMetadataAccount(offer)
      const offerEdition = BaseMpl.getEditionAccount(offer)
      const userOfferAta = getAssociatedTokenAddressSync(offer, user)

      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: user,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: 1,
        }
      })
      this.txis.push(...mintIxs)

      const ix = await this.program.methods.mintOffer(name, symbol, uri).accounts({
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
        offer,
        offerEdition,
        profileMetadata,
        sysvarInstructions,
        userOfferAta,
        offerMetadata,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx, [mintKp]);
      return { Ok: { signature, info: { offer: offer.toBase58() } } }
    } catch (e) {
      log({ error: e })
      return { Err: e };
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

}

