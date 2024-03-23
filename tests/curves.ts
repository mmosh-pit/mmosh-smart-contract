import { offset } from "@solana/buffer-layout";
import { AccountInfo, MintInfo, NATIVE_MINT } from "@solana/spl-token";
// @ts-ignore
import BN from "bn.js";
import { amountAsNum, asDecimal, supplyAsNum } from "./utils";
import {
  PublicKey,
  Keypair
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { CurveV0, ICurveConfig, TokenBondingV0 } from "./user";
import { toU128 } from "./utils";
import { BondingHierarchy } from "./bondingHierarchy";


/**
 * Traverse a bonding hierarchy, executing func and accumulating
 * the results until destination token
 *
 * @param param0
 * @returns
 */
function reduce<A>({
  hierarchy,
  func,
  initial,
  destination,
  wrappedSolMint,
}: {
  hierarchy?: BondingHierarchy;
  func: (acc: A, current: BondingHierarchy) => A;
  initial: A;
  destination: PublicKey;
  wrappedSolMint: PublicKey;
}): A {
  if (
    !hierarchy ||
    hierarchy.child?.tokenBonding.baseMint.equals(destination)
  ) {
    return initial;
  }

  if (destination?.equals(NATIVE_MINT)) {
    destination = wrappedSolMint;
  }

  let current: BondingHierarchy | undefined = hierarchy;
  let value = func(initial, current!);
  while (!current!.tokenBonding.baseMint.equals(destination)) {
    current = current!.parent;
    if (!current) {
      throw new Error(
        `Base mint ${destination.toBase58()} is not in the hierarchy for ${hierarchy.tokenBonding.publicKey.toBase58()}`
      );
    }
    value = func(value, current);
  }

  return value;
}

/**
 * Traverse a bonding hierarchy, executing func and accumulating
 * the results until destination token starting from parent going to children
 *
 * @param param0
 * @returns
 */
function reduceFromParent<A>({
  hierarchy,
  func,
  initial,
  destination,
  wrappedSolMint,
}: {
  hierarchy?: BondingHierarchy;
  func: (acc: A, current: BondingHierarchy) => A;
  initial: A;
  destination: PublicKey;
  wrappedSolMint: PublicKey;
}): A {
  if (!hierarchy) {
    return initial;
  }

  if (destination?.equals(NATIVE_MINT)) {
    destination = wrappedSolMint;
  }

  let current: BondingHierarchy | undefined = hierarchy;
  while (!current!.tokenBonding.baseMint.equals(destination)) {
    current = current!.parent;
    if (!current) {
      throw new Error(
        `Base mint ${destination.toBase58()} is not in the hierarchy for ${hierarchy.tokenBonding.publicKey.toBase58()}`
      );
    }
  }
  destination = hierarchy.tokenBonding.targetMint;

  let value = func(initial, current!);
  while (!current!.tokenBonding.targetMint.equals(destination)) {
    current = current!.child;
    value = func(value, current!);
  }

  return value;
}

export interface ISellArgs {
  tokenBonding: PublicKey;
  /** The payer to run this transaction, defaults to provider.wallet */
  payer?: PublicKey;
  source?: PublicKey /** `targetMint` source account to sell from. **Default:** ATA of sourceAuthority */;
  destination?: PublicKey /** `baseMint` destination for tokens from the reserve. **Default:** ATA of wallet */;
  sourceAuthority?: PublicKey /** **Default:** wallet */;
  targetAmount: BN | number /** The amount of `targetMint` tokens to sell. */;
  expectedOutputAmount?:
    | BN
    | number /** Expected output amount of `baseMint` before slippage */;
  slippage: number /* Decimal number. max price will be (1 + slippage) * price_for_desired_target_amount */;
}

/**
 * Unified curve interface wrapping the raw CurveV0
 */
export interface ICurve extends CurveV0 {
  publicKey: PublicKey;
}

export interface IBuyArgs {
  tokenBonding: PublicKey;
  /** The payer to run this transaction, defaults to provider.wallet */
  payer?: PublicKey;
  /** The source account to purchase with. **Default:** ata of `sourceAuthority` */
  source?: PublicKey;
  /** The source destination to purchase to. **Default:** ata of `sourceAuthority` */
  destination?: PublicKey;
  /** The wallet funding the purchase. **Default:** Provider wallet */
  sourceAuthority?: PublicKey;
  /** Must provide either base amount or desired target amount */
  desiredTargetAmount?: BN | number;
  baseAmount?: BN | number;
  expectedOutputAmount?:
    | BN
    | number /** Expected output amount of `targetMint` before slippage */;
  /** When using desiredTargetAmount, the expected base amount used before slippage */
  expectedBaseAmount?: BN | number;
  /** Decimal number. max price will be (1 + slippage) * price_for_desired_target_amount */
  slippage: number;
}


export interface IPrimitiveCurve {
  toRawPrimitiveConfig(): any;
}

/**
 * Unified token bonding interface wrapping the raw TokenBondingV0
 */
export interface ITokenBonding extends TokenBondingV0 {
  publicKey: PublicKey;
}


export interface ICreateTokenBondingArgs {
  /** The payer to create this token bonding, defaults to provider.wallet */
  payer?: PublicKey;
  /** The shape of the bonding curve. Must be created using {@link SplTokenBonding.initializeCurve} */
  curve: PublicKey;
  /** The base mint that the `targetMint` will be priced in terms of. `baseMint` tokens will fill the bonding curve reserves */
  baseMint: PublicKey;
  /**
   * The mint this bonding curve will create on `buy`. If not provided, specify `targetMintDecimals` and it will create one for you
   *
   * It can be useful to pass the mint in if you're creating a bonding curve for an existing mint. Keep in mind,
   * the authority on this mint will need to be set to the token bonding pda
   */
  targetMint?: PublicKey; // If not provided, will create one with `targetMintDecimals`
  /**
   * **Default:** New generated keypair
   *
   * Pass in the keypair to use for the mint. Useful if you want a vanity keypair
   */
  targetMintKeypair?: anchor.web3.Keypair;
  /** If `targetMint` is not defined, will create a mint with this number of decimals */
  targetMintDecimals?: number;
  /**
   * Account to store royalties in terms of `baseMint` tokens when the {@link SplTokenBonding.buy} command is issued
   *
   * If not provided, will create an Associated Token Account with `buyBaseRoyaltiesOwner`

   * Note that this can be explicitly set to null if there are no royalties
  */
  buyBaseRoyalties?: PublicKey | null;
  /** Only required when `buyBaseRoyalties` is undefined. The owner of the `buyBaseRoyalties` account. **Default:** `provider.wallet` */
  buyBaseRoyaltiesOwner?: PublicKey;
  /**
   * Account to store royalties in terms of `targetMint` tokens when the {@link SplTokenBonding.buy} command is issued
   *
   * If not provided, will create an Associated Token Account with `buyTargetRoyaltiesOwner`
   *
   * Note that this can be explicitly set to null if there are no royalties
   */
  buyTargetRoyalties?: PublicKey | null;
  /** Only required when `buyTargetRoyalties` is undefined. The owner of the `buyTargetRoyalties` account. **Default:** `provider.wallet` */
  buyTargetRoyaltiesOwner?: PublicKey;
  /**
   * Account to store royalties in terms of `baseMint` tokens when the {@link SplTokenBonding.sell} command is issued
   *
   * If not provided, will create an Associated Token Account with `sellBaseRoyaltiesOwner`
   *
   * Note that this can be explicitly set to null if there are no royalties
   */
  sellBaseRoyalties?: PublicKey | null;
  /** Only required when `sellBaseRoyalties` is undefined. The owner of the `sellBaseRoyalties` account. **Default:** `provider.wallet` */
  sellBaseRoyaltiesOwner?: PublicKey;
  /**
   * Account to store royalties in terms of `targetMint` tokens when the {@link SplTokenBonding.sell} command is issued
   *
   * If not provided, will create an Associated Token Account with `sellTargetRoyaltiesOwner`
   *
   *  Note that this can be explicitly set to null if there are no royalties
   */
  sellTargetRoyalties?: PublicKey | null;
  /** Only required when `sellTargetRoyalties` is undefined. The owner of the `sellTargetRoyalties` account. **Default:** `provider.wallet` */
  sellTargetRoyaltiesOwner?: PublicKey;
  /**
   * General authority to change things like royalty percentages and freeze the curve. This is the least dangerous authority
   * **Default:** Wallet public key. Pass null to explicitly not set this authority.
   */
  generalAuthority?: PublicKey | null;
  /**
   * Authority to swap or change the reserve account. **This authority is dangerous. Use with care**
   *
   * From a trust perspective, this authority should almost always be held by another program that handles migrating bonding
   * curves, instead of by an individual.
   *
   * **Default:** null. You most likely don't need this permission, if it is being set you should do so explicitly.
   */
  reserveAuthority?: PublicKey | null;

  /**
   * Authority to swap or change the underlying curve. **This authority is dangerous. Use with care**
   *
   * From a trust perspective, this authority should almost always be held by another program that handles migrating bonding
   * curves, instead of by an individual.
   *
   * **Default:** null. You most likely don't need this permission, if it is being set you should do so explicitly.
   */
  curveAuthority?: PublicKey | null;
  /** Number from 0 to 100. Default: 0 */
  buyBaseRoyaltyPercentage?: number;
  /** Number from 0 to 100. Default: 0 */
  buyTargetRoyaltyPercentage?: number;
  /** Number from 0 to 100. Default: 0 */
  sellBaseRoyaltyPercentage?: number;
  /** Number from 0 to 100. Default: 0 */
  sellTargetRoyaltyPercentage?: number;
  /** Maximum `targetMint` tokens this bonding curve will mint before disabling {@link SplTokenBonding.buy}. **Default:** infinite */
  mintCap?: BN;
  /** Maximum `targetMint` tokens that can be purchased in a single call to {@link SplTokenBonding.buy}. Useful for limiting volume. **Default:** 0 */
  purchaseCap?: BN;
  /** The date this bonding curve will go live. Before this date, {@link SplTokenBonding.buy} and {@link SplTokenBonding.sell} are disabled. **Default:** 1 second ago */
  goLiveDate?: Date;
  /** The date this bonding curve will shut down. After this date, {@link SplTokenBonding.buy} and {@link SplTokenBonding.sell} are disabled. **Default:** null */
  freezeBuyDate?: Date;
  /** Should this bonding curve be frozen initially? It can be unfrozen using {@link SplTokenBonding.updateTokenBonding}. **Default:** false */
  buyFrozen?: boolean;
  /** Should this bonding curve have sell functionality? **Default:** false */
  sellFrozen?: boolean;
  /**
   *
   * Should the bonding curve's price change based on funds entering or leaving the reserves account outside of buy/sell
   *
   * Setting this to `false` means that sending tokens into the reserves improves value for all holders,
   * withdrawing money from reserves (via reserve authority) detracts value from holders.
   *
   */
  ignoreExternalReserveChanges?: boolean;
  /**
   * Should the bonding curve's price change based on external burning of target tokens?
   *
   * Setting this to `false` enables what is called a "sponsored burn". With a sponsored burn,
   * burning tokens increases the value for all holders
   */
  ignoreExternalSupplyChanges?: boolean;
  /**
   * Multiple bonding curves can exist for a given target mint.
   * 0 is reserved for the one where the program owns mint authority and can mint new tokens. All other curves may exist as
   * markeplace curves
   */
  index?: number;

  advanced?: {
    /**
     * Initial padding is an advanced feature, incorrect use could lead to insufficient reserves to cover sells
     *
     * Start the curve off at a given reserve and supply synthetically. This means price can start nonzero. The current use case
     * for this is LBCs. Note that a curve cannot be adaptive. ignoreExternalReserveChanges and ignoreExternalSupplyChanges
     * must be true
     * */
    initialSupplyPad: BN | number;
    /**
     * Initial padding is an advanced feature, incorrect use could lead to insufficient reserves to cover sells
     * */
    initialReservesPad: BN | number;
  };
}

export interface ICreateTokenBondingOutput {
  tokenBonding: PublicKey;
  baseMint: PublicKey;
  targetMint: PublicKey;
  buyBaseRoyalties: PublicKey;
  buyTargetRoyalties: PublicKey;
  sellBaseRoyalties: PublicKey;
  sellTargetRoyalties: PublicKey;
  baseStorage: PublicKey;
}

export interface IInitializeCurveArgs {
  /** The configuration for the shape of curve */
  config: ICurveConfig;
  /** The payer to create this curve, defaults to provider.wallet */
  payer?: PublicKey;
  /** The keypair to use for this curve */
  curveKeypair?: Keypair;
}

export interface ITransitionFee {
  percentage: number;
  interval: number;
}

export type ExponentialCurveV0 = {
  c: BN;
  b: BN;
  pow: number;
  frac: number;
};

export type TimeDecayExponentialCurveV0 = {
  c: BN;
  k0: BN;
  k1: BN;
  d: BN;
  interval: number;
};

export function fromCurve(
  curve: any,
  baseAmount: number,
  targetSupply: number,
  goLiveUnixTime: number
): IPricingCurve {
  switch (Object.keys(curve.definition)[0]) {
    case "timeV0":
      return new TimeCurve({
        curve,
        baseAmount,
        targetSupply,
        goLiveUnixTime,
      });
  }

  throw new Error("Curve not found");
}

export interface IPricingCurve {
  current(
    unixTime?: number,
    baseRoyaltiesPercent?: number,
    targetRoyaltiesPercent?: number
  ): number;
  locked(): number;
  sellTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime?: number
  ): number;
  buyTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime?: number
  ): number;
  buyWithBaseAmount(
    baseAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime?: number
  ): number;
}

type TimeCurveArgs = {
  curve: any;
  baseAmount: number;
  targetSupply: number;
  goLiveUnixTime: number;
};

interface ITimeCurveItem {
  subCurve: IPricingCurve;
  offset: number;
  buyTransitionFees: ITransitionFee | null;
  sellTransitionFees: ITransitionFee | null;
}

function transitionFeesToPercent(
  offset: number,
  fees: ITransitionFee | null
): number {
  if (!fees) {
    return 0;
  }

  if (offset > fees.interval) {
    return 0;
  }

  return (
    asDecimal(fees.percentage) * ((fees.interval - offset) / fees.interval)
  );
}

function now(): number {
  return new Date().valueOf() / 1000;
}

export class TimeCurve implements IPricingCurve {
  curve: any;
  baseAmount: number;
  targetSupply: number;
  goLiveUnixTime: number;

  constructor({
    curve,
    baseAmount,
    targetSupply,
    goLiveUnixTime,
  }: TimeCurveArgs) {
    this.curve = curve;
    this.baseAmount = baseAmount;
    this.targetSupply = targetSupply;
    this.goLiveUnixTime = goLiveUnixTime;
  }

  currentCurve(unixTime: number = now()): ITimeCurveItem {
    let subCurve;
    if (unixTime < this.goLiveUnixTime) {
      subCurve = this.curve.definition.timeV0.curves[0];
    } else {
      subCurve = [...this.curve.definition.timeV0.curves]
        .reverse()
        .find(
          (c: any) => unixTime >= this.goLiveUnixTime + c.offset.toNumber()
        );
    }

    return {
      subCurve: subCurve.curve.exponentialCurveV0
        ? new ExponentialCurve(
            subCurve.curve.exponentialCurveV0 as ExponentialCurveV0,
            this.baseAmount,
            this.targetSupply,
            this.goLiveUnixTime + subCurve.offset.toNumber()
          )
        : new TimeDecayExponentialCurve(
            subCurve.curve
              .timeDecayExponentialCurveV0 as TimeDecayExponentialCurveV0,
            this.baseAmount,
            this.targetSupply,
            this.goLiveUnixTime + subCurve.offset.toNumber()
          ),
      offset: subCurve.offset.toNumber(),
      buyTransitionFees: subCurve.buyTransitionFees,
      sellTransitionFees: subCurve.sellTransitionFees,
    };
  }

  current(
    unixTime: number = now(),
    baseRoyaltiesPercent: number = 0,
    targetRoyaltiesPercent: number = 0
  ): number {
    const { subCurve, buyTransitionFees, offset } = this.currentCurve(unixTime);

    return (
      subCurve.current(unixTime, baseRoyaltiesPercent, targetRoyaltiesPercent) *
      (1 - transitionFeesToPercent(unixTime - offset, buyTransitionFees))
    );
  }

  locked(): number {
    return this.currentCurve().subCurve.locked();
  }
  sellTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    const { subCurve, sellTransitionFees, offset } =
      this.currentCurve(unixTime);
    const price = subCurve.sellTargetAmount(
      targetAmountNum,
      baseRoyaltiesPercent,
      targetRoyaltiesPercent,
      unixTime
    );

    return (
      price *
      (1 -
        transitionFeesToPercent(
          unixTime - this.goLiveUnixTime - offset,
          sellTransitionFees
        ))
    );
  }
  buyTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    const { subCurve, buyTransitionFees, offset } = this.currentCurve(unixTime);
    const price = subCurve.buyTargetAmount(
      targetAmountNum,
      baseRoyaltiesPercent,
      targetRoyaltiesPercent,
      unixTime
    );

    return (
      price *
      (1 +
        transitionFeesToPercent(
          unixTime - this.goLiveUnixTime - offset,
          buyTransitionFees
        ))
    );
  }
  buyWithBaseAmount(
    baseAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    const { subCurve, buyTransitionFees, offset } = this.currentCurve(unixTime);
    const baseAmountPostFees =
      baseAmountNum *
      (1 -
        transitionFeesToPercent(
          unixTime - this.goLiveUnixTime - offset,
          buyTransitionFees
        ));

    return subCurve.buyWithBaseAmount(
      baseAmountPostFees,
      baseRoyaltiesPercent,
      targetRoyaltiesPercent
    );
  }
}

export abstract class BaseExponentialCurve implements IPricingCurve {
  c: number;
  baseAmount: number;
  targetSupply: number;
  goLiveUnixTime: number;

  abstract k(timeElapsed: number): number;
  abstract get b(): number;

  constructor(
    c: number,
    baseAmount: number,
    targetSupply: number,
    goLiveUnixTime: number
  ) {
    this.c = c;
    this.baseAmount = baseAmount;
    this.targetSupply = targetSupply;
    this.goLiveUnixTime = goLiveUnixTime;
  }

  current(
    unixTime?: number,
    baseRoyaltiesPercent: number = 0,
    targetRoyaltiesPercent: number = 0
  ): number {
    return this.changeInTargetAmount(1, baseRoyaltiesPercent, targetRoyaltiesPercent, unixTime);
  }

  locked(): number {
    return this.baseAmount;
  }

  changeInTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    const R = this.baseAmount;
    const S = this.targetSupply;
    const k = this.k(unixTime - this.goLiveUnixTime);

    // Calculate with the actual target amount they will need to get the target amount after royalties
    const dS = targetAmountNum * (1 / (1 - asDecimal(targetRoyaltiesPercent)));



    if (R == 0 || S == 0) {
      // b dS + (c dS^(1 + k))/(1 + k)
      console.log("this.c ",this.c)
      console.log("dS ",dS)
      console.log("k ",k)

      console.log("base price ",(this.b * dS + (this.c * Math.pow(dS, 1 + k)) / (1 + k)) *
      (1 / (1 - asDecimal(baseRoyaltiesPercent))))

      return (
        (this.b * dS + (this.c * Math.pow(dS, 1 + k)) / (1 + k)) *
        (1 / (1 - asDecimal(baseRoyaltiesPercent)))
      );
    } else {
      if (this.b == 0 && this.c != 0) {
        /*
          (R / S^(1 + k)) ((S + dS)(S + dS)^k - S^(1 + k))
        */
        return (
          (R / Math.pow(S, 1 + k)) *
          ((S + dS) * Math.pow(S + dS, k) - Math.pow(S, 1 + k)) *
          (1 / (1 - asDecimal(baseRoyaltiesPercent)))
        );
      } else if (this.c == 0) {
        // R dS / S
        return ((R * dS) / S) * (1 / (1 - asDecimal(baseRoyaltiesPercent)));
      } else {
        throw new Error(
          "Cannot convert base amount to target amount when both b and k are defined on an exponential curve. The math is too hard"
        );
      }
    }
  }

  sellTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    return (
      -this.changeInTargetAmount(
        -targetAmountNum * (1 - asDecimal(targetRoyaltiesPercent)),
        0,
        0,
        unixTime
      ) *
      (1 - asDecimal(baseRoyaltiesPercent))
    );
  }

  buyTargetAmount(
    targetAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    return this.changeInTargetAmount(
      targetAmountNum,
      baseRoyaltiesPercent,
      targetRoyaltiesPercent,
      unixTime
    );
  }

  buyWithBaseAmount(
    baseAmountNum: number,
    baseRoyaltiesPercent: number,
    targetRoyaltiesPercent: number,
    unixTime: number = now()
  ): number {
    const k = this.k(unixTime - this.goLiveUnixTime);

    const dR = baseAmountNum * (1 - asDecimal(baseRoyaltiesPercent));
    if (this.baseAmount == 0 || this.targetSupply == 0) {
      if (this.b == 0) {
        /*
         * -S + (((1 + k) dR)/c)^(1/(1 + k))
         */
        return (
          (Math.pow(((1 + k) * dR) / this.c, 1 / (1 + k)) - this.targetSupply) *
          (1 - asDecimal(targetRoyaltiesPercent))
        );
      } else if (this.c == 0) {
        if (this.baseAmount == 0) {
          return (dR / this.b) * (1 - asDecimal(targetRoyaltiesPercent));
        } else {
          return (
            ((this.targetSupply * dR) / this.baseAmount) *
            (1 - asDecimal(targetRoyaltiesPercent))
          );
        }
      }

      throw new Error(
        "Cannot convert base amount to target amount when both b and k are defined on an exponential curve. The math is too hard"
      );
    } else {
      const R = this.baseAmount;
      const S = this.targetSupply;
      if (this.b == 0) {
        /*
         * dS = -S + ((S^(1 + k) (R + dR))/R)^(1/(1 + k))
         */
        return (
          (-S + Math.pow((Math.pow(S, 1 + k) * (R + dR)) / R, 1 / (1 + k))) *
          (1 - asDecimal(targetRoyaltiesPercent))
        );
      } else if (this.c == 0) {
        // dS = S dR / R
        return ((S * dR) / R) * (1 - asDecimal(targetRoyaltiesPercent));
      } else {
        throw new Error(
          "Cannot convert base amount to target amount when both b and k are defined on an exponential curve. The math is too hard"
        );
      }
    }
  }
}

export class ExponentialCurve extends BaseExponentialCurve {
  b: number;
  _k: number;
  pow: number;
  frac: number;

  k(_: number = now()) {
    return this._k;
  }

  constructor(
    curve: ExponentialCurveV0,
    baseAmount: number,
    targetSupply: number,
    goLiveUnixTime: number = now()
  ) {
    super(
      +curve.c.toString() / 1000000000000,
      baseAmount,
      targetSupply,
      goLiveUnixTime
    );
    this.b = +curve.b.toString() / 1000000000000;
    this._k = curve.pow / curve.frac;
    this.pow = curve.pow;
    this.frac = curve.frac;

    this.baseAmount = baseAmount;
    this.targetSupply = targetSupply;
  }
}

export class TimeDecayExponentialCurve extends BaseExponentialCurve {
  b: number = 0;
  k0: number;
  k1: number;
  d: number;
  interval: number;

  k(timeElapsed: number): number {
    const ret =
      this.k0 -
      (this.k0 - this.k1) *
        Math.min(Math.pow(timeElapsed / this.interval, this.d), 1);
    return ret;
  }

  constructor(
    curve: TimeDecayExponentialCurveV0,
    baseAmount: number,
    targetSupply: number,
    goLiveUnixTime: number
  ) {
    super(
      +curve.c.toString() / 1000000000000,
      baseAmount,
      targetSupply,
      goLiveUnixTime
    );
    this.k1 = +curve.k1.toString() / 1000000000000;
    this.k0 = +curve.k0.toString() / 1000000000000;
    this.d = +curve.d.toString() / 1000000000000;
    this.interval = curve.interval;

    this.baseAmount = baseAmount;
    this.targetSupply = targetSupply;
  }
}


export class ExponentialCurveConfig implements ICurveConfig, IPrimitiveCurve {
  c: BN;
  b: BN;
  pow: number;
  frac: number;

  constructor({
    c = 1,
    b = 0,
    pow = 1,
    frac = 1,
  }: {
    c?: number | BN;
    b?: number | BN;
    pow?: number;
    frac?: number;
  }) {
    this.c = toU128(c);
    this.b = toU128(b);
    this.pow = pow;
    this.frac = frac;

    if (this.b.gt(new BN(0)) && this.c.gt(new BN(0))) {
      throw new Error(
        "Unsupported: Cannot define an exponential function with `b`, the math to go from base to target amount becomes too hard."
      );
    }
  }

  toRawPrimitiveConfig(): any {
    return {
      exponentialCurveV0: {
        // @ts-ignore
        c: this.c,
        // @ts-ignore
        b: this.b,
        // @ts-ignore
        pow: this.pow,
        // @ts-ignore
        frac: this.frac,
      },
    };
  }

  toRawConfig(): CurveV0 {
    return {
      definition: {
        timeV0: {
          curves: [
            {
              // @ts-ignore
              offset: new BN(0),
              // @ts-ignore
              curve: this.toRawPrimitiveConfig(),
              buyTransitionFees: null,
              sellTransitionFees: null
            },
          ],
        },
      },
    };
  }
}

export interface IBondingPricing {

  get hierarchy(): BondingHierarchy;

  current(baseMint: PublicKey, unixTime?: number): number;

  locked(baseMint?: PublicKey): number;

  swap(
    baseAmount: number,
    baseMint: PublicKey,
    targetMint: PublicKey,
    ignoreFrozen: boolean,
    unixTime?: number,
  ): number;

  isBuying(
    lowMint: PublicKey,
    targetMint: PublicKey,
  ): boolean;

  swapTargetAmount(
    targetAmount: number,
    baseMint: PublicKey,
    targetMint: PublicKey,
    /** Ignore frozen curves, just compute the value. */
    ignoreFreeze: boolean,
    unixTime?: number,
  ): number;

  sellTargetAmount(
    targetAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number;

  buyTargetAmount(
    targetAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number;

  buyWithBaseAmount(
    baseAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number ;
}

export class BondingPricing implements IBondingPricing {
  hierarchy: BondingHierarchy;

  constructor(args: { hierarchy: BondingHierarchy }) {
    this.hierarchy = args.hierarchy;
  }

  current(
    baseMint?: PublicKey,
    unixTime?: number
  ): number {
    return reduce({
      hierarchy: this.hierarchy,
      func: (acc: number, current: BondingHierarchy) => {
        return (
          acc *
          current.pricingCurve.current(
            unixTime || now(),
            current.tokenBonding.buyBaseRoyaltyPercentage,
            current.tokenBonding.buyTargetRoyaltyPercentage
          )
        );
      },
      initial: 1,
      destination: baseMint || this.hierarchy.tokenBonding.baseMint,
      wrappedSolMint: this.hierarchy.wrappedSolMint,
    });
  }

  locked(baseMint?: PublicKey): number {
    return reduce({
      hierarchy: this.hierarchy.parent,
      func: (acc: number, current: BondingHierarchy) => {
        return (
          acc *
          current.pricingCurve.current(
            now(),
            current.tokenBonding.buyBaseRoyaltyPercentage,
            current.tokenBonding.buyTargetRoyaltyPercentage
          )
        );
      },
      initial: this.hierarchy.pricingCurve.locked(),
      destination: baseMint || this.hierarchy.tokenBonding.baseMint,
      wrappedSolMint: this.hierarchy.wrappedSolMint,
    });
  }

  swap(
    baseAmount: number,
    baseMint: PublicKey,
    targetMint: PublicKey,
    ignoreFrozen: boolean = false,
    unixTime?: number,
  ): number {
    const lowMint = this.hierarchy.lowest(baseMint, targetMint);
    const highMint = this.hierarchy.highest(baseMint, targetMint);
    const isBuying = this.isBuying(
      lowMint,
      targetMint,
    );

    const path = this.hierarchy.path(lowMint, highMint, ignoreFrozen);

    if (path.length == 0) {
      throw new Error(`No path from ${baseMint} to ${targetMint}`);
    }

    if (isBuying) {
      return path.reverse().reduce((amount, { pricingCurve, tokenBonding }) => {
        return pricingCurve.buyWithBaseAmount(
          amount,
          tokenBonding.buyBaseRoyaltyPercentage,
          tokenBonding.buyTargetRoyaltyPercentage,
          unixTime
        );
      }, baseAmount);
    } else {
      return path.reduce((amount, { pricingCurve, tokenBonding }) => {
        return pricingCurve.sellTargetAmount(
          amount,
          tokenBonding.sellBaseRoyaltyPercentage,
          tokenBonding.sellTargetRoyaltyPercentage,
          unixTime
        );
      }, baseAmount);
    }
  }

  isBuying(
    lowMint: PublicKey,
    targetMint: PublicKey,
  ) {
    return lowMint.equals(targetMint);
  }

  swapTargetAmount(
    targetAmount: number,
    baseMint: PublicKey,
    targetMint: PublicKey,
    /** Ignore frozen curves, just compute the value. */
    ignoreFreeze: boolean = false,
    unixTime?: number,
  ): number {
    const lowMint = this.hierarchy.lowest(baseMint, targetMint);
    const highMint = this.hierarchy.highest(baseMint, targetMint);
    const isBuying = this.isBuying(
      lowMint,
      targetMint,
    );

    const path = this.hierarchy.path(lowMint, highMint, ignoreFreeze);

    if (path.length == 0) {
      throw new Error(`No path from ${baseMint} to ${targetMint}`);
    }

    return isBuying
      ? path.reverse().reduce((amount, { pricingCurve, tokenBonding }) => {
          return pricingCurve.buyWithBaseAmount(
            -amount,
            tokenBonding.sellBaseRoyaltyPercentage,
            tokenBonding.sellTargetRoyaltyPercentage,
            unixTime
          );
        }, targetAmount)
      : path.reverse().reduce((amount, { pricingCurve, tokenBonding }) => {
          return pricingCurve.buyTargetAmount(
            amount,
            tokenBonding.buyBaseRoyaltyPercentage,
            tokenBonding.buyTargetRoyaltyPercentage,
            unixTime
          );
        }, targetAmount);
  }

  sellTargetAmount(
    targetAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number {
    return reduce({
      hierarchy: this.hierarchy,
      func: (acc: number, current: BondingHierarchy) => {
        return current.pricingCurve.sellTargetAmount(
          acc,
          current.tokenBonding.sellBaseRoyaltyPercentage,
          current.tokenBonding.sellTargetRoyaltyPercentage,
          unixTime
        );
      },
      initial: targetAmountNum,
      destination: baseMint || this.hierarchy.tokenBonding.baseMint,
      wrappedSolMint: this.hierarchy.wrappedSolMint,
    });
  }

  buyTargetAmount(
    targetAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number {
    return reduce({
      hierarchy: this.hierarchy,
      func: (acc: number, current: BondingHierarchy) => {
        return current.pricingCurve.buyTargetAmount(
          acc,
          current.tokenBonding.buyBaseRoyaltyPercentage,
          current.tokenBonding.buyTargetRoyaltyPercentage,
          unixTime
        );
      },
      initial: targetAmountNum,
      destination: baseMint || this.hierarchy.tokenBonding.baseMint,
      wrappedSolMint: this.hierarchy.wrappedSolMint,
    });
  }

  buyWithBaseAmount(
    baseAmountNum: number,
    baseMint?: PublicKey,
    unixTime?: number
  ): number {
    return reduceFromParent({
      hierarchy: this.hierarchy,
      func: (acc: number, current: BondingHierarchy) => {
        return current.pricingCurve.buyWithBaseAmount(
          acc,
          current.tokenBonding.buyBaseRoyaltyPercentage,
          current.tokenBonding.buyTargetRoyaltyPercentage,
          unixTime
        );
      },
      initial: baseAmountNum,
      destination: baseMint || this.hierarchy.tokenBonding.baseMint,
      wrappedSolMint: this.hierarchy.wrappedSolMint,
    });
  }
}
