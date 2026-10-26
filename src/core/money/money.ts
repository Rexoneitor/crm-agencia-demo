import { currencyExponent, currencyInfo } from "./currency";

/**
 * Money — importe entero en unidades mínimas + código de moneda.
 *
 * Reglas (ARQUITECTURA.md §8, RN-13):
 *  · `amount` es SIEMPRE un entero (bigint) en la unidad mínima de la moneda.
 *  · Toda suma/resta/comparación entre monedas distintas LANZA excepción.
 *  · Nunca se usa float para dinero.
 *  · La conversión entre monedas es explícita (`convert`) y congela la tasa.
 */
export interface Money {
  amount: bigint;
  currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(
      `Operación monetaria entre monedas distintas: ${a} y ${b}. ` +
        `Ningún cálculo suma importes de monedas diferentes sin agruparlos.`,
    );
    this.name = "CurrencyMismatchError";
  }
}

export function money(amount: bigint | number | string, currency: string): Money {
  currencyInfo(currency); // valida que exista
  let value: bigint;
  if (typeof amount === "bigint") value = amount;
  else if (typeof amount === "number") {
    if (!Number.isInteger(amount)) {
      throw new Error(`money() exige un entero en unidades mínimas, recibió ${amount}`);
    }
    value = BigInt(amount);
  } else {
    value = BigInt(amount);
  }
  return { amount: value, currency };
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amount: -a.amount, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amount === 0n;
}

export function isNegative(a: Money): boolean {
  return a.amount < 0n;
}

export function isPositive(a: Money): boolean {
  return a.amount > 0n;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function gte(a: Money, b: Money): boolean {
  return compare(a, b) >= 0;
}

export function lte(a: Money, b: Money): boolean {
  return compare(a, b) <= 0;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

/** Suma una lista de importes; todos deben compartir moneda. */
export function sum(items: Money[], currency: string): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/**
 * Agrupa importes por moneda. Útil para reportes de caja real, que NUNCA
 * consolidan monedas distintas en un solo número (RN-13).
 */
export function sumByCurrency(items: Money[]): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const m of items) {
    out[m.currency] = (out[m.currency] ?? 0n) + m.amount;
  }
  return out;
}

/**
 * Convierte un importe a otra moneda aplicando una tasa (string decimal).
 * El resultado se redondea al entero de unidad mínima de la moneda destino
 * (redondeo half-up). La tasa se expresa como "unidades mayores de `to` por
 * 1 unidad mayor de `from`".
 *
 * Se usa SOLO al registrar un asiento: la tasa resultante se congela.
 */
export function convert(from: Money, to: string, rate: string): Money {
  currencyInfo(to);
  if (from.currency === to) return { ...from };

  const [intPart, fracPartRaw = ""] = rate.trim().split(".");
  const fracPart = fracPartRaw.replace(/[^0-9]/g, "");
  const scale = BigInt(10) ** BigInt(fracPart.length || 0);
  const rateScaled =
    BigInt(intPart.replace(/[^0-9-]/g, "") || "0") * scale + BigInt(fracPart || "0");

  const fromExp = currencyExponent(from.currency);
  const toExp = currencyExponent(to);

  const numerator = from.amount * rateScaled * BigInt(10) ** BigInt(toExp);
  const denominator = scale * BigInt(10) ** BigInt(fromExp);

  return { amount: roundedDiv(numerator, denominator), currency: to };
}

/** División entera con redondeo half-up, manejando negativos. */
function roundedDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("División por cero en conversión monetaria");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

// ── Presentación ──────────────────────────────────────────────────────────

/** Convierte de unidad mínima a número decimal (solo para mostrar/parsear). */
export function toMajorNumber(m: Money): number {
  const exp = currencyExponent(m.currency);
  return Number(m.amount) / 10 ** exp;
}

/** Convierte un valor "mayor" (lo que teclea el usuario) a unidades mínimas. */
export function fromMajor(value: number | string, currency: string): Money {
  const exp = currencyExponent(currency);
  const str = String(value).trim().replace(/[.\s](?=\d{3}\b)/g, "").replace(/,/g, ".");
  const negative = str.startsWith("-");
  const clean = negative ? str.slice(1) : str;
  const [intPart = "0", fracPartRaw = ""] = clean.split(".");
  const fracPart = (fracPartRaw + "0".repeat(exp)).slice(0, exp);
  const minor =
    BigInt(intPart.replace(/[^0-9]/g, "") || "0") * BigInt(10) ** BigInt(exp) +
    BigInt(fracPart || "0");
  return { amount: negative ? -minor : minor, currency };
}

export interface FormatOptions {
  withSymbol?: boolean;
  withCode?: boolean;
}

/**
 * Formatea un importe con la convención colombiana (miles con ".",
 * decimales con ","). El agrupado se hace manualmente para no depender de
 * variaciones de ICU/CLDR entre versiones de Node.
 */
export function formatMoney(m: Money, opts: FormatOptions = {}): string {
  const info = currencyInfo(m.currency);
  const exp = info.exponent;
  const negative = m.amount < 0n;
  const abs = negative ? -m.amount : m.amount;
  const digits = abs.toString().padStart(exp + 1, "0");
  const intDigits = exp === 0 ? digits : digits.slice(0, -exp);
  const fracDigits = exp === 0 ? "" : digits.slice(-exp);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = (negative ? "-" : "") + grouped + (exp > 0 ? "," + fracDigits : "");

  const parts: string[] = [];
  if (opts.withSymbol ?? true) parts.push(info.symbol);
  parts.push(body);
  if (opts.withCode) parts.push(m.currency);
  return parts.join(" ").trim();
}

// ── Serialización (BigInt no es JSON-safe) ────────────────────────────────

export interface MoneyDTO {
  amount: string;
  currency: string;
}

export function toDTO(m: Money): MoneyDTO {
  return { amount: m.amount.toString(), currency: m.currency };
}

export function fromDTO(dto: MoneyDTO): Money {
  return money(dto.amount, dto.currency);
}
