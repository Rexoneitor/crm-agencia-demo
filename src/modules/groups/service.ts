import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { fromMajor, formatMoney, money } from "@/core/money/money";
import { systemClock } from "@/core/time/clock";
import { deriveContract, rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { uploadDocument } from "@/modules/documents/service";
import { groupPaymentSchema, groupSchema } from "./schema";

function parse(input: unknown) {
  const r = groupSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  return r.data;
}

export async function listGroups(opts: { includeArchived?: boolean } = {}) {
  return prisma.contractGroup.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contracts: true } } },
  });
}

/** Grupo + sus contratos con precio, liquidado y saldo (mismo cálculo que la lista de contratos). */
export async function getGroupDetail(id: string) {
  const group = await prisma.contractGroup.findUnique({ where: { id } });
  if (!group) throw new NotFoundError("grupo");

  const rows = await prisma.contract.findMany({
    where: { groupId: id },
    include: {
      ...contractViewInclude,
      client: { select: { fullName: true } },
      destination: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const config = rulesConfigFromSettings(await getSettingsMap());
  const clock = systemClock(env.APP_TIMEZONE);

  const contracts = rows.map((c) => {
    const d = deriveContract(toContractView(c), config, clock);
    return {
      id: c.id,
      number: c.number,
      client: c.client.fullName,
      destination: c.destination.name,
      currency: c.currency,
      price: formatMoney(money(c.priceAmount, c.currency), { withCode: true }),
      balance: formatMoney(d.balance, { withCode: true }),
      balanceAmount: d.balance.amount,
      paymentState: d.paymentState,
      archived: c.archivedAt != null,
    };
  });

  return { group, contracts };
}

/** Alta rápida (§ patrón de catálogos): id existente o nombre nuevo. */
export async function resolveGroup(
  user: SessionUser,
  input: { groupId?: string; groupNew?: string },
): Promise<string | null> {
  if (input.groupId) return input.groupId;
  if (input.groupNew && input.groupNew.trim()) {
    const created = await createGroup(user, { name: input.groupNew.trim() });
    return created.id;
  }
  return null;
}

export async function createGroup(user: SessionUser, input: unknown) {
  assertCan(user, "master.manage");
  const data = parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.contractGroup.create({
      data: { name: data.name, notes: data.notes || null, createdBy: user.id },
    });
    await writeAudit(tx, {
      entityType: "contract_group",
      entityId: created.id,
      action: "create",
      userId: user.id,
      after: created,
      summary: `Grupo de viaje creado: ${created.name}`,
    });
    return created;
  });
}

export async function archiveGroup(user: SessionUser, id: string, archived: boolean) {
  assertCan(user, "master.manage");
  const before = await prisma.contractGroup.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("grupo");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contractGroup.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      entityType: "contract_group",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before,
      after: updated,
      summary: archived ? `Grupo archivado: ${before.name}` : `Grupo restaurado: ${before.name}`,
    });
    return updated;
  });
}

/** Añade o quita un contrato de un grupo directamente desde la pantalla del grupo. */
export async function setContractGroup(user: SessionUser, contractId: string, groupId: string | null) {
  assertCan(user, "contract.edit");
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new NotFoundError("contrato");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contractId },
      data: { groupId, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: contractId,
      action: "update",
      userId: user.id,
      before: { groupId: contract.groupId },
      after: { groupId },
      summary: groupId ? "Añadido a un grupo de viaje" : "Quitado de su grupo de viaje",
    });
    return updated;
  });
}

/**
 * Un pago, repartido entre varios contratos del mismo grupo (RN-13: cada
 * asiento sigue en la moneda de su propio contrato; aquí sólo se permiten
 * contratos cuya moneda coincide con `receivedCurrency`). Un solo comprobante
 * queda enlazado a todos los asientos creados. No es una entidad financiera
 * nueva: es N asientos `pago_recibido` normales, etiquetados con el mismo
 * `groupPaymentId` para poder verlos juntos.
 */
export async function registerGroupPayment(
  user: SessionUser,
  input: unknown,
  receipt?: File | null,
) {
  assertCan(user, "payment.register");
  const r = groupPaymentSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Revisa los datos del pago", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const group = await prisma.contractGroup.findUnique({ where: { id: data.groupId } });
  if (!group) throw new NotFoundError("grupo");

  const pairs = data.contractId
    .map((id, i) => ({ contractId: id, major: Number(data.receivedMajor[i] ?? 0) }))
    .filter((p) => p.contractId && p.major > 0);
  if (pairs.length === 0) {
    throw new ValidationError("Reparte el monto entre al menos un contrato", {
      contractId: ["Indica cuánto recibe cada contrato"],
    });
  }

  const contracts = await prisma.contract.findMany({
    where: { id: { in: pairs.map((p) => p.contractId) }, groupId: data.groupId },
  });
  if (contracts.length !== pairs.length) {
    throw new ValidationError("Alguno de los contratos ya no pertenece a este grupo");
  }
  for (const c of contracts) {
    if (c.currency !== data.receivedCurrency) {
      throw new ValidationError(
        `${c.number} está en ${c.currency}: regístralo aparte con "Registrar pago" en ese contrato.`,
      );
    }
    if (c.lifecycleState === "cancelado") {
      throw new ConflictError(`${c.number} está cancelado: no se le pueden registrar pagos.`);
    }
  }
  const byId = new Map(contracts.map((c) => [c.id, c]));

  const groupPaymentId = `gp_${data.groupId.slice(0, 8)}_${Date.now().toString(36)}`;
  const entryIds: string[] = [];
  let totalReceived = 0n;

  await prisma.$transaction(async (tx) => {
    for (const p of pairs) {
      const contract = byId.get(p.contractId)!;
      const received = fromMajor(p.major, data.receivedCurrency);
      // Misma moneda que el contrato: aplicado = recibido, tasa 1.
      const created = await tx.ledgerEntry.create({
        data: {
          contractId: p.contractId,
          kind: "pago_recibido",
          valueDate: data.valueDate,
          receivedAmount: received.amount,
          receivedCurrency: received.currency,
          appliedAmount: received.amount,
          appliedCurrency: contract.currency,
          reference: data.reference || null,
          method: data.method ?? null,
          reason: data.notes || null,
          groupPaymentId,
          createdById: user.id,
        },
      });
      entryIds.push(created.id);
      totalReceived += received.amount;
      await writeAudit(tx, {
        entityType: "contract",
        entityId: p.contractId,
        action: "payment",
        userId: user.id,
        after: { entryId: created.id, received: received.amount.toString(), groupPaymentId },
        summary: `Pago de grupo "${group.name}" — ${formatMoney(received, { withCode: true })} (repartido entre ${pairs.length} contrato(s))`,
      });
    }
  });

  if (receipt && receipt.size > 0) {
    await prisma.$transaction(async (tx) => {
      // Un solo documento; un Receipt por cada asiento creado (Receipt no exige 1:1 con Document).
      const doc = await uploadDocument(
        user,
        { file: receipt, kind: "comprobante", entityType: "contract_group", entityId: data.groupId },
        tx,
      );
      for (const entryId of entryIds) {
        await tx.receipt.create({ data: { ledgerEntryId: entryId, documentId: doc.id } });
      }
    });
  }

  return {
    groupPaymentId,
    count: pairs.length,
    total: formatMoney(money(totalReceived, data.receivedCurrency), { withCode: true }),
  };
}
