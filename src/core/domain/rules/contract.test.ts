import { describe, expect, it } from "vitest";
import { money } from "@/core/money/money";
import { fixedClock } from "@/core/time/clock";
import { DEFAULT_RULES_CONFIG } from "./config";
import {
  computeBalance,
  computePaymentState,
  deriveContract,
  deriveInstallments,
  expectedCommission,
  liquidationDueDate,
} from "./contract";
import type { ContractView, LedgerEntryView } from "./types";

const clock = fixedClock("2026-09-06T12:00:00-05:00");

function ledger(kind: LedgerEntryView["kind"], amount: bigint, extra: Partial<LedgerEntryView> = {}): LedgerEntryView {
  return {
    id: Math.random().toString(36),
    kind,
    valueDate: "2026-09-01",
    applied: money(amount, "COP"),
    received: money(amount, "COP"),
    voided: false,
    ...extra,
  };
}

function baseContract(over: Partial<ContractView> = {}): ContractView {
  return {
    id: "c1",
    number: "CTR-2026-000001",
    modality: "fecha_cerrada",
    tripType: "nacional",
    lifecycleState: "activo",
    exceptionResolution: "ninguna",
    price: money(2_000_000n, "COP"),
    liquidationLeadDays: 30,
    saleDate: "2026-08-01",
    travelDate: "2026-10-10",
    vigenciaStart: null,
    vigenciaEnd: null,
    commissionKind: "percentage",
    commissionValue: "10",
    commissionCurrency: "COP",
    reservation: { state: "pendiente_confirmacion", checkIn: "2026-10-10", checkOut: "2026-10-13" },
    ledger: [],
    installments: [],
    ...over,
  };
}

describe("RN-03 — saldo del contrato", () => {
  it("sin pagos: saldo = precio", () => {
    const c = baseContract();
    expect(computeBalance(c).amount).toBe(2_000_000n);
    expect(computePaymentState(c)).toBe("sin_pagos");
  });

  it("pago parcial recalcula saldo", () => {
    const c = baseContract({ ledger: [ledger("pago_recibido", 500_000n)] });
    expect(computeBalance(c).amount).toBe(1_500_000n);
    expect(computePaymentState(c)).toBe("parcial");
  });

  it("pagos que completan el precio → pagado", () => {
    const c = baseContract({
      ledger: [ledger("pago_recibido", 1_400_000n), ledger("pago_recibido", 600_000n)],
    });
    expect(computeBalance(c).amount).toBe(0n);
    expect(computePaymentState(c)).toBe("pagado");
  });

  it("comisión retenida cierra el contrato como liquidado (no pagado)", () => {
    const c = baseContract({
      ledger: [
        ledger("pago_recibido", 1_800_000n),
        ledger("comision_retenida", 200_000n, { reason: "Comisión del vendedor" }),
      ],
    });
    expect(computeBalance(c).amount).toBe(0n);
    expect(computePaymentState(c)).toBe("liquidado");
  });

  it("los asientos anulados no suman", () => {
    const c = baseContract({
      ledger: [
        ledger("pago_recibido", 500_000n, { voided: true }),
        ledger("pago_recibido", 700_000n),
      ],
    });
    expect(computeBalance(c).amount).toBe(1_300_000n);
  });

  it("el reembolso devuelve saldo", () => {
    const c = baseContract({
      ledger: [
        ledger("pago_recibido", 2_000_000n),
        ledger("reembolso", 500_000n, { reason: "Cancelación" }),
      ],
    });
    expect(computeBalance(c).amount).toBe(500_000n);
  });
});

describe("RN-01 / RN-02 — fecha límite de liquidación", () => {
  it("nacional: viaje − 30 días (valor congelado en el contrato)", () => {
    expect(liquidationDueDate(baseContract({ travelDate: "2026-10-10", liquidationLeadDays: 30 }))).toBe(
      "2026-09-10",
    );
  });

  it("internacional: viaje − 90 días", () => {
    expect(
      liquidationDueDate(
        baseContract({ tripType: "internacional", travelDate: "2026-12-20", liquidationLeadDays: 90 }),
      ),
    ).toBe("2026-09-21");
  });

  it("un cambio de política global NO afecta contratos ya vendidos", () => {
    // El contrato guarda 30 aunque la config global suba a 45.
    const c = baseContract({ liquidationLeadDays: 30, travelDate: "2026-10-10" });
    const cfg = { ...DEFAULT_RULES_CONFIG, liquidationLeadDays: { nacional: 45, internacional: 90 } };
    const d = deriveContract(c, cfg, clock);
    expect(d.liquidationDueDate).toBe("2026-09-10");
  });
});

describe("RN-07 — incumplimiento de plazo", () => {
  it("fecha límite alcanzada con saldo → fuera de plazo + requiere resolución", () => {
    const c = baseContract({
      travelDate: "2026-09-20",
      liquidationLeadDays: 30, // límite 2026-08-21, ya pasó
      ledger: [ledger("pago_recibido", 500_000n)],
    });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.isOverdueForLiquidation).toBe(true);
    expect(d.needsExceptionResolution).toBe(true);
  });

  it("con excepción autorizada ya no está fuera de plazo", () => {
    const c = baseContract({
      travelDate: "2026-09-20",
      liquidationLeadDays: 30,
      exceptionResolution: "excepcion_autorizada",
      ledger: [ledger("pago_recibido", 500_000n)],
    });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.isOverdueForLiquidation).toBe(false);
  });

  it("sin saldo no hay incumplimiento aunque pase la fecha", () => {
    const c = baseContract({
      travelDate: "2026-09-20",
      liquidationLeadDays: 30,
      ledger: [ledger("pago_recibido", 2_000_000n)],
    });
    expect(deriveContract(c, DEFAULT_RULES_CONFIG, clock).isOverdueForLiquidation).toBe(false);
  });
});

describe("RN-06 — vigencia de fecha abierta", () => {
  it("ventana que termina dentro del umbral → por expirar", () => {
    const c = baseContract({
      modality: "fecha_abierta",
      travelDate: null,
      reservation: null,
      vigenciaStart: "2026-01-01",
      vigenciaEnd: "2026-10-01", // 25 días desde hoy
    });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.vigenciaExpiring).toBe(true);
    expect(d.vigenciaExpired).toBe(false);
  });

  it("ventana ya vencida sin viaje → expirada + requiere revisión", () => {
    const c = baseContract({
      modality: "fecha_abierta",
      travelDate: null,
      reservation: null,
      vigenciaStart: "2025-01-01",
      vigenciaEnd: "2026-08-01",
    });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.vigenciaExpired).toBe(true);
    expect(d.needsExceptionResolution).toBe(true);
  });
});

describe("RN-09 — comisión esperada", () => {
  it("porcentaje sobre el bruto", () => {
    const c = baseContract({ commissionKind: "percentage", commissionValue: "10" });
    expect(expectedCommission(c, DEFAULT_RULES_CONFIG)?.amount).toBe(200_000n);
  });

  it("valor fijo", () => {
    const c = baseContract({ commissionKind: "fixed", commissionValue: "150000", commissionCurrency: "COP" });
    expect(expectedCommission(c, DEFAULT_RULES_CONFIG)?.amount).toBe(150_000n);
  });

  it("no genera asiento: el saldo no depende de la comisión", () => {
    const c = baseContract({ ledger: [] });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.balance.amount).toBe(2_000_000n);
    expect(d.expectedCommission?.amount).toBe(200_000n);
  });
});

describe("Cuotas — estado derivado e imputación", () => {
  it("imputa pagos a su cuota y calcula estado", () => {
    const c = baseContract({
      installments: [
        { id: "i1", sequence: 1, dueDate: "2026-08-15", expected: money(500_000n, "COP"), manualState: "vigente" },
        { id: "i2", sequence: 2, dueDate: "2026-12-15", expected: money(1_500_000n, "COP"), manualState: "vigente" },
      ],
      ledger: [ledger("pago_recibido", 500_000n, { installmentId: "i1", valueDate: "2026-08-14" })],
    });
    const inst = deriveInstallments(c, clock);
    expect(inst[0].state).toBe("pagada");
    expect(inst[1].state).toBe("pendiente");
    expect(inst[1].outstanding.amount).toBe(1_500_000n);
  });

  it("cuota vencida sin pago", () => {
    const c = baseContract({
      installments: [
        { id: "i1", sequence: 1, dueDate: "2026-08-15", expected: money(500_000n, "COP"), manualState: "vigente" },
      ],
    });
    expect(deriveInstallments(c, clock)[0].state).toBe("vencida");
  });
});

describe("RN-14 — aplicación de anticipo no computa como caja del período", () => {
  it("liquida saldo pero no aparece en caja recibida", () => {
    const c = baseContract({
      ledger: [ledger("aplicacion_de_anticipo", 800_000n, { received: money(800_000n, "COP") })],
    });
    const d = deriveContract(c, DEFAULT_RULES_CONFIG, clock);
    expect(d.balance.amount).toBe(1_200_000n);
    expect(d.cashReceivedByCurrency).toEqual({});
  });
});
