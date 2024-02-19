import * as anchor from "@coral-xyz/anchor";
import { BN, Program, validateAccounts, web3 } from "@coral-xyz/anchor";
import { base64, utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { amount, approveNftDelegateOperation, GuardNotEnabledError, Metadata, Metaplex, Nft } from "@metaplex-foundation/js";
import { assert } from "chai";
import { Sop } from "../target/types/sop";
import { Connectivity as AdConn, sleep } from "./admin";
import { BaseMpl } from "./base/baseMpl";
import { Connectivity as UserConn } from "./user";
import { calcNonDecimalValue, deployJsonData, parseProfileState, __mintOposToken } from "./utils";
import { web3Consts } from './web3Consts';

const log = console.log;
const {
  oposToken,
  mplProgram,
  tokenProgram,
  systemProgram,
  sysvarInstructions,
  associatedTokenProgram,
  addressLookupTableProgram,
} = web3Consts;

describe("sop", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const program = anchor.workspace.Sop as Program<Sop>;
  const programId = program.programId;

  console.log("prgram id ", programId.toBase58())
  const owner = provider.publicKey;
  const adConn = new AdConn(provider, program.programId);
  const userConn = new UserConn(provider, programId);
  const metaplex = new Metaplex(provider.connection)
  const receiver = new web3.PublicKey("85YaBFhbwuqPiRVNrXdMJwdt1qjdxbtypGcFBc6Tp7qA")

  it("minting opos token", async () => {
    const { mint, txSignature } = await __mintOposToken(provider);
    log({ oposToken: mint.toBase58() })
  })

  it("Initialise Main State!", async () => {
    const accountInfo = await connection.getAccountInfo(adConn.mainState)
    if (accountInfo != null) return
    const profileMintingCost = new BN(calcNonDecimalValue(20000, 9))
    const invitationMintingCost = new BN(calcNonDecimalValue(1, 9))
    const res = await adConn.initMainState({
      oposToken,
      profileMintingCost,
      invitationMintingCost,
      mintingCostDistribution: {
        parent: 100 * 20,
        grandParent: 100 * 10,
        greatGrandParent: 100 * 7,
        ggreatGrandParent: 100 * 3,
        genesis: 100 * 60,
      },
      tradingPriceDistribution: {
        seller: 100 * 80,
        parent: 100 * 5,
        grandParent: 100 * 3,
        greatGrandParent: 100 * 2,
        genesis: 100 * 10,
      }
    })
    log({ res })
    // if (res?.Err) throw "initialise mainstate failed"
    assert(res?.Ok, "initialise mainstate failed")

  });


  let profileCollection: web3.PublicKey = null
  it("creating profile Collections", async () => {
    console.log("main state ",adConn.mainState.toBase58());
    const mainStateInfo = await adConn.program.account.mainState.fetch(adConn.mainState)
    //skipping membershipPassCollection mintign if it already minted
    if (mainStateInfo.profileCollection.toBase58() != web3.SystemProgram.programId.toBase58()) {
      profileCollection = mainStateInfo.profileCollection;
      console.log("existing profile collection ",profileCollection.toBase58());
      return;
    }

    const name = "Moral Panic"
    const res = await adConn.createProfileCollection({
      name,
    })
    assert(res?.Ok, "Unable to create collection")
    log({ sign: res.Ok.signature, collection: res.Ok.info.collection })
    profileCollection = new web3.PublicKey(res.Ok.info.collection)

    console.log("new profile collection ",profileCollection.toBase58());
  })



  let genesisProfile: web3.PublicKey = null
  it("initialise genesis profile", async () => {
    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    // const creator = provider.publicKey
    const ggreatGrandParent = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;
    const res = await adConn.mintGenesisProfile({
      name: "Charlie the Cybernatural Owl #0",
      symbol: "OWL",
      uri: "https://shdw-drive.genesysgo.net/FuBjTTmQuqM7pGR2gFsaiBxDmdj8ExP5fzNwnZyE2PgC/gensis.json",
      lineage: {
        parent,
        grandParent,
        greatGrandParent,
        ggreatGrandParent,
        creator,
        generation: new BN(1),
        totalChild: new BN(0),
      },
      parentMint,
    })

    assert(res.Ok, "Failed to initialise genesis profile")
    const genesisProfileStr = res.Ok.info.profile
    genesisProfile = new web3.PublicKey(genesisProfileStr)
    // log({ sign: res.Ok.signature, profile: res.Ok.info.profile })
    const nftInfo = await metaplex.nfts().findByMint({ mintAddress: new web3.PublicKey(genesisProfileStr) })
    assert(nftInfo?.collection?.verified, "collection verification failed")

    console.log("genesisProfileStr ",genesisProfileStr);
  })



  let commonLut: web3.PublicKey = null
  it("Initialise address lookup table", async () => {
    const stateInfo = await adConn.program.account.mainState.fetch(adConn.mainState)
    if (stateInfo.commonLut.toBase58() != systemProgram.toBase58()) {
      commonLut = stateInfo.commonLut;
      console.log("existing lookup table ",commonLut.toBase58());
      return;
    }

    const res = await adConn.setupLookupTable([
      adConn.programId,
      adConn.mainState,
      genesisProfile,
      oposToken,
      stateInfo.profileCollection,
      BaseMpl.getEditionAccount(stateInfo.profileCollection),
      BaseMpl.getMetadataAccount(stateInfo.profileCollection),
      web3.ComputeBudgetProgram.programId,
      mplProgram,
      tokenProgram,
      systemProgram,
      sysvarInstructions,
      associatedTokenProgram,
      addressLookupTableProgram,
    ])
    assert(res.Ok, "Failed to initialise address lookup table")
    commonLut = new web3.PublicKey(res.Ok.info.lookupTable)
    // log({ signature: res.Ok.signature, lookupTableAddress: addressLookupTable.toBase58() })

    const res2 = await adConn.setCommonLut(commonLut);
    assert(res2.Ok, "Failed to initialise address lookup table")
    console.log("mew lookup table ",commonLut.toBase58());
  })

  return;


  let activationToken: web3.PublicKey = null
  it("Initialise activation token", async () => {
    const __collection = (await adConn.program.account.mainState.fetch(adConn.mainState)).profileCollection;
    const name = "OPOS Activation Badge"
    const symbol = "OPOSACT"
    // const ipfsHash = deployJsonData({
    //   "name": name,
    //   "symbol": symbol,
    //   "description": "The holder of this OPOS Activation Badge is invited to set up a Profile on OPOS DAO.",
    //   "image": "",
    //   "external_url": "https://oposdao.com/",
    //   "family": "Mapshifting",
    //   "attributes": [
    //     {
    //       "trait_type": "Badge",
    //       "value": "Activation"
    //     },
    //     {
    //       "trait_type": "EcoSystem",
    //       "value": "OPOSECO",
    //     },
    //   ],
    // })
    // const uri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
    const uri = 'https://gateway.pinata.cloud/ipfs/QmTmLdPTzY5YRHF6AzVf4DSnVeBhXUhPDWaoAYZrF52jXX'
    const res = await adConn.initActivationToken({ name: "Activation Token", symbol, uri })
    // log({ res })
    // const res = await userConn.initActivationToken({ profile: __profile, name: "Activation Token" })
    assert(res.Ok, "Failed to initialise activation Token")
    log("ActivationToken: ", res.Ok.info.activationToken)
    activationToken = new web3.PublicKey(res.Ok.info.activationToken)
  })


  it("Mint activationToken", async () => {
    const res = await adConn.mintActivationToken(45, receiver);
    // const res = await adConn.mintActivationToken(5);
    // log({ signature: res.Ok.signature })
    assert(res.Ok, "Failed to mint activation Token")
    await sleep(2000)
  })


  /// USER: SIDE
  let userProfile: web3.PublicKey = null
  it("Mint Profile by ActivationToken", async () => {
    console.log("activationToken ", activationToken.toBase58())
    console.log("genesisProfile ", genesisProfile.toBase58())
    console.log("commonLut ", commonLut.toBase58())
    const res = await userConn.mintProfileByActivationToken({
      // name: "Profile By At12345",
      name: "gGreateGrandParent",
      symbol: "Profile12",
      uriHash: "https://gateway.pinata.cloud/ipfs/bafybeibiljljuwt6rathayvhn2lzljrkq5fdm4qpkfmpfjmz54dfleuqqy",
      activationToken,
      genesisProfile,
      commonLut,
    })
    assert(res.Ok, "Failed to mint Profile")
    log({ signature: res.Ok.signature, profile: res.Ok.info.profile })
    await sleep(5000)
    userProfile = new web3.PublicKey(res.Ok.info.profile)
  })

  let subscriptionToken: string = null
  it("Initialise Subscription Token", async () => {
    const res = await userConn.initSubscriptionBadge({
      profile: userProfile,
      name: "User Subscription"
    })
    assert(res.Ok, "Failed to initalise activation token")
    log({ signature: res.Ok.signature, subscriptionToken: res.Ok.info.subscriptionToken })
    subscriptionToken = res.Ok.info.subscriptionToken
  })
  
  it("Mint Subscription Token", async () => {
    const res = await userConn.mintSubscriptionToken({ subscriptionToken: subscriptionToken });
    log({ signature: res.Ok.signature })
    assert(res.Ok, "Failed to mint activation Token")
  })

  //Subscription
  let subscriptionProfile: web3.PublicKey = null
  it("Mint profile by subscription profile", async () => {
    const res = await userConn.mintProfileByActivationToken({
      activationToken: subscriptionToken,
      genesisProfile: genesisProfile,
      // name: "Profile Sub",
      name: "GreatGrandParent",
      commonLut,
    })
    assert(res.Ok, "Failed to mint Profile")
    log({ signature: res.Ok.signature, profile: res.Ok.info.profile })
    await sleep(5000)
    subscriptionProfile = new web3.PublicKey(res.Ok.info.profile)
  })

  // lineage check
  it("genesis check:", async () => {
    const ggreateGrandParent = userProfile
    const greatGrandParent = subscriptionProfile;
    const greatGrandParentSubToken = new web3.PublicKey((await userConn.initSubscriptionBadge({
      profile: greatGrandParent,
      name: "User Subscription"
    })).Ok?.info.subscriptionToken)
    await userConn.mintSubscriptionToken({ subscriptionToken: greatGrandParentSubToken });
    const grandParent = new web3.PublicKey((await userConn.mintProfileByActivationToken({
      activationToken: greatGrandParentSubToken,
      genesisProfile: genesisProfile,
      name: "GrandParent",
      commonLut,
    })).Ok.info.profile)
    await sleep(5000)

    const grandParentSubToken = new web3.PublicKey((await userConn.initSubscriptionBadge({
      profile: grandParent,
      name: "User Subscription"
    })).Ok?.info.subscriptionToken)
    await userConn.mintSubscriptionToken({ subscriptionToken: grandParentSubToken });
    const parent = new web3.PublicKey((await userConn.mintProfileByActivationToken({
      activationToken: grandParentSubToken,
      genesisProfile: genesisProfile,
      name: "Parent",
      commonLut,
    })).Ok.info.profile)
    await sleep(5000)

    const parentSubToken = new web3.PublicKey((await userConn.initSubscriptionBadge({
      profile: parent,
      name: "User Subscription"
    })).Ok?.info.subscriptionToken)
    // await userConn.mintSubscriptionToken({ subscriptionToken: parentSubToken });
    await userConn.mintSubscriptionToken({ parentProfile: parent });

    //Profiles Tranfer
    await userConn.baseSpl.transfer_token({ mint: ggreateGrandParent, sender: provider.publicKey, receiver: web3.Keypair.generate().publicKey, init_if_needed: true }, userConn.ixCallBack)
    await userConn.baseSpl.transfer_token({ mint: greatGrandParent, sender: provider.publicKey, receiver: web3.Keypair.generate().publicKey, init_if_needed: true }, userConn.ixCallBack)
    await userConn.baseSpl.transfer_token({ mint: grandParent, sender: provider.publicKey, receiver: web3.Keypair.generate().publicKey, init_if_needed: true }, userConn.ixCallBack)
    await userConn.baseSpl.transfer_token({ mint: parent, sender: provider.publicKey, receiver: web3.Keypair.generate().publicKey, init_if_needed: true }, userConn.ixCallBack)
    const tx = await new web3.Transaction().add(...userConn.txis)
    userConn.txis = []
    const transferRes = await userConn.provider.sendAndConfirm(tx)
    // log({ transferRes })
    const parentProfileStateAccount = userConn.__getProfileStateAccount(parent)
    log({ parentState: parentProfileStateAccount.toBase58() })

    

    const res = await userConn.mintProfileByActivationToken({
      activationToken: parentSubToken,
      genesisProfile: genesisProfile,
      name: "Profile Sub",
      symbol: "symbol1",
      uriHash: "bafybeibiljljuwt6rathayvhn2lzljrkq5fdm4qpkfmpfjmz54dfleuqqy",
      // uri: "https://gateway.pinata.cloud/ipfs/bafybeibiljljuwt6rathayvhn2lzljrkq5fdm4qpkfmpfjmz54dfleuqqy",
      // uri: "bafybeibiljljuwt6rathayvhn2lzljrkq5fdm4qpkfmpfjmz54dfleuqqy",
      commonLut,
    })
    log({ res: JSON.stringify(res) })
    const child = new web3.PublicKey(res.Ok.info.profile)

    log({
      lineage: {
        parent: parent.toBase58(),
        grandParent: grandParent.toBase58(),
        greatGrandPanre: greatGrandParent.toBase58(),
        ggreatGrandParent: ggreateGrandParent.toBase58(),
        genesisProfile: genesisProfile.toBase58()
      }
    })
  })
})
