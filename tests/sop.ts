import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Sop } from "../target/types/sop";

describe("sop", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const program = anchor.workspace.Sop as Program<Sop>;
  const programId = program.programId;
  const owner = provider.publicKey;
  connection.getProgramAccounts(programId, {});

  it("Is initialized!", async () => {
    const dataAccount = web3.PublicKey.findProgramAddressSync(
      [utf8.encode("hi")],
      programId
    )[0];
  });
});

// WinSeparatorxxx guifg=#665c54 guibg=#1d2021
