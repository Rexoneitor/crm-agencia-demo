import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import type { Tx } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { fromMajor, formatMoney, money } from "@/core/money/money";
import { addPlainDays, systemClock, type PlainDate } from "@/core/time/clock";
import { label, REFUND_OPEN_STATES, type RefundState } from "@/core/domain/enums";
import { uploadDocument } from "@/modules/documents/service";
import { cancelContract, createContract } from "@/modules/contracts/service";
import { registerPayment } from "@/modules/payments/service";
import {
  type RefundInput,
  refundPaymentSchema,
  refundSchema,
  refundStateSchema,
  voidRefundPaymentSchema,
} from "./schema";

/**
 * Reembolsos: cuentas por pagar a clientes. Una solicitud se sigue de punta a
 * punta (solicitado → en trámite → aprobado → pagado). Cada pago al cliente es
 * un RefundPayment; si el reembolso está ligado a un contrato, además crea un
 * asiento `reembolso` en el libro de ese contrato, de modo que su saldo y los
 * reportes reflejan la devolución sin duplicar lógica.
 */

function today(): PlainDate {
  return systemClock(env.APP_TIMEZONE).today();
}

function isOpen(state: string) {
  return (REFUND_OPEN_STATES as string[]).includes(state);
}

/**
 * Plazo sugerido para responder según el canal. Derecho de petición: 15 días
 * hábiles (Ley 1755 de 2015) — aquí se descuentan fines de semana pero NO los
 * festivos, así que el plazo sugerido es conservador (nunca más tarde del real
 * salvo festivos). Siempre se puede editar a mano.
 */
export function suggestDueDate(requestedAt: PlainDate, channel: string): PlainDate | null {
  if (channel !== "derecho_peticion") return null;
  let d = requestedAt;
  let left = 15;
  while (left > 0) {
    d = addPlainDays(d, 1);
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

async function nextRefundNumber(tx: Tx) {
  const year = Number(today().slice(0, 4));
  const key = `refund:${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `RMB-${year}-${String(counter.value).padStart(4, "0")}`;
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(
      "Revisa los campos",
      z.flattenError(r.error).fieldErrors as Record<string, string[]>,
    );
  return r.data;
}

type RefundRow = Awaited<ReturnType<typeof loadRefunds>>[number];

function loadRefunds(where: object = {}) {
  return prisma.refund.findMany({
    where,
    include: {
      contract: { select: { id: true, number: true, lifecycleState: true, client: { select: { fullName: true } } } },
      group: { select: { id: true, name: true } },
      payments: { where: { voided: false }, select: { amount: true } },
    },
    orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** Vista de una fila: montos derivados (pagado, pendiente) y si está vencido. */
function toRow(r: RefundRow) {
  const paid = r.payments.reduce((s, p) => s + p.amount, 0n);
  const target = r.agreedAmount ?? r.requestedAmount ?? null;
  const pending = target != null ? (target > paid ? target - paid : 0n) : null;
  const fmt = (v: bigint | null) => (v == null ? "—" : formatMoney(money(v, r.currency), { withCode: true }));
  const open = isOpen(r.state);
  return {
    id: r.id,
    number: r.number,
    clientName: r.clientName,
    contract: r.contract ? { id: r.contract.id, number: r.contract.number, lifecycle: r.contract.lifecycleState } : null,
    group: r.group,
    people: r.people,
    requestedAt: r.requestedAt,
    channel: r.channel,
    reasonCode: r.reasonCode,
    reason: r.reason,
    dueDate: r.dueDate,
    state: r.state,
    open,
    overdue: open && r.dueDate != null && r.dueDate < today(),
    currency: r.currency,
    requested: fmt(r.requestedAmount),
    agreed: fmt(r.agreedAmount),
    paid: fmt(paid),
    pending: fmt(pending),
    paidAmount: paid,
    pendingAmount: pending,
    archived: r.archivedAt != null,
  };
}
export type RefundListRow = ReturnType<typeof toRow>;

export async function listRefunds(filter: { view?: string; q?: string } = {}) {
  const where: Record<string, unknown> = { archivedAt: null };
  if (filter.view === "abiertos" || !filter.view) where.state = { in: REFUND_OPEN_STATES };
  else if (filter.view === "archivados") where.archivedAt = { not: null };
  else if (filter.view !== "todos") where.state = filter.view;
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    where.OR = [{ clientName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }];
  }
  return (await loadRefunds(where)).map(toRow);
}

/** Totales para las tarjetas de la página y el inicio. */
export async function refundSummary() {
  const rows = (await loadRefunds({ archivedAt: null })).map(toRow);
  const open = rows.filter((r) => r.open);
  const byCurrency = new Map<string, { pending: bigint; paid: bigint; unknown: number }>();
  for (const r of rows) {
    const acc = byCurrency.get(r.currency) ?? { pending: 0n, paid: 0n, unknown: 0 };
    acc.paid += r.paidAmount;
    if (r.open) {
      if (r.pendingAmount == null) acc.unknown += 1;
      else acc.pending += r.pendingAmount;
    }
    byCurrency.set(r.currency, acc);
  }
  return {
    openCount: open.length,
    overdueCount: open.filter((r) => r.overdue).length,
    legalCount: open.filter((r) => ["derecho_peticion", "tutela", "superintendencia"].includes(r.channel)).length,
    totals: [...byCurrency.entries()].map(([currency, t]) => ({
      currency,
      pending: formatMoney(money(t.pending, currency), { withCode: true }),
      paid: formatMoney(money(t.paid, currency), { withCode: true }),
      withoutAmount: t.unknown,
    })),
  };
}

export async function getRefundDetail(id: string) {
  const r = await prisma.refund.findUnique({
    where: { id },
    include: {
      contract: { select: { id: true, number: true, lifecycleState: true, currency: true, client: { select: { fullName: true } } } },
      group: { select: { id: true, name: true } },
      payments: { orderBy: { paidDate: "asc" } },
    },
  });
  if (!r) throw new NotFoundError("reembolso");
  const docIds = r.payments.map((p) => p.documentId).filter((x): x is string => !!x);
  const [docs, attachments, history] = await Promise.all([
    prisma.document.findMany({ where: { id: { in: docIds } } }),
    prisma.document.findMany({ where: { entityType: "refund", entityId: id, archivedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { entityType: "refund", entityId: id },
      orderBy: { at: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);
  const docById = new Map(docs.map((d) => [d.id, d]));
  const row = toRow({ ...r, payments: r.payments.filter((p) => !p.voided) });
  return {
    refund: r,
    row,
    payments: r.payments.map((p) => ({
      id: p.id,
      paidDate: p.paidDate,
      amount: formatMoney(money(p.amount, r.currency), { withCode: true }),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      voided: p.voided,
      voidReason: p.voidReason,
      ledgerEntryId: p.ledgerEntryId,
      document: p.documentId ? docById.get(p.documentId) ?? null : null,
    })),
    attachments,
    history,
  };
}

async function resolveLinks(contractId?: string, groupId?: string) {
  let currency: string | null = null;
  if (contractId) {
    const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { currency: true, groupId: true } });
    if (!c) throw new ValidationError("El contrato elegido no existe", { contractId: ["No existe"] });
    currency = c.currency;
  }
  if (groupId) {
    const g = await prisma.contractGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new ValidationError("El grupo elegido no existe", { groupId: ["No existe"] });
  }
  return { currency };
}

const norm = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Código de cancelación del contrato según el motivo del reembolso. */
const CANCEL_CODE: Record<string, "desistimiento_cliente" | "error_agencia" | "otro"> = {
  desistimiento_cliente: "desistimiento_cliente",
  incumplimiento: "error_agencia",
  cancelacion_agencia: "otro",
  cambio_no_aceptado: "otro",
  otro: "otro",
};

/**
 * Reembolso de un contrato que todavía no está cargado: lo crea aquí mismo
 * (con el abono que ya hizo el cliente) para que aparezca en Contratos.
 */
async function createContractForRefund(user: SessionUser, data: RefundInput): Promise<string> {
  const errors: Record<string, string[]> = {};
  if (!data.ncDestinationId && !data.ncDestinationNew) errors.ncDestination = ["Elige o escribe el destino"];
  if (!data.ncPriceMajor || data.ncPriceMajor <= 0) errors.ncPriceMajor = ["Indica el precio del contrato (si no lo sabes, lo abonado)"];
  const modality = data.ncModality || "fecha_abierta";
  if (modality === "fecha_cerrada" && !data.ncTravelDate) errors.ncTravelDate = ["Indica la fecha de viaje"];
  if (modality === "fecha_abierta" && (!data.ncVigenciaStart || !data.ncVigenciaEnd)) {
    errors.ncVigenciaEnd = ["Indica la vigencia (desde y hasta)"];
  }
  if (Object.keys(errors).length) throw new ValidationError("Faltan datos del contrato nuevo", errors);

  // Evita duplicar: si ya hay un contrato vigente a ese nombre, que lo elija.
  const dup = (
    await prisma.contract.findMany({
      where: { archivedAt: null, lifecycleState: { not: "cancelado" } },
      select: { number: true, client: { select: { fullName: true } } },
    })
  ).find((c) => norm(c.client.fullName) === norm(data.clientName));
  if (dup) {
    throw new ConflictError(
      `Ya existe el contrato ${dup.number} de «${dup.client.fullName}». Elígelo en «Contrato (si existe)» en vez de crear otro.`,
    );
  }

  // Si escribieron un destino que ya existe, se usa ese en vez de intentar crearlo de nuevo.
  if (!data.ncDestinationId && data.ncDestinationNew) {
    const dests = await prisma.destination.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
    const found = dests.find((d) => norm(d.name) === norm(data.ncDestinationNew!));
    if (found) {
      data.ncDestinationId = found.id;
      data.ncDestinationNew = "";
    }
  }

  const adults = data.ncAdults != null ? Math.round(data.ncAdults) : Math.max(1, (data.people ?? 2) - (data.ncChildren ? Math.round(data.ncChildren) : 0));
  const created = await createContract(user, {
    clientNew: data.clientName,
    sellerId: data.ncSellerId || "",
    sellerNew: data.ncSellerNew || "",
    modality,
    tripType: data.ncTripType || "nacional",
    destinationId: data.ncDestinationId || "",
    destinationNew: data.ncDestinationNew || "",
    saleDate: data.ncSaleDate || "",
    vigenciaStart: modality === "fecha_abierta" ? data.ncVigenciaStart : "",
    vigenciaEnd: modality === "fecha_abierta" ? data.ncVigenciaEnd : "",
    travelDate: modality === "fecha_cerrada" ? data.ncTravelDate : "",
    returnDate: modality === "fecha_cerrada" ? data.ncReturnDate : "",
    priceMajor: data.ncPriceMajor,
    currency: data.currency || "COP",
    adults,
    children: data.ncChildren ? Math.round(data.ncChildren) : 0,
    notes: "Contrato creado desde una solicitud de reembolso (no estaba cargado).",
  });

  // Datos de contacto del cliente, si vinieron en la solicitud.
  const contract = await prisma.contract.findUnique({ where: { id: created.id }, select: { clientId: true } });
  if (contract && (data.clientDoc || data.contactEmail || data.contactPhone)) {
    await prisma.client.update({
      where: { id: contract.clientId },
      data: {
        ...(data.clientDoc ? { documentId: data.clientDoc } : {}),
        ...(data.contactEmail ? { email: data.contactEmail } : {}),
        ...(data.contactPhone ? { phone: data.contactPhone } : {}),
      },
    });
  }

  if (data.ncPaidMajor && data.ncPaidMajor > 0) {
    await registerPayment(user, {
      contractId: created.id,
      valueDate: data.ncSaleDate || systemClock(env.APP_TIMEZONE).today(),
      receivedMajor: data.ncPaidMajor,
      receivedCurrency: data.currency || "COP",
      reference: "Abono previo al reembolso",
      notes: "Abono registrado al crear el contrato desde la solicitud de reembolso (fecha aproximada si no se indicó la de venta).",
    });
  }
  return created.id;
}

export async function createRefund(user: SessionUser, input: unknown, attachment?: File | null) {
  assertCan(user, "payment.register");
  const data = parse(refundSchema, input);
  if (!data.contractId && data.newContract) {
    assertCan(user, "contract.create");
    data.contractId = await createContractForRefund(user, data);
  }
  // Marcar el contrato como cancelado (si no lo está ya): el cliente se retira.
  if (data.contractId && data.cancelContract) {
    const c = await prisma.contract.findUnique({ where: { id: data.contractId }, select: { lifecycleState: true } });
    if (c && c.lifecycleState !== "cancelado") {
      await cancelContract(user, data.contractId, {
        reason: data.reason.length >= 5 ? data.reason : `Reembolso solicitado: ${data.reason}`,
        code: CANCEL_CODE[data.reasonCode] ?? "otro",
      });
    }
  }
  const { currency: contractCurrency } = await resolveLinks(data.contractId || undefined, data.groupId || undefined);
  // Si hay contrato, el reembolso va en SU moneda (RN-13).
  const currency = contractCurrency ?? data.currency;
  const dueDate = data.dueDate || suggestDueDate(data.requestedAt, data.channel);

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextRefundNumber(tx);
    const r = await tx.refund.create({
      data: {
        number,
        contractId: data.contractId || null,
        groupId: data.groupId || null,
        clientName: data.clientName,
        clientDoc: data.clientDoc || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        people: data.people ?? null,
        requestedAt: data.requestedAt,
        channel: data.channel,
        reasonCode: data.reasonCode,
        reason: data.reason,
        dueDate: dueDate || null,
        currency,
        requestedAmount: data.requestedMajor != null ? fromMajor(data.requestedMajor, currency).amount : null,
        agreedAmount: data.agreedMajor != null ? fromMajor(data.agreedMajor, currency).amount : null,
        emailThread: data.emailThread || null,
        notes: data.notes || null,
        createdBy: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "refund",
      entityId: r.id,
      action: "create",
      userId: user.id,
      after: r,
      summary: `Reembolso ${number} registrado — ${r.clientName} (${label(r.channel)})`,
    });
    if (r.contractId) {
      await writeAudit(tx, {
        entityType: "contract",
        entityId: r.contractId,
        action: "update",
        userId: user.id,
        summary: `Solicitud de reembolso ${number} registrada`,
      });
    }
    return r;
  });

  if (attachment && attachment.size > 0) {
    await uploadDocument(user, { file: attachment, kind: "otro", entityType: "refund", entityId: created.id });
  }
  return { id: created.id, number: created.number };
}

export async function updateRefund(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "payment.register");
  const data = parse(refundSchema, input);
  const before = await prisma.refund.findUnique({ where: { id }, include: { payments: { where: { voided: false } } } });
  if (!before) throw new NotFoundError("reembolso");
  const { currency: contractCurrency } = await resolveLinks(data.contractId || undefined, data.groupId || undefined);
  const currency = contractCurrency ?? data.currency;
  if (before.payments.length > 0 && currency !== before.currency) {
    throw new ConflictError("Ya hay pagos registrados en otra moneda: no se puede cambiar la moneda del reembolso.");
  }
  if (before.payments.some((p) => p.ledgerEntryId) && (data.contractId || null) !== before.contractId) {
    throw new ConflictError(
      "Este reembolso ya tiene pagos asentados en su contrato. Anula esos pagos antes de cambiarlo de contrato.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id },
      data: {
        contractId: data.contractId || null,
        groupId: data.groupId || null,
        clientName: data.clientName,
        clientDoc: data.clientDoc || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        people: data.people ?? null,
        requestedAt: data.requestedAt,
        channel: data.channel,
        reasonCode: data.reasonCode,
        reason: data.reason,
        dueDate: data.dueDate || null,
        currency,
        requestedAmount: data.requestedMajor != null ? fromMajor(data.requestedMajor, currency).amount : null,
        agreedAmount: data.agreedMajor != null ? fromMajor(data.agreedMajor, currency).amount : null,
        emailThread: data.emailThread || null,
        notes: data.notes || null,
      },
    });
    await writeAudit(tx, {
      entityType: "refund",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
      summary: `Reembolso ${before.number} modificado`,
    });
    return updated;
  });
}

export async function setRefundState(user: SessionUser, input: unknown) {
  assertCan(user, "payment.register");
  const data = parse(refundStateSchema, input);
  const before = await prisma.refund.findUnique({ where: { id: data.refundId } });
  if (!before) throw new NotFoundError("reembolso");
  if (before.state === data.state) return before;
  const closing = !isOpen(data.state as RefundState);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: data.refundId },
      data: {
        state: data.state,
        stateNote: data.note || null,
        resolvedAt: closing ? new Date() : null,
      },
    });
    await writeAudit(tx, {
      entityType: "refund",
      entityId: data.refundId,
      action: "state_change",
      userId: user.id,
      before: { state: before.state },
      after: { state: data.state, note: data.note || null },
      summary: `Reembolso ${before.number}: ${label(before.state)} → ${label(data.state)}${data.note ? ` — ${data.note}` : ""}`,
    });
    return updated;
  });
}

/**
 * Pago al cliente (total o parcial). Si el reembolso está ligado a un contrato,
 * crea además el asiento `reembolso` en ese contrato. Cuando lo pagado alcanza
 * el monto acordado (o el pedido, si no hay acordado) pasa a "pagado".
 */
export async function registerRefundPayment(user: SessionUser, input: unknown, receipt?: File | null) {
  assertCan(user, "payment.register");
  const data = parse(refundPaymentSchema, input);
  const refund = await prisma.refund.findUnique({
    where: { id: data.refundId },
    include: { payments: { where: { voided: false } } },
  });
  if (!refund) throw new NotFoundError("reembolso");
  if (["rechazado", "desistido"].includes(refund.state)) {
    throw new ConflictError(`El reembolso está ${label(refund.state).toLowerCase()}: reábrelo antes de registrar un pago.`);
  }
  const amount = fromMajor(data.amountMajor, refund.currency);
  const paidBefore = refund.payments.reduce((s, p) => s + p.amount, 0n);
  const target = refund.agreedAmount ?? refund.requestedAmount;

  const payment = await prisma.$transaction(async (tx) => {
    let ledgerEntryId: string | null = null;
    if (refund.contractId) {
      const entry = await tx.ledgerEntry.create({
        data: {
          contractId: refund.contractId,
          kind: "reembolso",
          valueDate: data.paidDate,
          receivedAmount: amount.amount,
          receivedCurrency: refund.currency,
          appliedAmount: amount.amount,
          appliedCurrency: refund.currency,
          reference: data.reference || null,
          method: data.method ?? null,
          reason: `Reembolso ${refund.number} al cliente${data.notes ? ` — ${data.notes}` : ""}`,
          createdById: user.id,
        },
      });
      ledgerEntryId = entry.id;
      await writeAudit(tx, {
        entityType: "contract",
        entityId: refund.contractId,
        action: "payment",
        userId: user.id,
        after: { entryId: entry.id, refund: refund.number },
        summary: `Reembolso pagado al cliente — ${formatMoney(amount, { withCode: true })} (${refund.number})`,
      });
    }
    const p = await tx.refundPayment.create({
      data: {
        refundId: refund.id,
        paidDate: data.paidDate,
        amount: amount.amount,
        method: data.method ?? null,
        reference: data.reference || null,
        notes: data.notes || null,
        ledgerEntryId,
        createdBy: user.id,
      },
    });
    const paidNow = paidBefore + amount.amount;
    const complete = target != null && paidNow >= target;
    if (complete && refund.state !== "pagado") {
      await tx.refund.update({ where: { id: refund.id }, data: { state: "pagado", resolvedAt: new Date() } });
    } else if (!complete && refund.state === "solicitado") {
      await tx.refund.update({ where: { id: refund.id }, data: { state: "aprobado" } });
    }
    await writeAudit(tx, {
      entityType: "refund",
      entityId: refund.id,
      action: "payment",
      userId: user.id,
      after: { paymentId: p.id, amount: amount.amount.toString(), ledgerEntryId },
      summary: `Pago al cliente de ${formatMoney(amount, { withCode: true })}${complete ? " — reembolso completo" : " (parcial)"}`,
    });
    return p;
  });

  if (receipt && receipt.size > 0) {
    await prisma.$transaction(async (tx) => {
      const doc = await uploadDocument(
        user,
        { file: receipt, kind: "comprobante", entityType: "refund", entityId: refund.id },
        tx,
      );
      await tx.refundPayment.update({ where: { id: payment.id }, data: { documentId: doc.id } });
      if (payment.ledgerEntryId) {
        await tx.receipt.create({ data: { ledgerEntryId: payment.ledgerEntryId, documentId: doc.id } });
      }
    });
  }
  return { id: payment.id };
}

/** Anula un pago de reembolso (y su asiento en el contrato, si lo hay). Nada se borra. */
export async function voidRefundPayment(user: SessionUser, input: unknown) {
  assertCan(user, "payment.void");
  const data = parse(voidRefundPaymentSchema, input);
  const p = await prisma.refundPayment.findUnique({ where: { id: data.paymentId }, include: { refund: true } });
  if (!p) throw new NotFoundError("pago de reembolso");
  if (p.voided) throw new ConflictError("Ese pago ya está anulado.");

  await prisma.$transaction(async (tx) => {
    await tx.refundPayment.update({
      where: { id: p.id },
      data: { voided: true, voidReason: data.reason, voidedAt: new Date() },
    });
    if (p.ledgerEntryId) {
      await tx.ledgerEntry.update({
        where: { id: p.ledgerEntryId },
        data: { voided: true, voidReason: data.reason, voidedAt: new Date(), voidedById: user.id },
      });
      await writeAudit(tx, {
        entityType: "contract",
        entityId: p.refund.contractId!,
        action: "void",
        userId: user.id,
        summary: `Anulado asiento de reembolso (${p.refund.number}): ${data.reason}`,
      });
    }
    if (p.refund.state === "pagado") {
      await tx.refund.update({ where: { id: p.refundId }, data: { state: "aprobado", resolvedAt: null } });
    }
    await writeAudit(tx, {
      entityType: "refund",
      entityId: p.refundId,
      action: "void",
      userId: user.id,
      summary: `Pago al cliente anulado (${formatMoney(money(p.amount, p.refund.currency), { withCode: true })}): ${data.reason}`,
    });
  });
}

export async function archiveRefund(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "payment.register");
  const before = await prisma.refund.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("reembolso");
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, {
      entityType: "refund",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      summary: `Reembolso ${before.number} ${archived ? "archivado" : "restaurado"}`,
    });
  });
}

export async function addRefundAttachment(user: SessionUser, id: string, file: File) {
  assertCan(user, "payment.register");
  const r = await prisma.refund.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("reembolso");
  return uploadDocument(user, { file, kind: "otro", entityType: "refund", entityId: id });
}

/** Reembolsos de un contrato (para mostrarlos en su ficha). */
export async function refundsForContract(contractId: string) {
  return (await loadRefunds({ contractId, archivedAt: null })).map(toRow);
}
