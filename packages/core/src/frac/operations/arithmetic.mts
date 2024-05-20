import type { MathOptions } from "../../options.mts";
import { abs as absFrac, compareTo, multiply, signum } from "./basic.mts";
import { divideDigits } from "../divide-digits.mts";
import { Frac, INF, N_INF, ZERO } from "../frac.mts";
import { createNthRootTable } from "../nth-root-utils.mts";
import { numberContext } from "../number-context.mts";
import { abs, isEven } from "../util.mts";

const ONE = Frac.numOf(1n);
const TEN = Frac.numOf(10n);

/** Returns a Frac whose value is `x ** n`. */
export function pow(x: Frac, n: Frac, options?: MathOptions): Frac | null {
  if (x.inf) {
    if (n.inf)
      return n.n < 0n
        ? ZERO // inf ** -inf
        : INF; // inf ** inf
    if (!n.n) return ONE; // Inf ** 0
    if (n.n < 0n) return ZERO; // Inf ** -num
    if (x.n < 0n) {
      // minus
      const hasFrac = n.d > 1n;
      if (hasFrac) return INF; // Inf ** x.x
      if (isEven(n.n)) return INF; // Inf ** (2*int)
    }
    return x; // inf ** num
  }
  if (n.inf) {
    const minus = n.n < 0n;
    const cmpO = compareTo(absFrac(x), ONE);
    return cmpO < 0
      ? minus
        ? INF // 0 ** -inf, or 0.x ** -inf
        : ZERO // 0 ** inf, or 0.x ** inf
      : !cmpO
        ? null // 1 ** inf, or -1 ** inf
        : minus
          ? ZERO // num ** -inf
          : INF; // num ** inf;
  }
  return _pow(x, n.n, n.d, options);
}

/** Returns a Frac whose value is `x * 10 ** n`. */
export function scaleByPowerOfTen(x: Frac, n: Frac): Frac | null {
  if (x.inf) return n.inf ? (n.n > 0 ? x : null) : x;
  if (n.inf) return n.n < 0n ? ZERO : !x.n ? null : x.n >= 0n ? INF : N_INF;
  return multiply(x, pow(TEN, n)!);
}

/** Returns a Frac whose value is `x ** (1/n)`. */
export function nthRoot(x: Frac, n: Frac, options?: MathOptions): Frac | null {
  if (x.inf)
    return n.inf ? ONE : !compareTo(n, ONE) ? x : signum(n) < 0 ? ZERO : INF;
  if (n.d === 1n && n.n === 2n) return sqrt(x, options);
  if (n.inf) return pow(x, ZERO);
  if (!compareTo(absFrac(n), ONE)) return pow(x, n);
  if (!n.n) return pow(x, INF);
  if (x.n < 0n)
    // Negative number
    return null;
  return _pow(x, n.d, n.n, options);
}

/** Returns a Frac whose value is `Math.sqrt(x)`. */
export function sqrt(x: Frac, options?: MathOptions): Frac | null {
  if (x.inf) return x.n < 0n ? null : INF;
  if (!x.n) return ZERO;
  if (x.n < 0n)
    // Negative number
    return null;
  // See https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Decimal_(base_10)
  const div = divideDigits(x.n, x.d);

  const numCtx = numberContext(
    1,
    div.e / 2n + (div.e >= 0n || isEven(div.e) ? 0n : -1n),
    options,
  );

  let remainder = 0n;
  let part = 0n;
  const bf: bigint[] = [];
  if (isEven(div.e)) bf.push(0n);

  for (const digit of div.digits(true)) {
    if (bf.push(digit) < 2) continue;
    remainder = remainder * 100n + bf.shift()! * 10n + bf.shift()!;
    part *= 10n;
    // Find digit
    if (
      // Short circuit: If 1 is not available, it will not loop.
      remainder >=
      part + 1n
    ) {
      for (let nn = 9n; nn > 0n; nn--) {
        const amount = (part + nn) * nn;
        if (remainder < amount) continue;
        // Set digit
        numCtx.set(nn);
        remainder -= amount;
        part += nn * 2n;
        break;
      }
    }
    if (numCtx.overflow()) break;
    numCtx.prepareNext();
  }
  numCtx.round(remainder > 0n);
  return Frac.numOf(...numCtx.toNum());
}

/** pow() by bigint fractions */
function _pow(
  base: Frac,
  num: bigint,
  denom: bigint,
  options?: MathOptions,
): Frac | null {
  if (!num) return ONE; // x ** 0
  const sign = num >= 0n === denom >= 0n ? 1 : -1;
  if (!base.n) return sign < 0 ? INF : ZERO; // 0 ** x
  const n = abs(num);
  const d = abs(denom);
  const i = n / d;
  const remN = n % d;
  let a: [bigint, bigint] = [base.n ** i, base.d ** i];
  if (remN) {
    // has fraction
    if (base.n < 0n) return null;
    const root = _nthRoot(base, d, options);
    a = [a[0] * root.n ** remN, a[1] * root.d ** remN];
  }
  if (sign >= 0) return new Frac(a[0], a[1]);
  return new Frac(a[1], a[0]);
}

/** nthRoot() by bigint */
function _nthRoot(base: Frac, n: bigint, options?: MathOptions): Frac {
  // See https://fermiumbay13.hatenablog.com/entry/2019/03/07/002938
  const iN = abs(n);

  const div = divideDigits(base.n, base.d);

  const numCtx = numberContext(
    1,
    div.e / iN + (div.e >= 0n || !(div.e % iN) ? 0n : -1n),
    options,
  );

  let remainder = 0n;
  const powOfTen = 10n ** iN;
  const table = createNthRootTable(iN);
  const bf: bigint[] = [];
  const initBfLen =
    div.e >= 0n ? iN - ((abs(div.e) % iN) + 1n) : abs(div.e + 1n) % iN;
  while (bf.length < initBfLen) bf.push(0n);

  for (const digit of div.digits(true)) {
    if (bf.push(digit) < iN) continue;
    remainder *= powOfTen;
    let bfPow = powOfTen;
    while (bf.length) remainder += bf.shift()! * (bfPow /= 10n);
    table.prepare();
    // Find digit
    for (let nn = 9n; nn > 0n; nn--) {
      const amount = table.amount(nn);
      if (remainder < amount) continue;
      // Set digit
      numCtx.set(nn);
      remainder -= amount;
      table.set(numCtx.getInt());
      break;
    }
    if (numCtx.overflow()) break;
    numCtx.prepareNext();
  }
  numCtx.round(remainder > 0n);
  const a = Frac.numOf(...numCtx.toNum());
  if (n >= 0n) return a;
  return new Frac(a.d, a.n);
}
