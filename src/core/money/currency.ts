/**
 * Configuración de monedas. El exponente define cuántos decimales tiene la
 * moneda y, por tanto, cómo se convierte entre "unidad mostrada" y
 * "unidad mínima" (entera) que es como se almacena SIEMPRE.
 *
 *   COP → exponente 0  (la agencia opera sin centavos)
 *   USD → exponente 2
 *
 * Estos valores viven en `Setting` (grupo "currency") y se pueden ampliar;
 * este archivo es solo la semilla y el fallback.
 */
export interface CurrencyInfo {
  code: string;
  exponent: number;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  COP: { code: "COP", exponent: 0, symbol: "$", name: "Peso colombiano" },
  USD: { code: "USD", exponent: 2, symbol: "US$", name: "Dólar estadounidense" },
};

export const DEFAULT_CURRENCY = "COP";

export function currencyInfo(code: string): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) {
    throw new Error(`Moneda no configurada: ${code}`);
  }
  return info;
}

export function currencyExponent(code: string): number {
  return currencyInfo(code).exponent;
}

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);
