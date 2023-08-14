import { web3, AnchorProvider } from '@project-serum/anchor'
import { BaseSpl } from './base/baseSpl'
import { web3Consts } from './web3Consts'

//extra
import fs from 'fs'

const log = console.log;
const { usdcMint } = web3Consts;

export function calcNonDecimalValue(value: number, decimals: number): number {
  return Math.trunc(value * (Math.pow(10, decimals)))
}


//Extra for testing
export async function __mintUsdc(provider: AnchorProvider) {
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
