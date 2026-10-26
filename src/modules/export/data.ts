import "server-only";
import { prisma } from "@/core/db/prisma";
import { toMajorNumber, money } from "@/core/money/money";
import { label, REFUND_OPEN_STATES } from "@/core/domain/enums";

/**
 * Lectura (sólo lectura) de lo que va en los Excel, ya convertido a filas
 * planas con importes en unidades normales. Los totales de cada contrato se
 * calculan aquí con la misma regla que las fórmulas del Excel (RN-03), para
 * que el valor que se ve al abrir coincida con el que Excel recalcula.
 */

export const lbl = (v: string | null | undefined): string | null => (v ? label(v) : null);
export const major = (a: bigint | null | undefined, currency: string): number | null =>
  a == null ? null : toMajorNumber(money(a, currency));

/** Etiquetas exactas que usan las fórmulas (deben coincidir con las de las hojas). */
export const K = {
  pago: label("pago_recibido"),
  anticipo: label("aplicacion_de_anticipo"),
  comision: label("comision_retenida"),
  descuento: label("descuento"),
  castigo: label("castigo"),
  reembolso: label("reembolso"),
  cancelado: label("cancelado"),
  activo: label("activo"),
  resCancelada: label("cancelada"),
  resPendiente: label("pendiente_confirmacion"),
  resCambio: label("requiere_cambio_fecha"),
  resConfirmada: label("confirmada"),
  sinPagos: label("sin_pagos"),
  parcial: label("parcial"),
  pagado: label("pagado"),
  liquidado: label("liquidado"),
} as const;

export const REFUND_OPEN_LABELS = REFUND_OPEN_STATES.map((s) => label(s));

export interface ContractRow {
  id: string;
  number: string;
  client: string;
  phone: string | null;
  doc: string | null;
  seller: string | null;
  issuer: string;
  destination: string;
  hotel: string | null;
  group: string | null;
  modality: string;
  saleDate: string | null;
  checkIn: string | null;
  checkOut: string | null;
  vigFrom: string | null;
  vigTo: string | null;
  pax: number | null;
  resState: string | null;
  lifeState: string;
  travelled: "Sí" | "No";
  currency: string;
  price: number;
  received: number;
  retained: number;
  discounts: number;
  refunded: number;
  balance: number;
  payState: string;
  payments: number;
  receiptsOk: "Sí" | "No" | "Sin pagos";
  refundState: string | null;
  cancelReason: string | null;
  notes: string | null;
  archivedAt: Date | null;
}

export interface PaymentRow {
  date: string;
  contract: string;
  client: string;
  seller: string | null;
  kind: string;
  amount: number;
  currency: string;
  receivedAmount: number;
  receivedCurrency: string;
  method: string | null;
  reference: string | null;
  hasReceipt: "Sí" | "No";
  receiptFiles: string | null;
  createdBy: string | null;
  notes: string | null;
  /** Para «Pagos fuera de cuentas». */
  why?: string;
}

export interface RefundRow {
  number: string;
  requestedAt: string;
  client: string;
  phone: string | null;
  email: string | null;
  contract: string | null;
  group: string | null;
  channel: string | null;
  reason: string | null;
  dueDate: string | null;
  currency: string;
  requested: number | null;
  agreed: number | null;
  paid: number;
  pending: number;
  state: string;
  resolvedAt: Date | null;
  emailThread: string | null;
  detail: string | null;
  archived: boolean;
}

export interface RefundPaymentRow {
  date: string;
  refund: string;
  client: string;
  contract: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  hasReceipt: "Sí" | "No";
  notes: string | null;
  voided: boolean;
  voidReason: string | null;
}

export interface Core {
  contracts: ContractRow[];
  archived: ContractRow[];
  payments: PaymentRow[];
  outside: PaymentRow[];
  refunds: RefundRow[];
  archivedRefunds: RefundRow[];
  refundPayments: RefundPaymentRow[];
  currencies: string[];
  issuers: string[];
}

const join = (...parts: (string | null | undefined)[]) => {
  const s = parts.map((p) => p?.trim()).filter(Boolean).join(" · ");
  return s || null;
};

/** Contratos, libro de pagos y reembolsos: lo que alimenta las fórmulas del libro. */
export async function loadCore(): Promise<Core> {
  const [rows, refunds] = await Promise.all([
    prisma.contract.findMany({
      include: {
        client: true,
        seller: true,
        destination: true,
        hotel: true,
        reservation: true,
        passengers: true,
        group: true,
        ledger: {
          include: { receipts: { include: { document: { select: { originalName: true } } } }, createdBy: { select: { name: true } } },
          orderBy: [{ valueDate: "asc" }, { createdAt: "asc" }],
        },
        refunds: { select: { state: true, requestedAt: true, archivedAt: true } },
      },
      orderBy: { number: "asc" },
    }),
    prisma.refund.findMany({
      include: {
        contract: { select: { number: true } },
        group: { select: { name: true } },
        payments: { orderBy: { paidDate: "asc" } },
      },
      orderBy: { number: "asc" },
    }),
  ]);

  const contracts: ContractRow[] = [];
  const archived: ContractRow[] = [];
  const payments: PaymentRow[] = [];
  const outside: PaymentRow[] = [];

  for (const c of rows) {
    const cur = c.currency;
    const live = c.ledger.filter((e) => !e.voided);
    const sum = (...kinds: string[]) => live.filter((e) => kinds.includes(e.kind)).reduce((t, e) => t + e.appliedAmount, 0n);
    const received = sum("pago_recibido", "aplicacion_de_anticipo");
    const retained = sum("comision_retenida");
    const discounts = sum("descuento", "castigo");
    const refunded = sum("reembolso");
    const balance = c.priceAmount - received - retained - discounts + refunded;
    const settled = c.priceAmount - balance;
    const payState =
      settled <= 0n ? K.sinPagos : balance > 0n ? K.parcial : received >= c.priceAmount ? K.pagado : K.liquidado;
    const pays = live.filter((e) => e.kind === "pago_recibido");
    const p = c.passengers;
    const r = c.reservation;
    const lastRefund = [...c.refunds]
      .filter((x) => !x.archivedAt)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    const row: ContractRow = {
      id: c.id,
      number: c.number,
      client: c.client.fullName,
      phone: c.client.phone,
      doc: c.client.documentId,
      seller: c.seller?.name ?? null,
      issuer: c.issuer,
      destination: c.destination.name,
      hotel: c.hotel?.name ?? null,
      group: c.group?.name ?? null,
      modality: label(c.modality),
      saleDate: c.saleDate,
      checkIn: r?.checkIn ?? c.travelDate,
      checkOut: r?.checkOut ?? c.returnDate,
      vigFrom: c.vigenciaStart,
      vigTo: c.vigenciaEnd,
      pax: p ? p.adults + p.children + p.infants : null,
      resState: lbl(r?.state),
      lifeState: label(c.lifecycleState),
      travelled: c.lifecycleState === "finalizado" || r?.state === "finalizada" ? "Sí" : "No",
      currency: cur,
      price: major(c.priceAmount, cur)!,
      received: major(received, cur)!,
      retained: major(retained, cur)!,
      discounts: major(discounts, cur)!,
      refunded: major(refunded, cur)!,
      balance: major(balance, cur)!,
      payState,
      payments: live.length,
      receiptsOk: pays.length === 0 ? "Sin pagos" : pays.every((e) => e.receipts.length > 0) ? "Sí" : "No",
      refundState: lbl(lastRefund?.state),
      cancelReason: c.cancellationReason
        ? c.cancellationCode
          ? `${c.cancellationReason} (${label(c.cancellationCode)})`
          : c.cancellationReason
        : null,
      notes: c.notes?.trim() || null,
      archivedAt: c.archivedAt,
    };
    (c.archivedAt ? archived : contracts).push(row);

    for (const e of c.ledger) {
      const pr: PaymentRow = {
        date: e.valueDate,
        contract: c.number,
        client: c.client.fullName,
        seller: c.seller?.name ?? null,
        kind: label(e.kind),
        amount: major(e.appliedAmount, e.appliedCurrency)!,
        currency: e.appliedCurrency,
        receivedAmount: major(e.receivedAmount, e.receivedCurrency)!,
        receivedCurrency: e.receivedCurrency,
        method: lbl(e.method),
        reference: e.reference,
        hasReceipt: e.receipts.length ? "Sí" : "No",
        receiptFiles: e.receipts.map((x) => x.document.originalName).join(" | ") || null,
        createdBy: e.createdBy?.name ?? null,
        notes: e.reason?.trim() || null,
      };
      if (e.voided) outside.push({ ...pr, why: "Anulado", notes: join(e.voidReason, e.reason) });
      else if (c.archivedAt) outside.push({ ...pr, why: "Contrato archivado" });
      else payments.push(pr);
    }
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  outside.sort((a, b) => a.date.localeCompare(b.date));

  const refundRows: RefundRow[] = [];
  const archivedRefunds: RefundRow[] = [];
  const refundPayments: RefundPaymentRow[] = [];
  for (const r of refunds) {
    const livePays = r.payments.filter((p) => !p.voided);
    const paid = livePays.reduce((s, p) => s + p.amount, 0n);
    const target = r.agreedAmount ?? r.requestedAmount;
    const open = (REFUND_OPEN_STATES as string[]).includes(r.state);
    const pending = open && target != null && target > paid ? target - paid : 0n;
    const row: RefundRow = {
      number: r.number,
      requestedAt: r.requestedAt,
      client: r.clientName,
      phone: r.contactPhone,
      email: r.contactEmail,
      contract: r.contract?.number ?? null,
      group: r.group?.name ?? null,
      channel: lbl(r.channel),
      reason: lbl(r.reasonCode),
      dueDate: r.dueDate,
      currency: r.currency,
      requested: major(r.requestedAmount, r.currency),
      agreed: major(r.agreedAmount, r.currency),
      paid: major(paid, r.currency)!,
      pending: major(pending, r.currency)!,
      state: label(r.state),
      resolvedAt: r.resolvedAt,
      emailThread: r.emailThread,
      detail: join(r.reason, r.stateNote, r.notes),
      archived: r.archivedAt != null,
    };
    (r.archivedAt ? archivedRefunds : refundRows).push(row);
    for (const p of r.payments) {
      refundPayments.push({
        date: p.paidDate,
        refund: r.number,
        client: r.clientName,
        contract: r.contract?.number ?? null,
        amount: major(p.amount, r.currency)!,
        currency: r.currency,
        method: lbl(p.method),
        reference: p.reference,
        hasReceipt: p.documentId ? "Sí" : "No",
        notes: p.notes,
        voided: p.voided,
        voidReason: p.voidReason,
      });
    }
  }

  const currencies = [...new Set([...contracts.map((c) => c.currency), ...refundRows.map((r) => r.currency)])].sort(
    (a, b) => (a === "COP" ? -1 : b === "COP" ? 1 : a.localeCompare(b)),
  );
  if (!currencies.length) currencies.push("COP");
  const issuers = [...new Set(["DEMO", ...rows.map((c) => c.issuer)])];

  return {
    contracts,
    archived,
    payments,
    outside,
    refunds: refundRows,
    archivedRefunds,
    refundPayments,
    currencies,
    issuers,
  };
}

/** Totales que muestra la hoja Resumen, calculados en JS (valor visible antes de recalcular). */
export function summaryNumbers(core: Core, today: string, currency: string) {
  const all = core.currencies.length > 1;
  const cs = core.contracts.filter((c) => !all || c.currency === currency);
  const notCancelled = cs.filter((c) => c.lifeState !== K.cancelado);
  const monthStart = today.slice(0, 8) + "01";
  const owing = notCancelled.filter((c) => c.balance > 0);
  const total = (xs: ContractRow[], f: (c: ContractRow) => number) => xs.reduce((s, c) => s + f(c), 0);
  return {
    sales: total(notCancelled, (c) => c.price),
    received: total(cs, (c) => c.received),
    retained: total(cs, (c) => c.retained),
    discounts: total(cs, (c) => c.discounts),
    refunded: total(cs, (c) => c.refunded),
    owed: total(owing, (c) => c.balance),
    owingCount: owing.length,
    receivedThisMonth: core.payments
      .filter((p) => p.kind === K.pago && p.date >= monthStart && (!all || p.currency === currency))
      .reduce((s, p) => s + p.amount, 0),
    refundsPending: core.refunds
      .filter((r) => !all || r.currency === currency)
      .reduce((s, r) => s + r.pending, 0),
  };
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Cifras de operación (no dependen de la moneda). */
export function operationNumbers(core: Core, today: string) {
  const cs = core.contracts;
  const in15 = addDaysIso(today, 15);
  const count = (f: (c: ContractRow) => boolean) => cs.filter(f).length;
  return {
    contracts: cs.length,
    active: count((c) => c.lifeState === K.activo),
    cancelled: count((c) => c.lifeState === K.cancelado),
    travelled: count((c) => c.travelled === "Sí"),
    toConfirm: count((c) => c.resState === K.resPendiente && c.lifeState !== K.cancelado),
    dateChange: count((c) => c.resState === K.resCambio && c.lifeState !== K.cancelado),
    next15: count((c) => !!c.checkIn && c.checkIn >= today && c.checkIn <= in15 && c.resState !== K.resCancelada),
    pastNotMarked: count(
      (c) =>
        !!c.checkOut &&
        c.checkOut < today &&
        c.travelled === "No" &&
        c.lifeState === K.activo &&
        c.resState !== K.resCancelada,
    ),
    noSeller: count((c) => !c.seller && c.lifeState !== K.cancelado),
    paymentsNoReceipt: core.payments.filter((p) => p.kind === K.pago && p.hasReceipt === "No").length,
    refundsOpen: core.refunds.filter((r) => REFUND_OPEN_LABELS.includes(r.state)).length,
    refundsOverdue: core.refunds.filter((r) => r.pending > 0 && !!r.dueDate && r.dueDate < today).length,
  };
}
