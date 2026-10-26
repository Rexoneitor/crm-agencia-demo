import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import type { Tx } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { fromMajor, formatMoney, money } from "@/core/money/money";
import { systemClock } from "@/core/time/clock";
import {
  assignInventorySchema,
  inventoryPaymentSchema,
  inventorySchema,
  reverseAssignmentSchema,
} from "./schema";

interface InventoryFinancials {
  paidByCurrency: Record<string, bigint>;
  appliedByCurrency: Record<string, bigint>;
  seatsAssigned: number;
}

/** RN-14 — saldo disponible del cupo (suma de pagos − suma de aplicaciones). */
async function computeFinancials(tx: Tx, id: string): Promise<InventoryFinancials> {
  const [payments, assignments] = await Promise.all([
    tx.inventoryPayment.findMany({ where: { pendingInventoryId: id, voided: false } }),
    tx.inventoryAssignment.findMany({ where: { pendingInventoryId: id, reversed: false } }),
  ]);
  const paidByCurrency: Record<string, bigint> = {};
  for (const p of payments) paidByCurrency[p.currency] = (paidByCurrency[p.currency] ?? 0n) + p.amount;
  const appliedByCurrency: Record<string, bigint> = {};
  for (const a of assignments)
    appliedByCurrency[a.appliedCurrency] = (appliedByCurrency[a.appliedCurrency] ?? 0n) + a.appliedAmount;
  const seatsAssigned = assignments.reduce((s, a) => s + a.seats, 0);
  return { paidByCurrency, appliedByCurrency, seatsAssigned };
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(
      "Revisa los datos",
      z.flattenError(r.error).fieldErrors as Record<string, string[]>,
    );
  }
  return r.data;
}

export async function createInventory(user: SessionUser, input: unknown) {
  assertCan(user, "inventory.manage");
  const data = parse(inventorySchema, input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.pendingInventory.create({
      data: {
        sellerId: data.sellerId,
        purchaseDate: data.purchaseDate,
        destinationId: data.destinationId,
        hotelId: data.hotelId || null,
        travelDate: data.travelDate || null,
        seats: data.seats,
        amount: fromMajor(data.amountMajor, data.currency).amount,
        currency: data.currency,
        reference: data.reference || null,
        notes: data.notes || null,
        state: "disponible",
        createdBy: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Cupo creado: ${data.seats} plazas`,
    });
    return created;
  });
}

/** Corregir los datos de un cupo (plazas, valor, fechas, referencia mal tecleados). */
export async function updateInventory(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "inventory.manage");
  const data = parse(inventorySchema, input);
  const before = await prisma.pendingInventory.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("cupo");

  return prisma.$transaction(async (tx) => {
    const fin = await computeFinancials(tx, id);
    if (data.seats < fin.seatsAssigned) {
      throw new ConflictError(
        `Ya hay ${fin.seatsAssigned} plaza(s) asignada(s): no puedes dejar el cupo con menos.`,
      );
    }
    const state =
      fin.seatsAssigned === 0
        ? "disponible"
        : fin.seatsAssigned >= data.seats
          ? "asignado"
          : "parcialmente_asignado";

    const updated = await tx.pendingInventory.update({
      where: { id },
      data: {
        sellerId: data.sellerId,
        purchaseDate: data.purchaseDate,
        destinationId: data.destinationId,
        hotelId: data.hotelId || null,
        travelDate: data.travelDate || null,
        seats: data.seats,
        amount: fromMajor(data.amountMajor, data.currency).amount,
        currency: data.currency,
        reference: data.reference || null,
        notes: data.notes || null,
        state: before.state === "cancelado" || before.state === "vencido" ? before.state : state,
      },
    });
    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
      summary: `Cupo editado: ${data.seats} plazas`,
    });
    return updated;
  });
}

export async function addInventoryPayment(user: SessionUser, input: unknown) {
  assertCan(user, "inventory.manage");
  const data = parse(inventoryPaymentSchema, input);
  return prisma.$transaction(async (tx) => {
    const inv = await tx.pendingInventory.findUnique({ where: { id: data.pendingInventoryId } });
    if (!inv) throw new NotFoundError("cupo");
    const p = await tx.inventoryPayment.create({
      data: {
        pendingInventoryId: data.pendingInventoryId,
        valueDate: data.valueDate,
        amount: fromMajor(data.amountMajor, data.currency).amount,
        currency: data.currency,
        method: data.method ?? null,
        reference: data.reference || null,
        createdBy: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: data.pendingInventoryId,
      action: "payment",
      userId: user.id,
      after: { amount: p.amount.toString(), currency: p.currency },
      summary: `Pago del vendedor por el cupo: ${formatMoney(money(p.amount, p.currency), { withCode: true })}`,
    });
    return p;
  });
}

/**
 * RN-14 — Asignar cupo a contrato. En UNA transacción:
 *  · crea `InventoryAssignment`
 *  · crea el asiento `aplicacion_de_anticipo` en el contrato
 *  · descuenta plazas y actualiza el estado del cupo
 * Invariante: Σ aplicaciones ≤ Σ pagos del cupo (misma moneda del cupo).
 */
export async function assignInventory(user: SessionUser, input: unknown) {
  assertCan(user, "inventory.assign");
  const data = parse(assignInventorySchema, input);

  return prisma.$transaction(async (tx) => {
    const inv = await tx.pendingInventory.findUnique({ where: { id: data.pendingInventoryId } });
    if (!inv) throw new NotFoundError("cupo");
    if (["cancelado", "vencido"].includes(inv.state)) {
      throw new ConflictError("Este cupo no está disponible para asignar.");
    }
    const contract = await tx.contract.findUnique({ where: { id: data.contractId } });
    if (!contract) throw new NotFoundError("contrato");

    const fin = await computeFinancials(tx, inv.id);
    const seatsLeft = inv.seats - fin.seatsAssigned;
    if (data.seats > seatsLeft) {
      throw new ConflictError(`El cupo solo tiene ${seatsLeft} plaza(s) disponible(s).`);
    }

    const applied = fromMajor(data.appliedMajor, contract.currency);

    // Invariante RN-14: la aplicación equivalente en la moneda del cupo no
    // puede exceder el saldo disponible del cupo.
    let appliedInInvCurrency = applied.amount;
    let rate = "1";
    if (contract.currency !== inv.currency) {
      if (!data.exchangeRate || Number(data.exchangeRate) <= 0) {
        throw new ValidationError("Indica la tasa de cambio: el contrato y el cupo usan monedas distintas.", {
          exchangeRate: ["Requerido"],
        });
      }
      rate = data.exchangeRate.trim();
      // appliedMajor(contrato) / rate ≈ valor en moneda del cupo
      appliedInInvCurrency = fromMajor(data.appliedMajor / Number(rate), inv.currency).amount;
    }
    const paid = fin.paidByCurrency[inv.currency] ?? 0n;
    const alreadyApplied = fin.appliedByCurrency[inv.currency] ?? 0n;
    if (alreadyApplied + appliedInInvCurrency > paid) {
      throw new ConflictError(
        "La aplicación excede el saldo disponible del cupo (Σ aplicaciones no puede superar Σ pagos del cupo).",
      );
    }

    const assignment = await tx.inventoryAssignment.create({
      data: {
        pendingInventoryId: inv.id,
        contractId: contract.id,
        seats: data.seats,
        appliedAmount: applied.amount,
        appliedCurrency: contract.currency,
        exchangeRate: rate,
        valueDate: data.valueDate,
        createdBy: user.id,
      },
    });

    const entry = await tx.ledgerEntry.create({
      data: {
        contractId: contract.id,
        kind: "aplicacion_de_anticipo",
        valueDate: data.valueDate,
        receivedAmount: applied.amount,
        receivedCurrency: contract.currency,
        appliedAmount: applied.amount,
        appliedCurrency: contract.currency,
        exchangeRate: rate,
        reference: `Cupo ${inv.reference ?? inv.id.slice(0, 6)}`,
        reason: "Aplicación de anticipo de cupo (RN-14)",
        inventoryAssignmentId: assignment.id,
        createdById: user.id,
      },
    });

    const newSeatsAssigned = fin.seatsAssigned + data.seats;
    const newState =
      newSeatsAssigned >= inv.seats ? "asignado" : "parcialmente_asignado";
    await tx.pendingInventory.update({ where: { id: inv.id }, data: { state: newState } });

    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: inv.id,
      action: "assign",
      userId: user.id,
      after: { contractId: contract.id, seats: data.seats, applied: applied.amount.toString(), entryId: entry.id },
      summary: `Cupo asignado a ${contract.number}: ${data.seats} plaza(s), ${formatMoney(applied, { withCode: true })}`,
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: contract.id,
      action: "inventory_assigned",
      userId: user.id,
      after: { inventoryId: inv.id, applied: applied.amount.toString() },
      summary: `Anticipo de cupo aplicado: ${formatMoney(applied, { withCode: true })}`,
    });

    return { assignmentId: assignment.id, contractId: contract.id };
  });
}

/** Reversión de una asignación (contrato cancelado tras servirse de un cupo). */
export async function reverseAssignment(user: SessionUser, input: unknown) {
  assertCan(user, "inventory.assign");
  const data = parse(reverseAssignmentSchema, input);
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.inventoryAssignment.findUnique({
      where: { id: data.assignmentId },
      include: { ledgerEntry: true, pendingInventory: true },
    });
    if (!assignment) throw new NotFoundError("asignación");
    if (assignment.reversed) throw new ConflictError("La asignación ya fue revertida.");

    await tx.inventoryAssignment.update({
      where: { id: data.assignmentId },
      data: { reversed: true, reverseReason: data.reason, reversedAt: new Date() },
    });
    if (assignment.ledgerEntry && !assignment.ledgerEntry.voided) {
      await tx.ledgerEntry.update({
        where: { id: assignment.ledgerEntry.id },
        data: {
          voided: true,
          voidReason: `Reversión de asignación de cupo: ${data.reason}`,
          voidedAt: new Date(),
          voidedById: user.id,
        },
      });
    }
    // Recalcula estado del cupo.
    const fin = await computeFinancials(tx, assignment.pendingInventoryId);
    const inv = assignment.pendingInventory;
    const newState =
      fin.seatsAssigned === 0 ? "disponible" : fin.seatsAssigned >= inv.seats ? "asignado" : "parcialmente_asignado";
    await tx.pendingInventory.update({ where: { id: inv.id }, data: { state: newState } });

    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: inv.id,
      action: "reverse_assignment",
      userId: user.id,
      after: { assignmentId: data.assignmentId, reason: data.reason },
      summary: `Asignación de cupo revertida: ${data.reason}`,
    });
  });
}

export async function archiveInventory(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "inventory.manage");
  const inv = await prisma.pendingInventory.findUnique({ where: { id } });
  if (!inv) throw new NotFoundError("cupo");
  await prisma.$transaction(async (tx) => {
    await tx.pendingInventory.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "pending_inventory",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      summary: archived ? "Cupo archivado" : "Cupo restaurado",
    });
  });
}

// ── Lecturas ─────────────────────────────────────────────────────────────

export async function listInventory() {
  const rows = await prisma.pendingInventory.findMany({
    where: { archivedAt: null },
    orderBy: { purchaseDate: "desc" },
    include: {
      seller: { select: { name: true } },
      destination: { select: { name: true, color: true } },
      hotel: { select: { name: true } },
      payments: true,
      assignments: { where: { reversed: false } },
    },
  });

  const clock = systemClock(env.APP_TIMEZONE);
  const today = clock.today();

  return rows.map((inv) => {
    const paid: Record<string, bigint> = {};
    for (const p of inv.payments) if (!p.voided) paid[p.currency] = (paid[p.currency] ?? 0n) + p.amount;
    const appliedInv: Record<string, bigint> = {};
    for (const a of inv.assignments)
      appliedInv[a.appliedCurrency] = (appliedInv[a.appliedCurrency] ?? 0n) + a.appliedAmount;
    const seatsAssigned = inv.assignments.reduce((s, a) => s + a.seats, 0);
    const available = fromMajorPaidMinusApplied(paid, appliedInv);

    return {
      id: inv.id,
      reference: inv.reference,
      seller: inv.seller.name,
      destination: inv.destination.name,
      color: inv.destination.color,
      hotel: inv.hotel?.name ?? null,
      purchaseDate: inv.purchaseDate,
      travelDate: inv.travelDate,
      seats: inv.seats,
      seatsAssigned,
      seatsLeft: inv.seats - seatsAssigned,
      state: inv.state,
      amount: formatMoney(money(inv.amount, inv.currency), { withCode: true }),
      currency: inv.currency,
      paidFormatted: Object.entries(paid).map(([c, v]) => formatMoney(money(v, c), { withCode: true })).join(" · ") || "—",
      availableFormatted:
        Object.entries(available).map(([c, v]) => formatMoney(money(v, c), { withCode: true })).join(" · ") || "—",
      expiringSoon:
        !!inv.travelDate &&
        ["disponible", "parcialmente_asignado"].includes(inv.state) &&
        inv.travelDate >= today,
    };
  });
}

function fromMajorPaidMinusApplied(
  paid: Record<string, bigint>,
  applied: Record<string, bigint>,
): Record<string, bigint> {
  const out: Record<string, bigint> = { ...paid };
  for (const [c, v] of Object.entries(applied)) out[c] = (out[c] ?? 0n) - v;
  return out;
}

export async function getInventoryDetail(id: string) {
  const inv = await prisma.pendingInventory.findUnique({
    where: { id },
    include: {
      seller: true,
      destination: true,
      hotel: true,
      payments: { orderBy: { valueDate: "asc" } },
      assignments: {
        orderBy: { createdAt: "asc" },
        include: { contract: { select: { number: true, client: { select: { fullName: true } } } } },
      },
    },
  });
  if (!inv) throw new NotFoundError("cupo");
  return inv;
}
