import { utf8 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { web3 } from '@project-serum/anchor'
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"


export const web3Consts = {
  systemProgram: web3.SystemProgram.programId,
  sysvarInstructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
  tokenProgram: TOKEN_PROGRAM_ID,
  mplProgram: new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
  ataProgram: new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  Seeds: {
    mainState: utf8.encode("main_state1"),
    fakeIdState: utf8.encode("fake_id_state1"),
    activationTokenState: utf8.encode("activation_token_state1"),
  },

}
