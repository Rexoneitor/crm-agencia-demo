import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { destinationSchema } from "./schema";
import { sortActiveThenName } from "@/core/sort";

export async function listDestinations(opts: { includeArchived?: boolean } = {}) {
  return sortActiveThenName(await prisma.destination.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { hotels: true, contracts: true } } },
  }));
}

export async function getDestination(id: string) {
  const d = await prisma.destination.findUnique({ where: { id } });
  if (!d) throw new NotFoundError("destino");
  return d;
}

function parse(input: unknown) {
  const r = destinationSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  }
  return r.data;
}

export async function createDestination(user: SessionUser, input: unknown) {
  assertCan(user, "master.manage");
  const data = parse(input);
  const dup = await prisma.destination.findUnique({ where: { name: data.name } });
  if (dup) throw new ConflictError(`Ya existe un destino llamado "${data.name}".`);

  return prisma.$transaction(async (tx) => {
    const created = await tx.destination.create({
      data: { ...data, notes: data.notes || null },
    });
    await writeAudit(tx, {
      entityType: "destination",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Destino creado: ${created.name}`,
    });
    return created;
  });
}

export async function updateDestination(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "master.manage");
  const data = parse(input);
  const before = await getDestination(id);
  const dup = await prisma.destination.findFirst({
    where: { name: data.name, id: { not: id } },
  });
  if (dup) throw new ConflictError(`Ya existe un destino llamado "${data.name}".`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.destination.update({
      where: { id },
      data: { ...data, notes: data.notes || null },
    });
    await writeAudit(tx, {
      entityType: "destination",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
      summary: `Destino actualizado: ${updated.name}`,
    });
    return updated;
  });
}

export async function archiveDestination(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "master.manage");
  const before = await getDestination(id);

  if (archived) {
    const inUse = await prisma.contract.count({
      where: { destinationId: id, archivedAt: null },
    });
    if (inUse > 0) {
      throw new ConflictError(
        `No se puede archivar este destino: tiene ${inUse} contrato(s) asociado(s). Márcalo como inactivo si solo quieres ocultarlo de las listas.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.destination.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "destination",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}
