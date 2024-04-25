import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
// import { WalletContextState } from "@solana/wallet-adapter-react";
import { BaseSpl } from "./baseSpl";

// import { Uses } from "@metaplex-foundation/js/node_modules/@metaplex-foundation/mpl-token-metadata";
import {
  Uses,
  PROGRAM_ID as MPL_ID,
  TokenStandard,
  BurnEditionNftInstructionAccounts,
  createBurnInstruction,
  BurnInstructionArgs,
  BurnNftInstructionAccounts,
  BurnInstructionAccounts,
} from "@metaplex-foundation/mpl-token-metadata";

import {
  Metaplex,
  Metadata as MetadataM,
  CreatorInput,
  UseNftInput,
  VerifyNftCollectionBuilderParams,
  CreateNftBuilderParams,
} from "@metaplex-foundation/js";

import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const log = console.log;

export class BaseMpl {
  connection: web3.Connection;
  mplIxs: web3.TransactionInstruction[] = [];
  mplSigns: web3.Keypair[] = [];
  metaplex: Metaplex;

  constructor(wallet: any) {
    // super(connection);
    // this.connection = new web3.Connection(Config.endpoint);
    this.metaplex = new Metaplex(this.connection);
  }

  setUpCallBack = (
    ixs: web3.TransactionInstruction[],
    signs: web3.Keypair[]
  ) => {
    if (ixs) {
      this.mplIxs.push(...ixs);
      log("ixs added to mpl : ", ixs);
    }
    if (signs) {
      log("sings added to mpl : ", signs);
      this.mplSigns.push(...signs);
    }
  };

  reinit(): void {
    // const user = this.wallet.publicKey;
    // if (this.metaplex.identity().publicKey.toBase58() != user.toBase58()) {
    //   this.metaplex.identity().setDriver({
    //     publicKey: user,
    //     signMessage: this.wallet.signMessage,
    //     signTransaction: this.wallet.signTransaction,
    //     signAllTransactions: this.wallet.signAllTransactions,
    //   });
    // }
    //
    // this.mplIxs = [];
  }

  static getEditionAccount(tokenId: web3.PublicKey) {
    return web3.PublicKey.findProgramAddressSync(
      [
        utf8.encode("metadata"),
        MPL_ID.toBuffer(),
        tokenId.toBuffer(),
        utf8.encode("edition"),
      ],
      MPL_ID
    )[0];
  }

  static getMetadataAccount(tokenId: web3.PublicKey) {
    return web3.PublicKey.findProgramAddressSync(
      [utf8.encode("metadata"), MPL_ID.toBuffer(), tokenId.toBuffer()],
      MPL_ID
    )[0];
  }

  static getCollectionAuthorityRecordAccount(collection: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [
        utf8.encode("metadata"),
        MPL_ID.toBuffer(),
        collection.toBuffer(),
        utf8.encode("collection_authority"),
        authority.toBuffer()
      ],
      MPL_ID
    )[0];
  }

  // async __createNft(
  //   input: CreateNftBuilderParams,
  //   collectionVerifictionInfo: { collectionId: web3.PublicKey } = null
  // ) {
  //   this.reinit();
  //   const nftKeypair = web3.Keypair.generate();
  //   input.useNewMint = nftKeypair;
  //
  //   const txBuilder = await this.metaplex.nfts().builders().create(input);
  //
  //   if (collectionVerifictionInfo) {
  //     txBuilder.add(
  //       await this.metaplex.nfts().builders().verifyCollection({
  //         mintAddress: nftKeypair.publicKey,
  //         collectionMintAddress: collectionVerifictionInfo.collectionId,
  //       })
  //     );
  //   }
  //
  //   const res = await txBuilder.sendAndConfirm(this.metaplex);
  //
  //   log({ res });

  // const tx = new web3.Transaction().add(...ixs);
  // const res = await this.wallet.sendTransaction(tx, this.connection, {
  //   signers: [nftKeypair],
  // });
  // }

  // async __burnNft(mint: web3.PublicKey) {
  //   this.reinit();
  //   const user = this.wallet.publicKey;
  //   const user_ata = getAssociatedTokenAddressSync(mint, user);
  //   const metadata = BaseMpl.getMetadataAccount(mint);
  //   const edition = BaseMpl.getEditionAccount(mint);
  //
  //   const ix = createBurnInstruction(
  //     {
  //       mint,
  //       metadata,
  //       edition,
  //       token: user_ata,
  //       splTokenProgram: TOKEN_PROGRAM_ID,
  //       authority: user,
  //       sysvarInstructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
  //     },
  //     { burnArgs: { __kind: "V1", amount: 1 } }
  //   );
  //
  //   const tx = new web3.Transaction().add(ix);
  //   const res = await this.wallet.sendTransaction(tx, this.connection);
  //   log({ res });
  // }
  //
  // async verifyCollectionItem(input: VerifyNftCollectionBuilderParams) {
  //   const ixs = this.metaplex
  //     .nfts()
  //     .builders()
  //     .verifyCollection(input)
  //     .getInstructions();
  //   const tx = new web3.Transaction().add(...ixs);
  //   return { tx };
  // }
}
