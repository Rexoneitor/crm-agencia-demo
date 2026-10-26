import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { systemClock } from "@/core/time/clock";
import { formatMoney, money } from "@/core/money/money";
import { sortEs } from "@/core/sort";
import {
  deriveContract,
  rulesConfigFromSettings,
} from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { normalizeSearch } from "@/modules/search/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { clientSchema } from "./schema";

/**
 * Lista paginada de clientes. Antes devolvía solo los 100 primeros por orden alfabético
 * (hay ~380), sin avisar. La búsqueda no distingue tildes ni mayúsculas y acepta
 * cédula o teléfono con o sin puntos/espacios, o el N.º de contrato.
 */
export async function listClients(query?: string, paging: { page?: number; pageSize?: number } = {}) {
  const q = query?.trim();
  const pageSize = Math.min(500, Math.max(10, paging.pageSize ?? 100));
  const page = Math.max(1, Math.floor(paging.page ?? 1));

  let ids: string[] | null = null;
  if (q) {
    const words = normalizeSearch(q).split(" ").filter(Boolean);
    const qDigits = q.replace(/\D/g, "");
    const light = await prisma.client.findMany({
      where: { archivedAt: null },
      select: { id: true, fullName: true, documentId: true, phone: true, email: true, contracts: { select: { number: true } } },
    });
    const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    ids = light
      .filter((c) => {
        const hay = normalizeSearch(`${c.fullName} ${c.email ?? ""} ${c.documentId ?? ""} ${c.contracts.map((x) => x.number).join(" ")}`);
        if (words.every((w) => hay.includes(w))) return true;
        return qDigits.length >= 4 && [c.documentId, c.phone].some((n) => digits(n).includes(qDigits));
      })
      .map((c) => c.id);
  }
  const where = { archivedAt: null, ...(ids ? { id: { in: ids } } : {}) };
  // Orden alfabético en español: se ordena en memoria (la base web usa orden binario).
  const names = sortEs(await prisma.client.findMany({ where, select: { id: true, fullName: true } }), (c) => c.fullName);
  const total = names.length;
  const pageIds = names.slice((page - 1) * pageSize, page * pageSize).map((c) => c.id);
  const found = await prisma.client.findMany({
    where: { id: { in: pageIds } },
    include: { _count: { select: { contracts: true } } },
  });
  const byId = new Map(found.map((c) => [c.id, c]));
  const rows = pageIds.map((id) => byId.get(id)!).filter(Boolean);
  return { rows, total, page, pageSize };
}

/** Todos los clientes vigentes (id + nombre) para los selectores «transferir» y «duplicar». */
export async function listClientOptions() {
  return sortEs(
    await prisma.client.findMany({ where: { archivedAt: null }, select: { id: true, fullName: true } }),
    (c) => c.fullName,
  );
}

function parse(input: unknown) {
  const r = clientSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  }
  return r.data;
}

export async function createClient(user: SessionUser, input: unknown) {
  const data = parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        fullName: data.fullName,
        documentId: data.documentId || null,
        phone: data.phone || null,
        email: data.email || null,
        city: data.city || null,
        address: data.address || null,
        notes: data.notes || null,
        createdBy: user.id,
      },
    });
    await writeAudit(tx, {
      entityType: "client",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Cliente creado: ${created.fullName}`,
    });
    return created;
  });
}

export async function updateClient(user: SessionUser, id: string, input: unknown) {
  const data = parse(input);
  const before = await prisma.client.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("cliente");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id },
      data: {
        fullName: data.fullName,
        documentId: data.documentId || null,
        phone: data.phone || null,
        email: data.email || null,
        city: data.city || null,
        address: data.address || null,
        notes: data.notes || null,
      },
    });
    await writeAudit(tx, {
      entityType: "client",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function archiveClient(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "master.manage");
  const before = await prisma.client.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("cliente");
  if (archived) {
    const live = await prisma.contract.count({
      where: { clientId: id, archivedAt: null, lifecycleState: { in: ["borrador", "activo"] } },
    });
    if (live > 0) {
      throw new ConflictError(`El cliente tiene ${live} contrato(s) vivo(s); no se puede archivar.`);
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "client",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before,
      after: updated,
    });
    return updated;
  });
}

/** Ficha 360° del cliente. */
export async function getClientDetail(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contracts: {
        include: {
          ...contractViewInclude,
          destination: { select: { name: true, color: true } },
          hotel: { select: { name: true } },
          seller: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!client) throw new NotFoundError("cliente");

  const settings = await getSettingsMap();
  const config = rulesConfigFromSettings(settings);
  const clock = systemClock(env.APP_TIMEZONE);

  const contracts = client.contracts.map((c) => {
    const d = deriveContract(toContractView(c), config, clock);
    return {
      id: c.id,
      number: c.number,
      destination: c.destination.name,
      color: c.destination.color,
      hotel: c.hotel?.name ?? null,
      seller: c.seller?.name ?? null,
      modality: c.modality,
      lifecycleState: c.lifecycleState,
      reservationState: c.reservation?.state ?? null,
      travelDate: c.travelDate,
      price: formatMoney(money(c.priceAmount, c.currency), { withCode: true }),
      balance: formatMoney(d.balance, { withCode: true }),
      paymentState: d.paymentState,
      currency: c.currency,
      balanceMinor: d.balance.amount.toString(),
    };
  });

  const notes = await prisma.note.findMany({
    where: { entityType: "client", entityId: id, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const history = await prisma.auditLog.findMany({
    where: { entityType: "client", entityId: id },
    orderBy: { at: "desc" },
    take: 50,
    include: { user: { select: { name: true } } },
  });
  const documents = await prisma.document.findMany({
    where: { entityType: "client", entityId: id, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return { client, contracts, notes, history, documents };
}
