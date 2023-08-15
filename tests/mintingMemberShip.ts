import * as anchor from "@coral-xyz/anchor";
import { web3, BN, validateAccounts } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Sop } from "../target/types/sop";
import { Connectivity as AdConn } from "./admin"
import { Connectivity as UserConn } from "./user"
import { web3Consts } from './web3Consts'
import { calcNonDecimalValue, __mintUsdc } from "./utils";
import { Metadata, Nft, Metaplex } from "@metaplex-foundation/js";
import { assert } from "chai";

const log = console.log;
const { usdcMint } = web3Consts;

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
      usdcMint,
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
    if (res?.Err) throw "initialise mainstate failed"
    // log("Initialise mainState")
  });

  let memberShipCollection: web3.PublicKey = null;
  let memberShipCollectionMeta: Nft;
  it("creating membership Collections", async () => {
    const name = "Membership Collection"
    const res = await adConn.createCollection({
      name,
    })
    // log({ res })
    if (res?.Err) throw "tx failed"
    memberShipCollection = new web3.PublicKey(res.Ok.info.collection)
    log({ res })
    const mplData = await metaplex.nfts().findByMint({ mintAddress: memberShipCollection })
    if (mplData.model == 'nft') {
      memberShipCollectionMeta = mplData;
      if (memberShipCollectionMeta.name.slice(0, memberShipCollectionMeta.name.indexOf('\x00')) == name) throw "name missmatch"
    } else {
      throw "metadata missmatch"
    }
  })

  let ventureCollection;
  let ventureCollectionMeta: Nft;
  it("creating venture Collections", async () => {
    const name = "Venture Collection"
    const res = await adConn.createCollection({
      name,
    })
    // log({ res })
    if (res?.Err) throw "tx failed"
    log({ res })
    ventureCollection = new web3.PublicKey(res.Ok.info.collection)
    const mplData = await metaplex.nfts().findByMint({ mintAddress: memberShipCollection })
    if (mplData.model == 'nft') {
      ventureCollectionMeta = mplData;
      if (ventureCollectionMeta.name == name) throw "name missmatch"
      if (ventureCollectionMeta.name.slice(0, ventureCollectionMeta.name.indexOf('\x00')) == name) throw "name missmatch"
    } else {
      throw "metadata missmatch"
    }
  })

  let memberShipProfile: string;
  it('Create memberShip Collections profile by admin', async () => {
    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    const unclePsy = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;

    const res = await adConn.mintProfileByAdmin({
      parentMintLineage: {
        generation: new BN(2),
        parent,
        grandParent,
        greatGrandParent,
        creator,
        unclePsy,
        totalChild: new BN(3),//not require
      },
      uri: "",
      symbol: "",
      name: "member Profile 1(Admin)",
      parentMint,
    }, memberShipCollection)

    if (res?.Err) throw "tx failed"
    memberShipProfile = res.Ok.info.profile
    log({ res, memberShipProfile })
    const nftInfo = await metaplex.nfts().findByMint({ mintAddress: new web3.PublicKey(memberShipProfile) })
    if (nftInfo?.collection?.address.toBase58() != memberShipCollection.toBase58()) throw "collection not match"
    if (!nftInfo?.collection?.verified) throw "collection verification failed"
  })

  let ventureProfile: string;
  it('Create ventura Collections profile by admin', async () => {
    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    const unclePsy = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;

    const res = await adConn.mintProfileByAdmin({
      parentMintLineage: {
        generation: new BN(2),
        parent,
        grandParent,
        greatGrandParent,
        creator,
        unclePsy,
        totalChild: new BN(3),//not require
      },
      uri: "",
      symbol: "",
      name: "venture Profile 1(Admin)",
      parentMint,
    }, ventureCollection)

    if (res?.Err) throw "tx failed"
    ventureProfile = res.Ok.info.profile
    log({ res, ventureProfile })
    const nftInfo = await metaplex.nfts().findByMint({ mintAddress: new web3.PublicKey(ventureProfile) })
    if (nftInfo?.collection?.address.toBase58() != ventureCollection.toBase58()) throw "collection missmatch"
    if (!nftInfo?.collection?.verified) throw "collection verification failed"
  })


  let userMemberShipProfile: string;
  it("Creating MemberShip profile using parent Membership profile (user)", async () => {
    const res = await userConn.mint_profile({
      name: "Membership user 1",
      parentProfile: memberShipProfile,
    });
    log({ res })
    if (res?.Err) throw "Tx failed"
    userMemberShipProfile = res.Ok?.info.profile;

    const userProfileStateId = userConn.__getProfileStateAccount(new web3.PublicKey(userMemberShipProfile))
    const userProfileState = await userConn.program.account.profileState.fetch(userProfileStateId);
    assert(userProfileState.lineage.parent.toBase58() == memberShipProfile, "lineage parent profile missmatch")
  })

  it("get user nfts", async () => {
    // const res = await metaplex.nfts().findAllByOwner({ owner: provider.publicKey })
    // for (let i of res) {
    //   if (i.model == 'metadata') {
    //     log("nft name: ", i.name)
    //   }
    // }

    let main = await userConn.program.account.mainState.fetch(userConn.mainState);
    log({ main: JSON.stringify(main) })
  })
})
