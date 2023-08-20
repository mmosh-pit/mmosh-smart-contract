import * as anchor from "@coral-xyz/anchor";
import { web3, BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Sop } from "../target/types/sop";
import { Connectivity as AdConn } from "./admin"
import { Connectivity as UserConn } from "./user"
import { web3Consts } from './web3Consts'
import { calcNonDecimalValue, __mintOposToken } from "./utils";

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

  it("minting usdc", async () => {
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
    const res = await adConn.initMainState({
      oposToken,
      profileMintingUsdcPrice: new BN(calcNonDecimalValue(0.02, 6)),
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
    log("Initialise mainState")
  });

  let collection: web3.PublicKey = null;
  it("create Collections", async () => {
    const res = await adConn.createProfileCollection({
      name: "Hello",
    })
    // log({ res })
    if (res?.Err) throw "tx failed"
    collection = new web3.PublicKey(res.Ok.info.collection)
  })

  // THIS function require a collection which need to be initialized before
  let parentProfile: string
  it('Create profile by admin', async () => {
    const parent = web3.Keypair.generate().publicKey;
    const grandParent = web3.Keypair.generate().publicKey;
    const greatGrandParent = web3.Keypair.generate().publicKey;
    const creator = web3.Keypair.generate().publicKey;
    const ggreateGrandParent = web3.Keypair.generate().publicKey;
    const parentMint = web3.Keypair.generate().publicKey;

    const res = await adConn.mintGenesisProfile({
      lineage: {
        generation: new BN(2),
        parent,
        grandParent,
        greatGrandParent,
        creator,
        ggreateGrandParent,
        totalChild: new BN(3),//not require
      },
      uri: "",
      symbol: "",
      name: "Profile 1(Admin)",
      parentMint,
    }, collection)

    if (res?.Err) throw "tx failed"
    parentProfile = res.Ok.info.profile
    const profile = new web3.PublicKey(res.Ok.info.profile)

    //getting profile State
    // const profileStateAccount = adConn.__getProfileStateAccount(profile)
    // const profileInfo = await adConn.program.account.profileState.fetch(profileStateAccount)
    // log({ profileInfo })
  })

  let _profile: string
  it("user Profile", async () => {
    // log("parent_profile: ", parentProfile)
    // log("pp_state: ", userConn.__getProfileStateAccount(new web3.PublicKey(parentProfile)))

    const res = await userConn.mint_profile({
      name: "User Profile",
      parentProfile,
    });
    log({ res })
    if (res?.Err) throw "Tx failed"
    _profile = res.Ok?.info.profile;
  })

  it("lineage testing", async () => {
    const ggrandParent = new web3.PublicKey(parentProfile)
    const grandParent = new web3.PublicKey(_profile)
    let parent: web3.PublicKey;
    let leaf: web3.PublicKey;

    const res1 = await userConn.mint_profile({
      name: "User Profile 1",
      parentProfile: grandParent,
    });
    if (res1?.Err) throw "Tx failed"
    parent = new web3.PublicKey(res1?.Ok.info.profile)

    const res2 = await userConn.mint_profile({
      name: "User Profile 2",
      parentProfile: parent,
    });
    if (res2?.Err) throw "Tx failed"
    leaf = new web3.PublicKey(res2?.Ok.info.profile)

    const s1 = userConn.__getProfileStateAccount(ggrandParent);
    const greateGrandParentState = await userConn.program.account.profileState.fetch(s1)

    const s2 = userConn.__getProfileStateAccount(grandParent);
    const grandParentState = await userConn.program.account.profileState.fetch(s2)

    const s3 = userConn.__getProfileStateAccount(parent);
    const parentState = await userConn.program.account.profileState.fetch(s3)

    const s4 = userConn.__getProfileStateAccount(leaf);
    const leafState = await userConn.program.account.profileState.fetch(s4)

    log({
      greateGrandParentState,
      grandParentState,
      parentState,
      leafState,
    })
  })


  // it("get mainState info: ", async () => {
  //   const mainState = await adConn.getMainStateInfo();
  //   log({ mainState })
  // })

});

// WinSeparatorxxx guifg=#665c54 guibg=#1d2021
