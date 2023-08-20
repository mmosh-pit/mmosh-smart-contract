import { web3, AnchorProvider } from '@project-serum/anchor'
import { BaseSpl } from './base/baseSpl'
import { web3Consts } from './web3Consts'
import { ProfileState } from './web3Types'

//extra
import fs from 'fs'

const log = console.log;
const { oposToken: usdcMint } = web3Consts;

export function calcNonDecimalValue(value: number, decimals: number): number {
  return Math.trunc(value * (Math.pow(10, decimals)))
}


//Extra for testing
export async function __mintOposToken(provider: AnchorProvider) {
  const mintInfo = await provider.connection.getAccountInfo(usdcMint)
  if (mintInfo) return { txSignature: "", mint: usdcMint };

  const dataStr = fs.readFileSync('./tests/_accounts/usdc_mint.json', { encoding: "utf8" })
  const mintSecretKey = Uint8Array.from(JSON.parse(dataStr))
  const mintKeypair = web3.Keypair.fromSecretKey(mintSecretKey)
  const spl = new BaseSpl(provider.connection)
  const { ixs, mintKp } = await spl.__getCreateTokenInstructions({
    mintAuthority: provider.publicKey,
    mintKeypair,
    decimal: 6,
    mintingInfo: {
      tokenAmount: calcNonDecimalValue(1000, 6),
    }
  })
  const tx = new web3.Transaction().add(...ixs);
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
      unclePsy: state.lineage.ggreateGrandParent.toBase58(),
      generation: state.lineage.generation.toNumber(),
      totalChild: state.lineage.totalChild.toNumber(),
    },
    activationToken: state.activationToken?.toBase58(),
  }
}
