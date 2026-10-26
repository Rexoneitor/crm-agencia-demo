import {
  add,
  compare,
  gte,
  isPositive,
  money,
  subtract,
  sum,
  sumByCurrency,
  zero,
  type Money,
} from "@/core/money/money";
import {
  addPlainDays,
  daysBetween,
  isAfter,
  isSameOrAfter,
  type Clock,
  type PlainDate,
} from "@/core/time/clock";
import type { LedgerKind, PaymentState } from "@/core/domain/enums";
import type { RulesConfig } from "./config";
import type {
  ContractDerived,
  ContractView,
  InstallmentDerived,
  LedgerEntryView,
} from "./types";

/**
 * RN-03 — Signo de cada tipo de asiento sobre el saldo liquidado.
 *  +1 liquida saldo · −1 lo devuelve (reembolso) · anulados no cuentan.
 */
const LIQUIDATING_SIGN: Record<LedgerKind, 1 | -1 | 0> = {
  pago_recibido: 1,
  aplicacion_de_anticipo: 1,
  comision_retenida: 1,
  descuento: 1,
  castigo: 1,
  reembolso: -1,
};

/** Asientos que representan dinero/valor efectivamente aportado por el cliente. */
const VALUE_PAYMENT_KINDS: LedgerKind[] = ["pago_recibido", "aplicacion_de_anticipo"];

function activeEntries(ledger: LedgerEntryView[]): LedgerEntryView[] {
  return ledger.filter((e) => !e.voided);
}

/** RN-03 — saldo del contrato, calculado sólo con importes APLICADOS. */
export function computeSettled(contract: ContractView): Money {
  const currency = contract.price.currency;
  const parts = activeEntries(contract.ledger).map((e) => {
    const sign = LIQUIDATING_SIGN[e.kind];
    return money(e.applied.amount * BigInt(sign), currency);
  });
  return sum(parts, currency);
}

export function computeBalance(contract: ContractView): Money {
  return subtract(contract.price, computeSettled(contract));
}

/** Caja REAL recibida, agrupada por moneda de recepción (RN-13, RN-14). */
export function computeCashReceived(contract: ContractView): Record<string, string> {
  const received = activeEntries(contract.ledger)
    // La aplicación de anticipo NO es caja del período: el efectivo entró
    // cuando el vendedor pagó el cupo.
    .filter((e) => e.kind === "pago_recibido")
    .map((e) => e.received);
  const grouped = sumByCurrency(received);
  return Object.fromEntries(
    Object.entries(grouped).map(([c, v]) => [c, v.toString()]),
  );
}

export function computePaymentState(contract: ContractView): PaymentState {
  const price = contract.price;
  const settled = computeSettled(contract);
  const currency = price.currency;

  if (settled.amount <= 0n) return "sin_pagos";
  if (compare(settled, price) < 0) return "parcial";

  const valuePaid = sum(
    activeEntries(contract.ledger)
      .filter((e) => VALUE_PAYMENT_KINDS.includes(e.kind))
      .map((e) => e.applied),
    currency,
  );
  return gte(valuePaid, price) ? "pagado" : "liquidado";
}

/** RN-01 / RN-02 — fecha límite de liquidación total. */
export function liquidationDueDate(contract: ContractView): PlainDate | null {
  if (!contract.travelDate) return null;
  return addPlainDays(contract.travelDate, -contract.liquidationLeadDays);
}

/** RN-09 — comisión esperada (valor derivado, NO genera asiento). */
export function expectedCommission(contract: ContractView, config: RulesConfig): Money | null {
  const currency = contract.price.currency;
  if (contract.commissionKind === "fixed") {
    const raw = BigInt(contract.commissionValue || "0");
    return money(raw, contract.commissionCurrency || currency);
  }
  // porcentaje sobre la base configurada
  let base = contract.price;
  if (config.commission.base === "neto") {
    const discounts = sum(
      activeEntries(contract.ledger)
        .filter((e) => e.kind === "descuento")
        .map((e) => e.applied),
      currency,
    );
    base = subtract(contract.price, discounts);
  }
  const pctMilli = BigInt(Math.round(Number(contract.commissionValue || "0") * 1000));
  const amount = (base.amount * pctMilli) / 100000n;
  return money(amount, currency);
}

// ── Cuotas ───────────────────────────────────────────────────────────────

export function deriveInstallments(
  contract: ContractView,
  clock: Clock,
): InstallmentDerived[] {
  const today = clock.today();
  const currency = contract.price.currency;
  const soonWindow = 7;

  return [...contract.installments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((inst) => {
      const paid = sum(
        activeEntries(contract.ledger)
          .filter((e) => e.installmentId === inst.id)
          .map((e) => e.applied),
        currency,
      );
      const outstanding = subtract(inst.expected, paid);

      let state: InstallmentDerived["state"];
      if (inst.manualState === "cancelada") state = "cancelada";
      else if (compare(paid, inst.expected) >= 0) state = "pagada";
      else if (isAfter(today, inst.dueDate)) state = "vencida";
      else if (isPositive(paid)) state = "parcial";
      else if (daysBetween(today, inst.dueDate) <= soonWindow) state = "proxima";
      else state = "pendiente";

      return {
        id: inst.id,
        sequence: inst.sequence,
        dueDate: inst.dueDate,
        expected: inst.expected,
        paid,
        outstanding,
        state,
      };
    });
}

// ── Derivación agregada ──────────────────────────────────────────────────

export function deriveContract(
  contract: ContractView,
  config: RulesConfig,
  clock: Clock,
): ContractDerived {
  const today = clock.today();
  const currency = contract.price.currency;
  const settled = computeSettled(contract);
  const balance = subtract(contract.price, settled);
  const dueDate = liquidationDueDate(contract);

  const paidRatio =
    contract.price.amount > 0n
      ? Math.min(1, Math.max(0, Number(settled.amount) / Number(contract.price.amount)))
      : settled.amount > 0n
        ? 1
        : 0;

  const daysToTravel = contract.travelDate ? daysBetween(today, contract.travelDate) : null;
  const daysToLiquidationDue = dueDate ? daysBetween(today, dueDate) : null;

  const isActive = contract.lifecycleState === "activo";
  const hasBalance = balance.amount > 0n;

  const resolvedException = ["fecha_extendida", "excepcion_autorizada", "incumplido"].includes(
    contract.exceptionResolution,
  );

  const isOverdueForLiquidation =
    !!dueDate &&
    isSameOrAfter(today, dueDate) &&
    hasBalance &&
    isActive &&
    !resolvedException;

  const isOpen = contract.modality === "fecha_abierta" && !contract.travelDate;
  let vigenciaExpiring = false;
  let vigenciaExpired = false;
  if (isOpen && contract.vigenciaEnd && isActive) {
    const d = daysBetween(today, contract.vigenciaEnd);
    vigenciaExpired = d < 0;
    vigenciaExpiring = d >= 0 && d <= config.alerts.vigenciaThresholdDays;
  }

  return {
    contractId: contract.id,
    currency,
    settled,
    balance,
    paidRatio,
    paymentState: computePaymentState(contract),
    cashReceivedByCurrency: computeCashReceived(contract),
    liquidationDueDate: dueDate,
    daysToTravel,
    daysToLiquidationDue,
    isOverdueForLiquidation,
    vigenciaExpiring,
    vigenciaExpired,
    needsExceptionResolution:
      (isOverdueForLiquidation || vigenciaExpired) &&
      contract.exceptionResolution === "ninguna",
    expectedCommission: expectedCommission(contract, config),
    installments: deriveInstallments(contract, clock),
  };
}

/** Semilla de días de anticipación para una venta nueva (RN-02). */
export function leadDaysForNewSale(tripType: "nacional" | "internacional", config: RulesConfig): number {
  return config.liquidationLeadDays[tripType];
}

// re-export para conveniencia de consumidores
export { zero as zeroMoney, add as addMoney };
