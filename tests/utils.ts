import { web3, AnchorProvider } from '@project-serum/anchor'
import { BaseSpl } from './base/baseSpl'
import { web3Consts } from './web3Consts'
import { ProfileState } from './web3Types'
import { Metadata, Metaplex, } from '@metaplex-foundation/js'
import { TokenStandard } from '@metaplex-foundation/mpl-token-metadata'

//extra
import fs from 'fs'
import Axios from 'axios'

const log = console.log;
const { oposToken: usdcMint } = web3Consts;

export function calcNonDecimalValue(value: number, decimals: number): number {
  return Math.trunc(value * (Math.pow(10, decimals)))
}


//Extra for testing
export async function __mintOposToken(provider: AnchorProvider) {
  const mintInfo = await provider.connection.getAccountInfo(usdcMint)
  if (mintInfo) return { txSignature: "", mint: usdcMint };
  const tokenAmount = 10_000_000_000;

  const dataStr = fs.readFileSync('./tests/_accounts/opos_coin.json', { encoding: "utf8" })
  const mintSecretKey = Uint8Array.from(JSON.parse(dataStr))
  const mintKp = web3.Keypair.fromSecretKey(mintSecretKey)
  const spl = new BaseSpl(provider.connection)

  const { ixs: initTokenIxs, mintKp: _ } = await spl.__getCreateTokenInstructions({
    mintAuthority: provider.publicKey,
    mintKeypair: mintKp,
    decimal: 6,
    mintingInfo: {
      tokenAmount: calcNonDecimalValue(tokenAmount, 6),
    }
  })
  // const { ixs: mintIxs } = await spl.mintToken({ mint: mintKp.publicKey, authority: provider.publicKey, decimal: 6, amount: 10_000_000_000 })

  const metaplex = new Metaplex(provider.connection)
  metaplex.identity().setDriver({ publicKey: provider.publicKey, signMessage: null, signTransaction: null, signAllTransactions: null })
  const name = "OPOS Coin"
  const symbol = "OPOS"
  // const ipfsHash = await deployJsonData({
  //   "name": name,
  //   "symbol": symbol,
  //   "description": "The official token of OPOS DAO, making all things possible on Solana.",
  //   "image": "",
  // })
  const uri = "https://gateway.pinata.cloud/ipfs/QmSicn84YHJemkfpCCq3PbWudnPYsf3fKXSeWjaBmTj1pB"
  // const uri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`

  const setMetadataIxs = (await metaplex.nfts().builders().create({
    name,
    symbol,
    uri,
    tokenStandard: TokenStandard.Fungible,
    useNewMint: mintKp,
    sellerFeeBasisPoints: 0,
    mintTokens: false,
  })).getInstructions()
  const tx = new web3.Transaction().add(...initTokenIxs, ...setMetadataIxs);

  let txSignature;
  try {
    txSignature = await provider.sendAndConfirm(tx, [mintKp])
  } catch (error) {
    log("Error on Usdc Minting: ", error)
  }
  return { txSignature, mint: mintKp.publicKey };
}

//Type parsing
export function parseProfileState(state: ProfileState) {
  return {
    profileMint: state.mint.toBase58(),
    lineage: {
      creator: state.lineage.creator.toBase58(),
      parent: state.lineage.parent.toBase58(),
      grandParent: state.lineage.grandParent.toBase58(),
      greatGrandParent: state.lineage.greatGrandParent.toBase58(),
      // unclePsy: state.lineage.ggreateGrandParent.toBase58(),
      generation: state.lineage.generation.toNumber(),
      totalChild: state.lineage.totalChild.toNumber(),
    },
    activationToken: state.activationToken?.toBase58(),
  }
}

export function deployJsonData(data: any) {
  const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
  const pinataApiKey = "30448ea9d4ed819a549d"
  const pinataSecretApiKey = "42c2de59b9044f322a6ad1ed3cfebf049f4519b518c5178d6b6828237e58a847"

  return Axios.post(url,
    data,
    {
      headers: {
        'Content-Type': `application/json`,
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretApiKey
      }
    }
  ).then(function(response) {
    // log({ response })
    return response?.data?.IpfsHash;
  }).catch(function(error) {
    log({ jsonUploadErr: error })
    return null
  });
}
