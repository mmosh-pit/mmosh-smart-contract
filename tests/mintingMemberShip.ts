import * as anchor from "@coral-xyz/anchor";
import { BN, Program, validateAccounts, web3 } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { approveNftDelegateOperation, Metadata, Metaplex, Nft } from "@metaplex-foundation/js";
import { assert } from "chai";
import { Sop } from "../target/types/sop";
import { Connectivity as AdConn } from "./admin";
import { Connectivity as UserConn } from "./user";
import { calcNonDecimalValue, parseProfileState, __mintUsdc } from "./utils";
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

  it("minting usdc", async () => {
    const { mint, txSignature } = await __mintUsdc(provider);
    // usdcMint = mint;
    // log({
    //   usdcMint: mint.toBase58(),
    //   usdcMintTxSignature: txSignature
    // })
  })

  it("Initialise Main State!", async () => {
    const accountInfo = await connection.getAccountInfo(adConn.mainState)
    const profileMintingUsdcPrice = new BN(calcNonDecimalValue(0.02, 6))
    if (accountInfo != null) return
    const res = await adConn.initMainState({
      oposToken,
      profileMintingUsdcPrice,
      royaltyForMinting: {
        creator: 60,
        parent: 20,
        grandParent: 10,
        ggrandParent: 7,
        unclePsy: 3,
      },
      royaltyForTrading: {
        seller: 80,
        creator: 5,
        parent: 3,
        curator: 3,
        unclePsy: 2,
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

    const name = "Membership Collection"
    const res = await adConn.createProfileCollection({
      name,
    })

    assert(res?.Ok, "Unable to create collection")
    log({ sign: res.Ok.signature, profile: res.Ok.info.collection })
    const collectionId = new web3.PublicKey(res.Ok.info.collection)
  })

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

  it("initialise genesis profile", async () => {
    const mainState = await userConn.program.account.mainState.fetch(userConn.mainState)
    const profileCollection = mainState.profileCollection

    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    const ggreateGrandParent = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;

    const res = await adConn.mintGenesisProfile({
      lineage: {
        generation: new BN(1),
        parent,
        grandParent,
        greatGrandParent,
        creator,
        ggreateGrandParent,
        totalChild: new BN(0),//not require
      },
      uri: "",
      symbol: "",
      name: "Profile 1(Admin)",
      parentMint,
    }, profileCollection)

    if (res?.Err) throw "tx failed"
    const genesisProfile = res.Ok.info.profile
    // log({ res, memberShipProfile })
    log({ sign: res.Ok.signature, profile: res.Ok.info.profile })
    const nftInfo = await metaplex.nfts().findByMint({ mintAddress: new web3.PublicKey(genesisProfile) })
    assert(nftInfo?.collection?.address.toBase58() == profileCollection.toBase58(), "collection missmatch")
    assert(nftInfo?.collection?.verified, "collection verification failed")
  })

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

  let userMemberShipProfile: string;
  it("Creating MemberShip profile using parent Membership profile (user)", async () => {
    const profileCollection = (await userConn.program.account.mainState.fetch(userConn.mainState)).profileCollection
    const profileCollectionInfo = await userConn.program.account.collectionState.fetch(userConn.__getCollectionStateAccount(profileCollection));
    const genesisProfile = profileCollectionInfo.genesisProfile
    log({ genesisProfile: genesisProfile.toBase58() })

    // const res = await userConn.mintProfileByActivationToken({
    //   name: "Membership user 1",
    //   parentProfile: genesisProfile,
    // });
    // if (res?.Err) throw "Tx failed"
    // userMemberShipProfile = res.Ok?.info.profile;
    // log({ sign: res.Ok.signature, profile: res.Ok.info.profile })
    // const userProfileStateId = userConn.__getProfileStateAccount(new web3.PublicKey(userMemberShipProfile))
    // const userProfileState = await userConn.program.account.profileState.fetch(userProfileStateId);
    // assert(userProfileState.lineage.parent.toBase58() == genesisProfile, "lineage parent profile missmatch")
  })

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
