import { utf8 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { web3 } from '@project-serum/anchor'
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"

export const web3Consts = {
  systemProgram: web3.SystemProgram.programId,
  sysvarInstructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
  tokenProgram: TOKEN_PROGRAM_ID,
  mplProgram: new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
  associatedTokenProgram: new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  addressLookupTableProgram: web3.AddressLookupTableProgram.programId,
  oposToken: new web3.PublicKey("6vgT7gxtF8Jdu7foPDZzdHxkwYFX9Y1jvgpxP8vH2Apw"),
  badgeCollection: new web3.PublicKey("147m8aw1hcmyBduQvSJoXCFaLb8wQSe9DNxWVsLTfqec"),
  rootCollection: new web3.PublicKey("9h9c4idX2UnGhFa266dQxMGD5kMk9pigumRAV2x9Hbk2"),
  passCollection: new web3.PublicKey("62eZCUAUFWHchLJnVsMkrWnW7Xt23UTvTexSQdtE5w6B"),
  LAMPORTS_PER_OPOS: 1000_000_000,
  Seeds: {
    mainState: utf8.encode("main_state4"),
    profileState: utf8.encode("profile_state1"),
    collectionState: utf8.encode("collection_state1"),
    activationTokenState: utf8.encode("activation_token_state1"),
    vault: utf8.encode("vault1"),
  },
}
