import { web3 } from '@project-serum/anchor'
import { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import { Sop } from "../target/types/sop";

const mainStateTypeName = "mainState";
const profileStateTypeName = "profileState";
const lineageTypeName = "LineageInfo";

export type MainState = IdlAccounts<Sop>[typeof mainStateTypeName];
export type ProfileState = IdlAccounts<Sop>[typeof profileStateTypeName];
export type LineageInfo = IdlTypes<Sop>[typeof lineageTypeName];

const mainStateInputTypeName = "MainStateInput";
const mintProfileByAdminInput = "MintProfileByAdminInput"
export type MainStateInput = IdlTypes<Sop>[typeof mainStateInputTypeName];
export type MintProfileByAdminInput = IdlTypes<Sop>[typeof mintProfileByAdminInput];


//EXTRA (Out of IDL)
export type Result<T, E> = {
  Ok?: T;
  Err?: E;
};
export type TxPassType<Info> = { signature: string, info?: Info };

export type _MintProfileInput = {
  name?: string,
  symbol?: string,
  uri?: string,
  parentProfile: string | web3.PublicKey
}
