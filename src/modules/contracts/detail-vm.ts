import "server-only";
import { formatMoney, money, toMajorNumber } from "@/core/money/money";
import { label } from "@/core/domain/enums";
import type { ContractDetail } from "./service";

/** Vista serializable (sin BigInt) para la pantalla 360°. */
export function toContractDetailVM(detail: ContractDetail) {
  const { contract: c, derived: d, documents, notes, history } = detail;
  const cur = c.currency;
  const fmt = (amount: bigint, currency = cur) =>
    formatMoney(money(amount, currency), { withCode: true });

  return {
    id: c.id,
    number: c.number,
    modality: c.modality,
    modalityLabel: label(c.modality),
    tripType: c.tripType,
    tripTypeLabel: label(c.tripType),
    lifecycleState: c.lifecycleState,
    exceptionResolution: c.exceptionResolution,
    archived: c.archivedAt != null,
    currency: cur,
    version: c.version,
    notes: c.notes,
    issuer: c.issuer,

    client: { id: c.clientId, name: c.client.fullName, phone: c.client.phone, email: c.client.email },
    transferredFrom: c.transferredFromClient?.fullName ?? null,
    group: c.group ? { id: c.group.id, name: c.group.name } : null,
    seller: c.seller
      ? { id: c.seller.id, name: c.seller.name, retainsCommission: c.seller.retainsCommission }
      : null,
    destination: {
      id: c.destinationId,
      name: c.destination.name,
      color: c.destination.color,
      scope: c.destination.scope,
    },
    hotel: c.hotel?.name ?? null,
    hotelId: c.hotelId,

    saleDate: c.saleDate,
    travelDate: c.travelDate,
    returnDate: c.returnDate,
    vigenciaStart: c.vigenciaStart,
    vigenciaEnd: c.vigenciaEnd,
    days: c.days,
    nights: c.nights,

    price: fmt(c.priceAmount),
    priceMajor: toMajorNumber(money(c.priceAmount, cur)),
    settled: fmt(d.settled.amount),
    balance: fmt(d.balance.amount),
    balanceRaw: d.balance.amount.toString(),
    paidRatio: d.paidRatio,
    paymentState: d.paymentState,
    liquidationLeadDays: c.liquidationLeadDays,
    liquidationDueDate: d.liquidationDueDate,
    daysToTravel: d.daysToTravel,
    daysToLiquidationDue: d.daysToLiquidationDue,
    isOverdueForLiquidation: d.isOverdueForLiquidation,
    vigenciaExpiring: d.vigenciaExpiring,
    vigenciaExpired: d.vigenciaExpired,
    needsExceptionResolution: d.needsExceptionResolution,
    cashReceivedByCurrency: Object.entries(d.cashReceivedByCurrency).map(([currency, amt]) => ({
      currency,
      formatted: formatMoney(money(BigInt(amt), currency), { withCode: true }),
    })),

    cancellationReason: c.cancellationReason,
    cancellationCode: c.cancellationCode,

    commission: {
      kind: c.commissionKind,
      value: c.commissionValue,
      // Valor editable: % tal cual; fijo → unidades mayores.
      valueDisplay:
        c.commissionKind === "fixed"
          ? String(toMajorNumber(money(BigInt(c.commissionValue || "0"), c.commissionCurrency)))
          : c.commissionValue,
      currency: c.commissionCurrency,
      expected: d.expectedCommission ? fmt(d.expectedCommission.amount, d.expectedCommission.currency) : null,
      accrual: c.commissionAccrual,
      settledAt: c.commission?.settledAt ? c.commission.settledAt.toISOString() : null,
    },

    passengers: c.passengers
      ? {
          adults: c.passengers.adults,
          children: c.passengers.children,
          infants: c.passengers.infants,
          packs: c.passengers.packs,
          total: c.passengers.adults + c.passengers.children + c.passengers.infants,
        }
      : { adults: 0, children: 0, infants: 0, packs: 0, total: 0 },

    reservation: c.reservation
      ? {
          state: c.reservation.state,
          checkIn: c.reservation.checkIn,
          checkOut: c.reservation.checkOut,
          confirmedAt: c.reservation.confirmedAt ? c.reservation.confirmedAt.toISOString() : null,
        }
      : null,

    ledger: c.ledger.map((e) => ({
      id: e.id,
      kind: e.kind,
      kindLabel: label(e.kind),
      valueDate: e.valueDate,
      received: formatMoney(money(e.receivedAmount, e.receivedCurrency), { withCode: true }),
      receivedMajor: toMajorNumber(money(e.receivedAmount, e.receivedCurrency)),
      receivedCurrency: e.receivedCurrency,
      applied: formatMoney(money(e.appliedAmount, e.appliedCurrency), { withCode: true }),
      crossCurrency: e.receivedCurrency !== e.appliedCurrency,
      exchangeRate: e.exchangeRate,
      reference: e.reference,
      method: e.method,
      reason: e.reason,
      voided: e.voided,
      voidReason: e.voidReason,
      by: e.createdBy?.name ?? null,
      installmentId: e.installmentId,
      groupPayment: e.groupPaymentId != null,
      receipts: e.receipts.map((r) => ({ id: r.document.id, name: r.document.originalName })),
    })),

    installments: d.installments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate,
      expected: formatMoney(i.expected, { withCode: true }),
      paid: formatMoney(i.paid, { withCode: true }),
      outstanding: formatMoney(i.outstanding, { withCode: true }),
      state: i.state,
    })),

    documents: documents.map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      kindLabel: label(doc.kind),
      name: doc.originalName,
      mimeType: doc.mimeType,
      sizeKb: Math.round(doc.sizeBytes / 1024),
      createdAt: doc.createdAt.toISOString(),
    })),

    notesList: notes.map((n) => ({
      id: n.id,
      content: n.content,
      pinned: n.pinned,
      priority: n.priority,
      author: n.author,
      createdAt: n.createdAt.toISOString(),
    })),

    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      summary: h.summary,
      user: h.user?.name ?? "sistema",
      at: h.at.toISOString(),
    })),
  };
}

export type ContractDetailVM = ReturnType<typeof toContractDetailVM>;
