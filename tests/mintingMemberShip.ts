import * as anchor from "@coral-xyz/anchor";
import { BN, Program, validateAccounts, web3 } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { approveNftDelegateOperation, GuardNotEnabledError, Metadata, Metaplex, Nft } from "@metaplex-foundation/js";
import { assert } from "chai";
import { Sop } from "../target/types/sop";
import { Connectivity as AdConn } from "./admin";
import { Connectivity as UserConn } from "./user";
import { calcNonDecimalValue, parseProfileState, __mintOposToken } from "./utils";
import { web3Consts } from './web3Consts';

const log = console.log;
const { oposToken } = web3Consts;

describe("sop", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const program = anchor.workspace.Sop as Program<Sop>;
  const programId = program.programId;
  const owner = provider.publicKey;
  const adConn = new AdConn(provider, program.programId);
  const userConn = new UserConn(provider, programId);
  const metaplex = new Metaplex(provider.connection)
  const receiver = new web3.PublicKey("85YaBFhbwuqPiRVNrXdMJwdt1qjdxbtypGcFBc6Tp7qA")

  it("minting opos token", async () => {
    const { mint, txSignature } = await __mintOposToken(provider);
    // usdcMint = mint;
    // log({
    //   usdcMint: mint.toBase58(),
    //   usdcMintTxSignature: txSignature
    // })
  })

  it("Initialise Main State!", async () => {
    const accountInfo = await connection.getAccountInfo(adConn.mainState)
    if (accountInfo != null) return
    const profileMintingCost = new BN(calcNonDecimalValue(1, 6))
    const res = await adConn.initMainState({
      oposToken,
      profileMintingCost,
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
    // log({ res })
    // if (res?.Err) throw "initialise mainstate failed"
    assert(res?.Ok, "initialise mainstate failed")
  });

  it("creating profile Collections", async () => {
    const mainStateInfo = await adConn.program.account.mainState.fetch(adConn.mainState)
    //skipping membershipPassCollection mintign if it already minted
    if (mainStateInfo.profileCollection.toBase58() != web3.SystemProgram.programId.toBase58()) return;

    const name = "Profile Collection"
    const res = await adConn.createProfileCollection({
      name,
    })
    assert(res?.Ok, "Unable to create collection")
    log({ sign: res.Ok.signature, collection: res.Ok.info.collection })
    const collectionId = new web3.PublicKey(res.Ok.info.collection)
  })

  let genesisProfile: web3.PublicKey = null
  it("initialise genesis profile", async () => {
    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    // const creator = provider.publicKey
    const ggreateGrandParent = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;

    const res = await adConn.mintGenesisProfile({
      name: "Genesis Profile",
      symbol: "",
      uri: "",
      lineage: {
        parent,
        grandParent,
        greatGrandParent,
        ggreateGrandParent,
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
  })

  let activationToken: web3.PublicKey = null
  it("Initialise activation token", async () => {
    const __collection = (await adConn.program.account.mainState.fetch(adConn.mainState)).profileCollection;
    // const collectionInfo = ()
    const res = await adConn.initActivationToken({ name: "Activation Token" })
    log({ res })
    // const res = await userConn.initActivationToken({ profile: __profile, name: "Activation Token" })
    assert(res.Ok, "Failed to initialise activation Token")
    log("ActivationToken: ", res.Ok.info.activationToken)
    activationToken = new web3.PublicKey(res.Ok.info.activationToken)
  })

  it("Mint activationToken", async () => {
    // const res = await adConn.mintActivationToken(receiver);
    const res = await adConn.mintActivationToken();
    log({ signature: res.Ok.signature })
    assert(res.Ok, "Failed to mint activation Token")
  })

  /// USER: SIDE
  let userProfile: web3.PublicKey = null
  it("Mint Profile by ActivationToken", async () => {
    const res = await userConn.mintProfileByActivationToken({ activationToken, name: "Profile By At", genesisProfile })
    assert(res.Ok, "Failed to mint Profile")
    log({ signature: res.Ok.signature, profile: res.Ok.info.profile })
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
    const res = await userConn.mintSubscriptionToken(subscriptionToken);
    log({ signature: res.Ok.signature })
    assert(res.Ok, "Failed to mint activation Token")
  })

  it("Mint profile by subscription profile", async () => {
    const res = await userConn.mintProfileByActivationToken({
      activationToken: subscriptionToken,
      genesisProfile: genesisProfile,
      name: "Profile Sub"
    })
    assert(res.Ok, "Failed to mint Profile")
    log({ signature: res.Ok.signature, profile: res.Ok.info.profile })
  })



  // it("reset main", async () => {
  //   const res = await adConn.resetMain()
  //   assert(res.Ok, "Failed to mint Profile")
  //   log({ res })
  // })

  // it("getInfo", async () => {
  //   const res = await userConn.getUserInfo();
  //   log({ res })
  // })

  // it("creating brand Collections", async () => {
  //   const mainStateInfo = await adConn.program.account.mainState.fetch(adConn.mainState)
  //   //skipping membershipPassCollection mintign if it already minted
  //   if (mainStateInfo.brandCollection.toBase58() != web3.SystemProgram.programId.toBase58()) return;
  //
  //   const name = "brand Collection"
  //   const res1 = await adConn.createCollection({
  //     name,
  //   })
  //   log({ res1 })
  //   assert(res1?.Ok, "Unable to create collection")
  //
  //   const brandCollection = new web3.PublicKey(res1.Ok.info.collection)
  //   const res2 = await adConn.setBrandCollection(brandCollection)
  //   assert(res2?.Ok, "Unable to set collection")
  // })

  // let brandProfile: string;
  // it('Create brand Collections profile by admin', async () => {
  //   const mainState = await userConn.program.account.mainState.fetch(userConn.mainState)
  //   const brandCollection = mainState.brandCollection
  //
  //   const parent = web3.Keypair.generate().publicKey;
  //   const grandParent = web3.Keypair.generate().publicKey;
  //   const greatGrandParent = web3.Keypair.generate().publicKey;
  //   const creator = web3.Keypair.generate().publicKey;
  //   const unclePsy = web3.Keypair.generate().publicKey;
  //   const parentMint = web3.Keypair.generate().publicKey;
  //
  //   const res = await adConn.mintProfileByAdmin({
  //     parentMintLineage: {
  //       generation: new BN(2),
  //       parent,
  //       grandParent,
  //       greatGrandParent,
  //       creator,
  //       unclePsy,
  //       totalChild: new BN(3),//not require
  //     },
  //     uri: "",
  //     symbol: "",
  //     name: "brand Profile 1(Admin)",
  //     parentMint,
  //   }, brandCollection)
  //
  //   if (res?.Err) throw "tx failed"
  //   brandProfile = res.Ok.info.profile
  //   log({ res, brandProfile })
  //   const nftInfo = await metaplex.nfts().findByMint({ mintAddress: new web3.PublicKey(brandProfile) })
  //   assert(nftInfo?.collection?.address.toBase58() == brandCollection.toBase58(), "collection missmatch")
  //   assert(nftInfo?.collection?.verified, "collection verification failed")
  // })

  // let userMemberShipProfile: string;
  // it("Creating MemberShip profile using parent Membership profile (user)", async () => {
  //   const profileCollection = (await userConn.program.account.mainState.fetch(userConn.mainState)).profileCollection
  //   const profileCollectionInfo = await userConn.program.account.collectionState.fetch(userConn.__getCollectionStateAccount(profileCollection));
  //   const genesisProfile = profileCollectionInfo.genesisProfile
  //   log({ genesisProfile: genesisProfile.toBase58() })
  //
  //   const res = await userConn.mintActivationToken({
  //     name: "Membership user 1",
  //     activationToken,
  //   });
  //   if (res?.Err) throw "Tx failed"
  //   userMemberShipProfile = res.Ok?.info.profile;
  //   log({ sign: res.Ok.signature, profile: res.Ok.info.profile })
  //   const userProfileStateId = userConn.__getProfileStateAccount(new web3.PublicKey(userMemberShipProfile))
  //   const userProfileState = await userConn.program.account.profileState.fetch(userProfileStateId);
  //   assert(userProfileState.lineage.parent.toBase58() == genesisProfile, "lineage parent profile missmatch")
  // })

  // it("get user nfts", async () => {
  //   const mainState = await userConn.program.account.mainState.fetch(userConn.mainState)
  //   const memberShipCollectionStr = mainState.membershipPassCollection.toBase58()
  //   const brandCollectionStr = mainState.brandCollection.toBase58();
  //
  //   const res = await metaplex.nfts().findAllByOwner({ owner: provider.publicKey })
  //   let memberShipNfts: { name: string, id: string }[] = []
  //   let brandNfts: { name: string, id: string }[] = []
  //   for (let i of res) {
  //     if (i.model == 'metadata') {
  //       if (!i?.collection?.verified) continue;
  //       const collectionStr = i?.collection?.address?.toBase58()
  //
  //       if (collectionStr == memberShipCollectionStr) {
  //         memberShipNfts.push({ name: i.name, id: i.mintAddress.toBase58() })
  //       } else if (collectionStr == brandCollectionStr) {
  //         brandNfts.push({ name: i.name, id: i.mintAddress.toBase58() })
  //       }
  //     }
  //   }
  //   let main = await userConn.program.account.mainState.fetch(userConn.mainState);
  //   log({ main: JSON.stringify(main) })
  //   log({ memberShipNfts, brandNfts })
  // })

  // let activationToken: web3.PublicKey = null
  // it("initialise activation token", async () => {
  //   const res = await userConn.initActivationToken(userMemberShipProfile);
  //   // log({ res })
  //   assert(res.Ok, "Failed to create Actiavtion token")
  //   activationToken = new web3.PublicKey(res.Ok.info.activationToken)
  //   log({ sign: res.Ok.signature, activationToken: activationToken.toBase58() })
  // })
  //
  // it("mint Activation Tokne", async () => {
  //   const res = await userConn.mintActivationToken(activationToken);
  //   log({ sing: res.Ok.signature })
  //   assert(res.Ok, "Failed to mint Activation token")
  // })
  //
  // it("mint membership profile by activation token", async () => {
  //   const res = await userConn.mintProfileByActivationToken({
  //     name: "Membership Profile(AT)",
  //     activationToken,
  //   })
  //
  //   // const profileStateAccount = userConn.__getProfileStateAccount(res.Ok.info.profile)
  //   // // const profileStateAccount = userConn.__getProfileStateAccount(memberShipProfile)
  //   // const profileStateInfo = await userConn.program.account.profileState.fetch(profileStateAccount)
  //   // log({ profileState: parseProfileState(profileStateInfo) })
  //
  //   log({ sing: res.Ok.signature, profile: res.Ok.info.profile })
  //   assert(res.Ok, "Failed to mint Activation token")
  // })
})
