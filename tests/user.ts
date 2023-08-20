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
} from "./web3Types";
import Config from "./web3Config.json";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from './web3Consts'
import { getAssociatedTokenAddress, getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import { Metaplex, Metadata as MetadataM } from '@metaplex-foundation/js'
import { BaseSpl } from "./base/baseSpl";

const {
  systemProgram,
  associatedTokenProgram: associatedTokenProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds,
  oposToken,
  LAMPORTS_PER_OPOS,
} = web3Consts;
const log = console.log;

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

  async initActivationToken(input: { profile: web3.PublicKey | string, name: string, symbol?: string, uri?: string }): Promise<Result<TxPassType<{ activationToken: string }>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"

      let { profile, name, symbol, uri } = input
      symbol = symbol ?? ""
      uri = uri ?? ""
      if (typeof profile == 'string') profile = new web3.PublicKey(profile)

      const mintKp = web3.Keypair.generate();
      const activationToken = mintKp.publicKey;
      const { ata: userProfileAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: profile, owner: user }, this.ixCallBack)
      const profileState = this.__getProfileStateAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const userActivationTokenAta = getAssociatedTokenAddressSync(activationToken, user);
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const activationTokenMetadata = BaseMpl.getMetadataAccount(activationToken)
      const profileCollectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState);

      const ix = await this.program.methods.initActivationToken(name, symbol, uri).accounts({
        user,
        mainState: this.mainState,
        activationToken,
        profile,
        profileState,
        profileMetadata,
        profileEdition,
        userProfileAta,
        profileCollectionAuthorityRecord,
        sysvarInstructions,
        activationTokenState,
        userActivationTokenAta,
        activationTokenMetadata,
        associatedTokenProgram,
        mplProgram,
        tokenProgram,
        systemProgram,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      const signature = await this.provider.sendAndConfirm(tx, [mintKp]);

      return { Ok: { signature, info: { activationToken: activationToken.toBase58() } } }
    } catch (error) {
      log({ error })
      return { Err: error }
    }
  }

  async mintActivationToken(activationToken: web3.PublicKey | string, receiver?: web3.PublicKey | string): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"
      if (typeof activationToken == 'string') activationToken = new web3.PublicKey(activationToken)

      if (!receiver) receiver = user;
      if (typeof receiver == 'string') receiver = new web3.PublicKey(receiver)
      const { ata: receiverAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({ mint: activationToken, owner: receiver }, this.ixCallBack)

      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(activationTokenState)
      const profile = activationTokenStateInfo.parentProfile
      const profileState = this.__getProfileStateAccount(profile)
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

  // async mint_profile(input: _MintProfileInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
  //   try {
  //     this.reinit();
  //     const user = this.provider.publicKey;
  //     if (!user) throw "Wallet not found"
  //     let {
  //       name, symbol, uri,
  //       parentProfile,
  //     } = input;
  //     name = name ?? ""
  //     symbol = symbol ?? ""
  //     uri = uri ?? ""
  //     if (typeof parentProfile == 'string') parentProfile = new web3.PublicKey(parentProfile)
  //     const parentProfileNftInfo = await this.metaplex.nfts().findByMint({ mintAddress: parentProfile, loadJsonMetadata: false })
  //     const collection = parentProfileNftInfo?.collection?.address
  //     if (!collection) return { Err: "(parentProfile) Collection info not found" }
  //     const collectionMetadata = BaseMpl.getMetadataAccount(collection)
  //     const collectionEdition = BaseMpl.getEditionAccount(collection)
  //     const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(collection, this.mainState)
  //
  //     const mintKp = web3.Keypair.generate()
  //     const profile = mintKp.publicKey
  //     const userAta = getAssociatedTokenAddressSync(profile, user);
  //     const profileMetadata = BaseMpl.getMetadataAccount(profile)
  //     const profileEdition = BaseMpl.getEditionAccount(profile)
  //     const profileState = this.__getProfileStateAccount(profile)
  //     const parentProfileMetadata = BaseMpl.getMetadataAccount(parentProfile)
  //     const parentProfileState = this.__getProfileStateAccount(parentProfile)
  //     const parentProfileStateInfo = await this.program.account.profileState.fetch(parentProfileState)
  //     const parentProfileLineage = parentProfileStateInfo.lineage;
  //     if (!parentProfileLineage) throw "Parent profile lineage not found !"
  //
  //     const { ata: userUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: user, mint: usdcMint
  //     }, this.ixCallBack,)
  //     const { ata: creatorUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: parentProfileLineage.creator,
  //       mint: usdcMint, payer: user
  //     }, this.ixCallBack,)
  //     const { ata: parentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: this.__getValutAccount(parentProfileStateInfo.mint),
  //       mint: usdcMint, payer: user, allowOffCurveOwner: true
  //     }, this.ixCallBack)
  //     const { ata: grandParentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: this.__getValutAccount(parentProfileLineage.parent),
  //       mint: usdcMint, payer: user, allowOffCurveOwner: true
  //     }, this.ixCallBack)
  //     const { ata: ggrandParentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: this.__getValutAccount(parentProfileLineage.grandParent),
  //       mint: usdcMint, payer: user, allowOffCurveOwner: true
  //     }, this.ixCallBack)
  //     const { ata: uncleVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
  //       owner: this.__getValutAccount(parentProfileLineage.ggreateGrandParent),
  //       mint: usdcMint, payer: user, allowOffCurveOwner: true
  //     }, this.ixCallBack)
  //
  //     //NOTE: need to improve it
  //     const tx_tmp = new web3.Transaction().add(...this.txis)
  //     this.txis = []
  //     const signature_tmp = await this.provider.sendAndConfirm(tx_tmp)
  //     // minting token
  //     const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
  //       mintAuthority: user,
  //       mintKeypair: mintKp,
  //       mintingInfo: {
  //         tokenAmount: 1,
  //       }
  //     })
  //     const mintTx = new web3.Transaction().add(...mintIxs)
  //     const mintTxSignature = await this.provider.sendAndConfirm(mintTx, [mintKp])
  //     const cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 3000_00 })
  //     this.txis.push(cuBudgetIncIx)
  //
  //     const ix = await this.program.methods.mintProfile(name, symbol, uri).accounts({
  //       user,
  //       userAta,
  //       profile,
  //       profileMetadata,
  //       profileEdition,
  //       profileState,
  //       parentProfileState,
  //       parentProfileMetadata,
  //       collectionAuthorityRecord,
  //       mainState: this.mainState,
  //       collection,
  //       collectionMetadata,
  //       collectionEdition,
  //       associatedTokenProgram,
  //       mplProgram,
  //       tokenProgram,
  //       systemProgram,
  //       sysvarInstructions,
  //       // minting cost distributaion require accounts
  //       userUsdcAta,
  //       creatorUsdcAta,
  //       parentVaultUsdcAta,
  //       grandParentVaultUsdcAta,
  //       ggrandParentVaultUsdcAta,
  //       uncleVaultUsdcAta,
  //     }).instruction()
  //     this.txis.push(ix)
  //     const tx = new web3.Transaction().add(...this.txis)
  //     this.txis = []
  //     const signature = await this.provider.sendAndConfirm(tx)
  //     return {
  //       Ok: { signature, info: { profile: profile.toBase58() } }
  //     }
  //   } catch (error) {
  //     // // log({ error: JSON.parse(JSON.stringify(e)) })
  //     log({ error: error })
  //     return { Err: error };
  //   }
  // }


  async mintProfileByActivationToken(input: _MintProfileByAtInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"
      let {
        name, symbol, uri,
        activationToken,
      } = input;
      if (typeof activationToken == 'string') activationToken = new web3.PublicKey(activationToken)
      symbol = symbol ?? ""
      uri = uri ?? ""

      const activationTokenState = this.__getActivationTokenStateAccount(activationToken)
      const activationTokenStateInfo = await this.program.account.activationTokenState.fetch(activationTokenState)
      const parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileNftInfo = await this.metaplex.nfts().findByMint({ mintAddress: parentProfile, loadJsonMetadata: false })
      const collection = parentProfileNftInfo?.collection?.address
      if (!collection) return { Err: "(parentProfile) Collection info not found" }
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

      // minting token
      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: user,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: 1,
        }
      })
      // const mintTx = new web3.Transaction().add(...mintIxs)
      // const mintTxSignature = await this.provider.sendAndConfirm(mintTx, [mintKp])
      this.txis.push(...mintIxs)

      const cuBudgetIncIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 3000_00 })
      this.txis.push(cuBudgetIncIx)
      const ix = await this.program.methods.mintProfileByAt(name, symbol, uri).accounts({
        profile,
        user,
        userProfileAta: userProfileAta,
        mainState: this.mainState,
        associatedTokenProgram,
        collection,
        mplProgram,
        profileState,
        tokenProgram,
        systemProgram,
        profileEdition,
        activationToken,
        profileMetadata,
        collectionEdition,
        collectionMetadata,
        parentProfileState,
        sysvarInstructions,
        activationTokenState,
        parentProfileMetadata,
        userActivationTokenAta,
        activationTokenMetadata,
        collectionAuthorityRecord,
        subCollectionAuthorityRecord,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis,)
      const signature = await this.provider.sendAndConfirm(tx, [mintKp]);

      return {
        Ok: { signature, info: { profile: profile.toBase58() } }
      }
    } catch (error) {
      // // log({ error: JSON.parse(JSON.stringify(e)) })
      log({ error: error })
      return { Err: error };
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
}
