import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { hotelSchema } from "./schema";
import { sortActiveThenName } from "@/core/sort";

export async function listHotels(opts: { includeArchived?: boolean; destinationId?: string } = {}) {
  return sortActiveThenName(await prisma.hotel.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.destinationId ? { destinationId: opts.destinationId } : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      destination: { select: { name: true, color: true } },
      _count: { select: { contracts: true } },
    },
  }));
}

function parse(input: unknown) {
  const r = hotelSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  }
  return r.data;
}

async function get(id: string) {
  const h = await prisma.hotel.findUnique({ where: { id } });
  if (!h) throw new NotFoundError("hotel");
  return h;
}

export async function createHotel(user: SessionUser, input: unknown) {
  assertCan(user, "master.manage");
  const data = parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.hotel.create({
      data: { ...data, city: data.city || null, country: data.country || null, notes: data.notes || null },
    });
    await writeAudit(tx, {
      entityType: "hotel",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Hotel creado: ${created.name}`,
    });
    return created;
  });
}

export async function updateHotel(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "master.manage");
  const data = parse(input);
  const before = await get(id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.hotel.update({
      where: { id },
      data: { ...data, city: data.city || null, country: data.country || null, notes: data.notes || null },
    });
    await writeAudit(tx, {
      entityType: "hotel",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function archiveHotel(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "master.manage");
  const before = await get(id);
  if (archived) {
    const inUse = await prisma.contract.count({ where: { hotelId: id, archivedAt: null } });
    if (inUse > 0) {
      throw new ConflictError(
        `No se puede archivar este hotel: tiene ${inUse} contrato(s) asociado(s).`,
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.hotel.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "hotel",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}

/** Alta rápida durante la creación de contrato (prompt §31). */
export async function quickCreateHotel(
  user: SessionUser,
  destinationId: string,
  name: string,
) {
  return createHotel(user, { name, destinationId, active: true });
}
