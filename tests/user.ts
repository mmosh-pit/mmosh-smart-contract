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
  Result,
  TxPassType,
  _MintProfileInput,
} from "./web3Types";
import Config from "./web3Config.json";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from './web3Consts'
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Metaplex, Metadata as MetadataM } from '@metaplex-foundation/js'
import { BaseSpl } from "./base/baseSpl";

const {
  systemProgram,
  ataProgram,
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
  __getProfileStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.profileState,
      mint.toBuffer()
    ], this.programId)[0]
  }

  __getValutAccount(profile: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync([
      Seeds.vault,
      profile.toBuffer()
    ], this.programId)[0]
  }

  async mint_profile(input: _MintProfileInput): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found"
      let {
        name, symbol, uri,
        parentProfile,
      } = input;
      name = name ?? ""
      symbol = symbol ?? ""
      uri = uri ?? ""

      if (typeof parentProfile == 'string') parentProfile = new web3.PublicKey(parentProfile)
      const parentProfileNftInfo = await this.metaplex.nfts().findByMint({ mintAddress: parentProfile, loadJsonMetadata: false })
      const collection = parentProfileNftInfo?.collection?.address
      if (!collection) return { Err: "(parentProfile) Collection info not found" }
      const collectionMetadata = BaseMpl.getMetadataAccount(collection)
      const collectionEdition = BaseMpl.getEditionAccount(collection)
      const collectionAuthorityRecord = BaseMpl.getCollectionAuthorityRecordAccount(collection, this.mainState)

      const mintKp = web3.Keypair.generate()
      const profile = mintKp.publicKey
      const userAta = getAssociatedTokenAddressSync(profile, user);
      const profileMetadata = BaseMpl.getMetadataAccount(profile)
      const profileEdition = BaseMpl.getEditionAccount(profile)
      const profileState = this.__getProfileStateAccount(profile)
      const parentProfileMetadata = BaseMpl.getMetadataAccount(parentProfile)
      const parentProfileState = this.__getProfileStateAccount(parentProfile)

      const parentProfileStateInfo = await this.program.account.profileState.fetch(parentProfileState)
      const parentProfileLineage = parentProfileStateInfo.lineage;
      if (!parentProfileLineage) throw "Parent profile lineage not found !"

      const { ata: userUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: user, mint: usdcMint
      }, this.ixCallBack,)
      const { ata: creatorUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: parentProfileLineage.creator,
        mint: usdcMint, payer: user
      }, this.ixCallBack,)
      const { ata: parentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: this.__getProfileStateAccount(parentProfileStateInfo.mint),
        mint: usdcMint, payer: user, allowOffCurveOwner: true
      }, this.ixCallBack)
      const { ata: grandParentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: this.__getProfileStateAccount(parentProfileLineage.parent),
        mint: usdcMint, payer: user, allowOffCurveOwner: true
      }, this.ixCallBack)
      const { ata: ggrandParentVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: this.__getProfileStateAccount(parentProfileLineage.grandParent),
        mint: usdcMint, payer: user, allowOffCurveOwner: true
      }, this.ixCallBack)
      const { ata: uncleVaultUsdcAta } = await this.baseSpl.__getOrCreateTokenAccountInstruction({
        owner: this.__getProfileStateAccount(parentProfileLineage.unclePsy),
        mint: usdcMint, payer: user, allowOffCurveOwner: true
      }, this.ixCallBack)
      //NOTE: need to improve it
      const tx_tmp = new web3.Transaction().add(...this.txis)
      this.txis = []
      const signature_tmp = await this.provider.sendAndConfirm(tx_tmp)

      const ix = await this.program.methods.mintProfile(name, symbol, uri).accounts({
        user,
        userAta,
        profile,
        profileMetadata,
        profileEdition,
        profileState,
        parentProfileState,
        parentProfileMetadata,
        collectionAuthorityRecord,
        mainState: this.mainState,
        collection,
        collectionMetadata,
        collectionEdition,
        ataProgram,
        mplProgram,
        tokenProgram,
        systemProgram,
        sysvarInstructions,
        // minting cost distributaion require accounts
        userUsdcAta,
        creatorUsdcAta,
        parentVaultUsdcAta,
        grandParentVaultUsdcAta,
        ggrandParentVaultUsdcAta,
        uncleVaultUsdcAta,
      }).instruction()
      this.txis.push(ix)

      const tx = new web3.Transaction().add(...this.txis)
      this.txis = []
      const signature = await this.provider.sendAndConfirm(tx, [mintKp])
      log({ parentVaultUsdcAta: parentVaultUsdcAta.toBase58() })
      log({ vault: this.__getValutAccount(parentProfile) })
      log({ parentProfile: parentProfile.toBase58() })
      return {
        Ok: { signature, info: { profile: profile.toBase58() } }
      }
    } catch (e) {
      // log({ error: JSON.parse(JSON.stringify(e)) })
      log({ e })
      return { Err: e };
    }
  }
}
