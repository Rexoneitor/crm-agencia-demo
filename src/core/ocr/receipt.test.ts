import { describe, expect, it } from "vitest";
import { parseCopAmount, parseReceiptText } from "./receipt";

const TODAY = "2026-10-18";

describe("parseCopAmount", () => {
  it("entiende miles con punto y centavos con coma", () => {
    expect(parseCopAmount("700.000")).toBe(700000);
    expect(parseCopAmount("700.000,00")).toBe(700000);
    expect(parseCopAmount("1,250,000.00")).toBe(1250000);
    expect(parseCopAmount("700000")).toBe(700000);
    expect(parseCopAmount("12.34.5")).toBeNull();
  });
});

describe("parseReceiptText", () => {
  it("Nequi: toma «¿Cuánto?» y no el saldo disponible", () => {
    const text = `Envío realizado
Para
JUAN PEREZ
¿Cuánto?
$ 700.000,00
Número Nequi
300 123 4567
Fecha
18 de octubre de 2026 a las 10:22 a. m.
Referencia
M1234567
Disponible
$ 1.200.000,00`;
    expect(parseReceiptText(text, TODAY)).toEqual({ amount: 700000, date: "2026-10-18", reference: "M1234567" });
  });

  it("Bancolombia: valor de la transferencia, ignora el costo y el número de cuenta", () => {
    const text = `¡Transferencia exitosa!
Comprobante No. 0000123456
18 Oct 2026 - 09:15 a.m.
Producto origen
Ahorros
*1234
Valor de la transferencia
$ 1.250.000,00
Costo de la transferencia
$ 0,00`;
    expect(parseReceiptText(text, TODAY)).toEqual({ amount: 1250000, date: "2026-10-18", reference: "0000123456" });
  });

  it("Daviplata: «Valor $700.000» y fecha con barras (día primero)", () => {
    const text = `Pasaste plata
Valor $700.000
Fecha 17/10/2026
Hora 3:45 pm
Aprobación 123456`;
    expect(parseReceiptText(text, TODAY)).toEqual({ amount: 700000, date: "2026-10-17", reference: "123456" });
  });

  it("«$» leído como «S» y saldo en la línea anterior", () => {
    const text = `Saldo disponible $ 5.000.000
Valor enviado S350.000`;
    expect(parseReceiptText(text, TODAY).amount).toBe(350000);
  });

  it("fecha sin año: usa el año actual, o el anterior si quedaría en el futuro", () => {
    expect(parseReceiptText("Fecha: 5 oct", TODAY).date).toBe("2026-10-05");
    expect(parseReceiptText("Fecha: 28 dic", "2026-01-05").date).toBe("2025-12-28");
  });

  it("si no hay nada creíble, no propone nada", () => {
    expect(parseReceiptText("hola mundo 2026", TODAY)).toEqual({ amount: undefined, date: undefined, reference: undefined });
    // Una fecha futura no se acepta
    expect(parseReceiptText("Fecha 30/12/2026", TODAY).date).toBeUndefined();
  });
});
