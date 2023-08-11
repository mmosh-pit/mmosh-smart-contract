import { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import { Sop } from "../target/types/sop";

const mainStateTypeName = "mainState";
export type MainState = IdlAccounts<Sop>[typeof mainStateTypeName];

const fakeIdStateTypeName = "fakeIdState";
export type FakeIdState = IdlAccounts<Sop>[typeof fakeIdStateTypeName];

const peepStateTypeName = "fakeIdState";
export type PeepState = IdlAccounts<Sop>[typeof peepStateTypeName];

const mainStateInputTypeName = "MainStateInput";
export type MainStateInput = IdlTypes<Sop>[typeof mainStateInputTypeName];

const lineageTypeName = "LineageInfo";
export type LineageInfo = IdlTypes<Sop>[typeof lineageTypeName];

export type Result<T, E> = {
  Ok?: T;
  Err?: E;
};
export type TxPassType = { signature: string };

