import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import type { Tx } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { convert, fromMajor, money, formatMoney } from "@/core/money/money";
import { systemClock } from "@/core/time/clock";
import { deriveContract, rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { uploadDocument } from "@/modules/documents/service";
import { storage } from "@/core/adapters/storage";
import {
  adjustmentSchema,
  editEntrySchema,
  installmentPlanSchema,
  markLiquidatedSchema,
  registerPaymentSchema,
  settleCommissionSchema,
  voidEntrySchema,
} from "./schema";

async function loadDerived(tx: Tx, contractId: string) {
  const row = await tx.contract.findUnique({
    where: { id: contractId },
    include: contractViewInclude,
  });
  if (!row) throw new NotFoundError("contrato");
  const config = rulesConfigFromSettings(await getSettingsMap());
  const clock = systemClock(env.APP_TIMEZONE);
  return { row, derived: deriveContract(toContractView(row), config, clock) };
}

/**
 * Registro de pago (§4, RN-11, RN-13).
 *  · El asiento lleva DOS importes: recibido (moneda real) y aplicado
 *    (moneda del contrato). Si difieren, se congela la tasa.
 *  · Si imputa a una cuota, se vincula.
 *  · Nunca se edita: las correcciones se hacen por anulación + nuevo registro.
 */
export async function registerPayment(
  user: SessionUser,
  input: unknown,
  receipt?: File | null,
) {
  assertCan(user, "payment.register");
  const r = registerPaymentSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Revisa los datos del pago", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
  if (!contract) throw new NotFoundError("contrato");
  if (contract.lifecycleState === "cancelado") {
    throw new ConflictError("No se pueden registrar pagos en un contrato cancelado.");
  }

  const received = fromMajor(data.receivedMajor, data.receivedCurrency);
  const contractCur = contract.currency;

  let applied = received;
  let rate = "1";
  if (data.receivedCurrency !== contractCur) {
    if (data.appliedMajorOverride) {
      applied = fromMajor(data.appliedMajorOverride, contractCur);
      // tasa implícita = aplicado_major / recibido_major
      rate =
        data.receivedMajor > 0
          ? (data.appliedMajorOverride / data.receivedMajor).toFixed(8)
          : "0";
    } else if (data.exchangeRate && Number(data.exchangeRate) > 0) {
      rate = data.exchangeRate.trim();
      applied = convert(received, contractCur, rate);
    } else {
      throw new ValidationError(
        "El pago está en otra moneda: indica la tasa de cambio o el importe aplicado.",
        { exchangeRate: ["Requerido para pagos en otra moneda"] },
      );
    }
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.ledgerEntry.create({
      data: {
        contractId: data.contractId,
        kind: "pago_recibido",
        valueDate: data.valueDate,
        receivedAmount: received.amount,
        receivedCurrency: received.currency,
        appliedAmount: applied.amount,
        appliedCurrency: contractCur,
        exchangeRate: rate,
        exchangeRateDate: data.receivedCurrency !== contractCur ? data.valueDate : null,
        exchangeRateSource: data.receivedCurrency !== contractCur ? "manual" : null,
        reference: data.reference || null,
        method: data.method ?? null,
        reason: data.notes || null,
        installmentId: data.installmentId || null,
        createdById: user.id,
      },
    });

    await writeAudit(tx, {
      entityType: "contract",
      entityId: data.contractId,
      action: "payment",
      userId: user.id,
      after: {
        entryId: created.id,
        received: received.amount.toString(),
        receivedCurrency: received.currency,
        applied: applied.amount.toString(),
        rate,
      },
      summary: `Pago recibido ${formatMoney(received, { withCode: true })}${
        data.receivedCurrency !== contractCur
          ? ` → ${formatMoney(applied, { withCode: true })} (tasa ${rate})`
          : ""
      }`,
    });

    // "El contrato queda saldado": lo que falte respecto al precio se anota como
    // comisión que retuvo el vendedor (RN-11) y el contrato pasa a «pagado».
    if (data.settleRetainedCommission) {
      const { derived } = await loadDerived(tx, data.contractId);
      const remaining = derived.balance.amount; // ya incluye este pago
      if (remaining > 0n) {
        await tx.ledgerEntry.create({
          data: {
            contractId: data.contractId,
            kind: "comision_retenida",
            valueDate: data.valueDate,
            receivedAmount: remaining,
            receivedCurrency: contractCur,
            appliedAmount: remaining,
            appliedCurrency: contractCur,
            reason: "El vendedor retuvo su comisión (pago directo a su cuenta).",
            createdById: user.id,
          },
        });
        await writeAudit(tx, {
          entityType: "contract",
          entityId: data.contractId,
          action: "mark_liquidated",
          userId: user.id,
          after: { retained: remaining.toString() },
          summary: `Contrato saldado — comisión retenida ${formatMoney(money(remaining, contractCur), { withCode: true })}`,
        });
      }
    }

    return created;
  });

  if (receipt && receipt.size > 0) {
    await prisma.$transaction(async (tx) => {
      const doc = await uploadDocument(
        user,
        { file: receipt, kind: "comprobante", entityType: "contract", entityId: data.contractId },
        tx,
      );
      await tx.receipt.create({ data: { ledgerEntryId: entry.id, documentId: doc.id } });
    });
  }

  return { id: entry.id };
}

/** Adjunta (o añade) un comprobante a un pago ya registrado. */
export async function attachReceipt(user: SessionUser, entryId: string, file: File) {
  assertCan(user, "payment.register");
  if (!file || file.size === 0) throw new ValidationError("Elige un archivo (foto o PDF)");
  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError("asiento");
  return prisma.$transaction(async (tx) => {
    const doc = await uploadDocument(
      user,
      { file, kind: "comprobante", entityType: "contract", entityId: entry.contractId },
      tx,
    );
    await tx.receipt.create({ data: { ledgerEntryId: entryId, documentId: doc.id } });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: entry.contractId,
      action: "update",
      userId: user.id,
      summary: `Comprobante adjuntado a un pago (${file.name})`,
    });
    return { id: doc.id };
  });
}

/** RN-11 — anulación de un asiento con motivo. */
export async function voidEntry(user: SessionUser, input: unknown) {
  assertCan(user, "payment.void");
  const r = voidEntrySchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const { entryId, reason } = r.data;

  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError("asiento");
  if (entry.voided) throw new ConflictError("El asiento ya está anulado.");

  return prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.update({
      where: { id: entryId },
      data: { voided: true, voidReason: reason, voidedAt: new Date(), voidedById: user.id },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: entry.contractId,
      action: "void",
      userId: user.id,
      before: { entryId, kind: entry.kind, applied: entry.appliedAmount.toString() },
      after: { voided: true, reason },
      summary: `Asiento anulado (${entry.kind}): ${reason}`,
    });
  });
}

/**
 * Edición de un asiento de pago (`payment.edit`, admin) — para corregir un
 * error de tecleo (fecha o importe mal) sin tener que anular y volver a
 * registrar. Recalcula el importe aplicado. Queda constancia en la auditoría
 * (antes / después). Sólo para pagos recibidos y ajustes; los asientos
 * anulados o de anticipo de cupo no se editan.
 */
export async function updateEntry(user: SessionUser, input: unknown) {
  assertCan(user, "payment.edit");
  const r = editEntrySchema.safeParse(input);
  if (!r.success) throw new ValidationError("Revisa los datos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: data.entryId },
    include: { contract: true, inventoryAssignment: { select: { id: true } } },
  });
  if (!entry) throw new NotFoundError("asiento");
  if (entry.voided) throw new ConflictError("Un asiento anulado no se edita.");
  if (entry.inventoryAssignment) {
    throw new ConflictError("Este asiento viene de un cupo. Ajústalo desde la asignación del cupo.");
  }

  const contractCur = entry.contract.currency;
  const received = fromMajor(data.receivedMajor, data.receivedCurrency);

  let applied = received;
  let rate = "1";
  if (data.receivedCurrency !== contractCur) {
    if (data.appliedMajorOverride) {
      applied = fromMajor(data.appliedMajorOverride, contractCur);
      rate = data.receivedMajor > 0 ? (data.appliedMajorOverride / data.receivedMajor).toFixed(8) : "0";
    } else if (data.exchangeRate && Number(data.exchangeRate) > 0) {
      rate = data.exchangeRate.trim();
      applied = convert(received, contractCur, rate);
    } else {
      throw new ValidationError("El pago está en otra moneda: indica la tasa o el importe aplicado.", {
        exchangeRate: ["Requerido para pagos en otra moneda"],
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerEntry.update({
      where: { id: data.entryId },
      data: {
        valueDate: data.valueDate,
        receivedAmount: received.amount,
        receivedCurrency: received.currency,
        appliedAmount: applied.amount,
        appliedCurrency: contractCur,
        exchangeRate: rate,
        exchangeRateDate: data.receivedCurrency !== contractCur ? data.valueDate : null,
        exchangeRateSource: data.receivedCurrency !== contractCur ? "manual" : null,
        reference: data.reference || null,
        method: data.method ?? null,
        reason: data.notes || entry.reason || null,
      },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: entry.contractId,
      action: "update",
      userId: user.id,
      before: {
        valueDate: entry.valueDate,
        received: entry.receivedAmount.toString(),
        receivedCurrency: entry.receivedCurrency,
      },
      after: {
        valueDate: updated.valueDate,
        received: updated.receivedAmount.toString(),
        receivedCurrency: updated.receivedCurrency,
      },
      summary: `Pago corregido (${entry.kind}): ${formatMoney(money(entry.receivedAmount, entry.receivedCurrency), { withCode: true })} → ${formatMoney(received, { withCode: true })}, fecha ${updated.valueDate}`,
    });
    return { id: updated.id };
  });
}

/**
 * Borrado de un asiento (error de tecleo). A diferencia de "anular" (deja
 * rastro visible), esto lo elimina. Sólo `payment.delete` (admin). El saldo es
 * derivado: no hay nada que recalcular. Queda constancia en la auditoría.
 */
export async function deleteEntry(user: SessionUser, input: { entryId?: string }) {
  assertCan(user, "payment.delete");
  const entryId = (input.entryId ?? "").trim();
  if (!entryId) throw new ValidationError("Falta el asiento a borrar");

  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    include: {
      inventoryAssignment: { select: { id: true } },
      receipts: { include: { document: { select: { id: true, storagePath: true } } } },
    },
  });
  if (!entry) throw new NotFoundError("asiento");
  if (entry.kind === "aplicacion_de_anticipo" && entry.inventoryAssignment) {
    throw new ConflictError(
      "Este asiento viene de una asignación de cupo. Reviértela desde el cupo en vez de borrarla.",
    );
  }

  const docs = entry.receipts.map((r) => r.document);

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      entityType: "contract",
      entityId: entry.contractId,
      action: "delete",
      userId: user.id,
      before: {
        entryId,
        kind: entry.kind,
        valueDate: entry.valueDate,
        received: entry.receivedAmount.toString(),
        receivedCurrency: entry.receivedCurrency,
      },
      summary: `Pago eliminado (${entry.kind}, ${entry.valueDate}).`,
    });
    // Receipt cae por cascada al borrar el asiento; los Document quedan sueltos.
    await tx.ledgerEntry.delete({ where: { id: entryId } });
    if (docs.length) {
      await tx.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    }
  });

  for (const d of docs) {
    await storage.softDelete(d.storagePath).catch(() => {});
  }
}

/**
 * RN — "Marcar como liquidado": escribe un asiento `comision_retenida` por el
 * saldo pendiente. No falsea el total pagado; los reportes distinguen caja
 * real de comisión cedida.
 */
export async function markLiquidated(user: SessionUser, input: unknown) {
  assertCan(user, "contract.mark_liquidated");
  const r = markLiquidatedSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const { contractId, reason } = r.data;

  return prisma.$transaction(async (tx) => {
    const { row, derived } = await loadDerived(tx, contractId);
    if (derived.balance.amount <= 0n) {
      throw new ConflictError("El contrato ya no tiene saldo pendiente.");
    }
    const today = systemClock(env.APP_TIMEZONE).today();
    await tx.ledgerEntry.create({
      data: {
        contractId,
        kind: "comision_retenida",
        valueDate: today,
        receivedAmount: derived.balance.amount,
        receivedCurrency: row.currency,
        appliedAmount: derived.balance.amount,
        appliedCurrency: row.currency,
        reason,
        createdById: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: contractId,
      action: "mark_liquidated",
      userId: user.id,
      after: { retained: derived.balance.amount.toString(), reason },
      summary: `Contrato ${row.number} liquidado — comisión retenida ${formatMoney(derived.balance, { withCode: true })}: ${reason}`,
    });
  });
}

/** Descuento o castigo autorizado (asiento con motivo). */
export async function addAdjustment(user: SessionUser, input: unknown) {
  assertCan(user, "payment.register");
  const r = adjustmentSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  return prisma.$transaction(async (tx) => {
    const { row } = await loadDerived(tx, data.contractId);
    const m = fromMajor(data.amountMajor, row.currency);
    await tx.ledgerEntry.create({
      data: {
        contractId: data.contractId,
        kind: data.kind,
        valueDate: data.valueDate,
        receivedAmount: m.amount,
        receivedCurrency: row.currency,
        appliedAmount: m.amount,
        appliedCurrency: row.currency,
        reason: data.reason,
        createdById: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: data.contractId,
      action: data.kind,
      userId: user.id,
      after: { amount: m.amount.toString(), reason: data.reason },
      summary: `${data.kind === "descuento" ? "Descuento" : "Castigo"} ${formatMoney(m, { withCode: true })}: ${data.reason}`,
    });
  });
}

/** Define o reemplaza el plan de cuotas (solo cuotas sin pagos imputados). */
export async function setInstallmentPlan(user: SessionUser, input: unknown) {
  assertCan(user, "contract.edit");
  const r = installmentPlanSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const contract = await prisma.contract.findUnique({ where: { id: data.contractId } });
  if (!contract) throw new NotFoundError("contrato");

  return prisma.$transaction(async (tx) => {
    const withPayments = await tx.installment.findMany({
      where: { contractId: data.contractId, ledgerEntries: { some: {} } },
      select: { id: true },
    });
    const lockedIds = new Set(withPayments.map((i) => i.id));
    // borra las cuotas sin pagos
    await tx.installment.deleteMany({
      where: { contractId: data.contractId, id: { notIn: [...lockedIds] } },
    });
    const existing = await tx.installment.count({ where: { contractId: data.contractId } });
    let seq = existing;
    for (const rrow of data.rows) {
      seq += 1;
      await tx.installment.create({
        data: {
          contractId: data.contractId,
          sequence: seq,
          dueDate: rrow.dueDate,
          expectedAmount: fromMajor(rrow.amountMajor, contract.currency).amount,
          currency: contract.currency,
        },
      });
    }
    await writeAudit(tx, {
      entityType: "contract",
      entityId: data.contractId,
      action: "installment_plan",
      userId: user.id,
      after: { cuotas: data.rows.length },
      summary: `Plan de cuotas definido (${data.rows.length} cuota(s))`,
    });
  });
}

/** Liquidación de comisión al vendedor (cuentas por pagar, flujo aparte). */
export async function settleCommission(user: SessionUser, input: unknown) {
  assertCan(user, "payment.register");
  const r = settleCommissionSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const commission = await prisma.commission.findUnique({ where: { contractId: data.contractId } });
  if (!commission) throw new NotFoundError("comisión");
  if (commission.settledAt) throw new ConflictError("La comisión ya fue liquidada.");

  return prisma.$transaction(async (tx) => {
    const m = fromMajor(data.settledMajor, commission.currency);
    await tx.commission.update({
      where: { contractId: data.contractId },
      data: { settledAt: new Date(), settledAmount: m.amount, settlementRef: data.reference || null },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: data.contractId,
      action: "commission_settled",
      userId: user.id,
      after: { settled: m.amount.toString() },
      summary: `Comisión liquidada al vendedor: ${formatMoney(m, { withCode: true })}`,
    });
  });
}

// Nota RN-15: el momento en que la comisión se hace exigible (devengo) es un
// valor DERIVADO a partir de `commissionAccrual` del contrato y su estado de
// pago; no se persiste ni afecta al saldo. Ver core/domain/rules.

// ── Vista transversal de pagos (/pagos) ──────────────────────────────────

export interface PaymentRow {
  entryId: string;
  contractId: string;
  contractNumber: string;
  client: string;
  seller: string | null;
  destination: string;
  valueDate: string;
  kind: string;
  received: string;
  applied: string;
  reference: string | null;
  method: string | null;
  voided: boolean;
  by: string | null;
}

export interface PaymentFilters {
  from?: string;
  to?: string;
  sellerId?: string;
  destinationId?: string;
  kind?: string;
  includeVoided?: boolean;
}

function dateRange(f: PaymentFilters) {
  if (!f.from && !f.to) return {};
  return { valueDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } };
}

export async function listPayments(filters: PaymentFilters = {}): Promise<PaymentRow[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      // «desde» y «hasta» juntos (antes el segundo pisaba al primero y el rango no filtraba bien).
      ...dateRange(filters),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.includeVoided ? {} : { voided: false }),
      contract: {
        ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
        ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
      },
    },
    orderBy: { valueDate: "desc" },
    take: 500,
    include: {
      createdBy: { select: { name: true } },
      contract: {
        select: {
          number: true,
          client: { select: { fullName: true } },
          seller: { select: { name: true } },
          destination: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((e) => ({
    entryId: e.id,
    contractId: e.contractId,
    contractNumber: e.contract.number,
    client: e.contract.client.fullName,
    seller: e.contract.seller?.name ?? null,
    destination: e.contract.destination.name,
    valueDate: e.valueDate,
    kind: e.kind,
    received: formatMoney(money(e.receivedAmount, e.receivedCurrency), { withCode: true }),
    applied: formatMoney(money(e.appliedAmount, e.appliedCurrency), { withCode: true }),
    reference: e.reference,
    method: e.method,
    voided: e.voided,
    by: e.createdBy?.name ?? null,
  }));
}

/** Totales de caja real recibida, agrupados por moneda (RN-13). */
export async function cashTotals(filters: PaymentFilters = {}) {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      kind: "pago_recibido",
      voided: false,
      // «desde» y «hasta» juntos (antes el segundo pisaba al primero y el rango no filtraba bien).
      ...dateRange(filters),
      contract: {
        ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
        ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
      },
    },
    select: { receivedAmount: true, receivedCurrency: true },
  });
  const byCur = new Map<string, bigint>();
  for (const e of rows) byCur.set(e.receivedCurrency, (byCur.get(e.receivedCurrency) ?? 0n) + e.receivedAmount);
  return [...byCur.entries()].map(([currency, amount]) => ({
    currency,
    formatted: formatMoney(money(amount, currency), { withCode: true }),
  }));
}
