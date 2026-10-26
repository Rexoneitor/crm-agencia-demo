import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { fromMajor, toMajorNumber, money } from "@/core/money/money";
import { sellerSchema } from "./schema";
import { sortActiveThenName } from "@/core/sort";

export async function listSellers(opts: { includeArchived?: boolean } = {}) {
  return sortActiveThenName(await prisma.seller.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { contracts: true } } },
  }));
}

async function get(id: string) {
  const s = await prisma.seller.findUnique({ where: { id } });
  if (!s) throw new NotFoundError("vendedor");
  return s;
}

function parse(input: unknown) {
  const r = sellerSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  }
  return r.data;
}

/** Normaliza commissionValue: % tal cual; fijo → unidades mínimas. */
function normalizeCommission(data: z.infer<typeof sellerSchema>) {
  const value =
    data.commissionKind === "fixed"
      ? fromMajor(data.commissionValue, data.commissionCurrency).amount.toString()
      : data.commissionValue;
  return { ...data, commissionValue: value };
}

/** Presenta commissionValue de vuelta en unidades mayores si es fijo. */
export function displayCommissionValue(s: {
  commissionKind: string;
  commissionValue: string;
  commissionCurrency: string;
}): string {
  if (s.commissionKind === "fixed") {
    return String(toMajorNumber(money(BigInt(s.commissionValue || "0"), s.commissionCurrency)));
  }
  return s.commissionValue;
}

export async function createSeller(user: SessionUser, input: unknown) {
  assertCan(user, "master.manage");
  const data = normalizeCommission(parse(input));
  return prisma.$transaction(async (tx) => {
    const created = await tx.seller.create({
      data: {
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        active: data.active,
        retainsCommission: data.retainsCommission,
        commissionKind: data.commissionKind,
        commissionValue: data.commissionValue,
        commissionCurrency: data.commissionCurrency,
        notes: data.notes || null,
      },
    });
    await writeAudit(tx, {
      entityType: "seller",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Vendedor creado: ${created.name}`,
    });
    return created;
  });
}

export async function updateSeller(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "master.manage");
  const data = normalizeCommission(parse(input));
  const before = await get(id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.seller.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        active: data.active,
        retainsCommission: data.retainsCommission,
        commissionKind: data.commissionKind,
        commissionValue: data.commissionValue,
        commissionCurrency: data.commissionCurrency,
        notes: data.notes || null,
      },
    });
    await writeAudit(tx, {
      entityType: "seller",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function archiveSeller(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "master.manage");
  const before = await get(id);
  if (archived) {
    const inUse = await prisma.contract.count({
      where: { sellerId: id, archivedAt: null, lifecycleState: { in: ["borrador", "activo"] } },
    });
    if (inUse > 0) {
      throw new ConflictError(
        `Este vendedor tiene ${inUse} contrato(s) vivo(s). Márcalo como inactivo en lugar de archivarlo.`,
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.seller.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "seller",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}
