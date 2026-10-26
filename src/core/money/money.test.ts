import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  convert,
  CurrencyMismatchError,
  formatMoney,
  fromMajor,
  money,
  subtract,
  sum,
  sumByCurrency,
  toMajorNumber,
} from "./money";

describe("Money — aritmética entera", () => {
  it("suma y resta en la misma moneda", () => {
    expect(add(money(1000n, "COP"), money(500n, "COP")).amount).toBe(1500n);
    expect(subtract(money(1000n, "COP"), money(300n, "COP")).amount).toBe(700n);
  });

  it("rechaza operar entre monedas distintas", () => {
    expect(() => add(money(1n, "COP"), money(1n, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => compare(money(1n, "COP"), money(1n, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("agrupa por moneda sin consolidar (RN-13)", () => {
    const grouped = sumByCurrency([
      money(1000n, "COP"),
      money(2000n, "COP"),
      money(50n, "USD"),
    ]);
    expect(grouped).toEqual({ COP: 3000n, USD: 50n });
  });

  it("sum() exige moneda explícita y parte de cero", () => {
    expect(sum([], "COP").amount).toBe(0n);
    expect(sum([money(10n, "COP"), money(5n, "COP")], "COP").amount).toBe(15n);
  });
});

describe("Money — unidades mínimas y presentación", () => {
  it("COP se maneja sin decimales", () => {
    const m = fromMajor("1999000", "COP");
    expect(m.amount).toBe(1999000n);
    expect(toMajorNumber(m)).toBe(1999000);
    expect(formatMoney(m)).toBe("$ 1.999.000");
  });

  it("USD se maneja con dos decimales", () => {
    const m = fromMajor("1234.5", "USD");
    expect(m.amount).toBe(123450n);
    expect(toMajorNumber(m)).toBe(1234.5);
  });
});

describe("Money — conversión con tasa congelada", () => {
  it("convierte USD→COP redondeando a la unidad mínima", () => {
    // 100.00 USD * 4000 = 400.000 COP
    const cop = convert(money(10000n, "USD"), "COP", "4000");
    expect(cop).toEqual({ amount: 400000n, currency: "COP" });
  });

  it("convierte COP→USD (half-up)", () => {
    // 10.000 COP / 4000 = 2.50 USD -> 250 minor
    const usd = convert(money(10000n, "COP"), "USD", "0.00025");
    expect(usd).toEqual({ amount: 250n, currency: "USD" });
  });

  it("misma moneda: identidad", () => {
    expect(convert(money(123n, "COP"), "COP", "1").amount).toBe(123n);
  });
});
