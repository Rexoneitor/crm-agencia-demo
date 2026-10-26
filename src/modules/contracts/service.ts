import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { fromMajor } from "@/core/money/money";
import { systemClock, isPlainDate } from "@/core/time/clock";
import { deriveContract, rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap, getSetting } from "@/modules/settings/service";
import { uploadDocument } from "@/modules/documents/service";
import { storage } from "@/core/adapters/storage";
import { createClient } from "@/modules/clients/service";
import { createSeller } from "@/modules/sellers/service";
import { createDestination } from "@/modules/destinations/service";
import { quickCreateHotel } from "@/modules/hotels/service";
import { createGroup, resolveGroup } from "@/modules/groups/service";

/** Colores para destinos creados al vuelo (no todos azules en el calendario). */
const DESTINATION_PALETTE = [
  "#2563eb", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#14b8a6",
];
function paletteColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return DESTINATION_PALETTE[Math.abs(h) % DESTINATION_PALETTE.length];
}
import {
  cancelContractSchema,
  contractEditSchema,
  contractSchema,
  resolveExceptionSchema,
  scheduleTripSchema,
} from "./schema";
import { nextContractNumber } from "./number";
import { toContractView, contractViewInclude } from "./view";

function parse(input: unknown) {
  const r = contractSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos del contrato", z.flattenError(r.error).fieldErrors);
  }
  return r.data;
}

/**
 * Alta de contrato (flujos §4). En UNA transacción:
 *  · genera número, congela días de anticipación (RN-02) y comisión (RN-09)
 *  · crea pasajeros
 *  · si es fecha_cerrada: crea reserva en `pendiente_confirmacion` (RN-04)
 *  · si es fecha_abierta: NO crea reserva (RN-05)
 *  · crea la fila de comisión esperada
 *  · escribe auditoría
 *  · adjunta el PDF si se pasó
 */
export async function createContract(
  user: SessionUser,
  input: unknown,
  pdf?: File | null,
): Promise<{ id: string; number: string }> {
  assertCan(user, "contract.create");
  const data = parse(input);

  // Resolver referencias: id existente o alta al vuelo (RN — sistema editable).
  // Reutiliza los servicios de catálogo (cada uno audita su creación).
  const clientId = data.clientId
    ? data.clientId
    : (await createClient(user, { fullName: (data.clientNew ?? "").trim() })).id;

  const sellerId = data.sellerId
    ? data.sellerId
    : data.sellerNew
      ? (await createSeller(user, { name: data.sellerNew.trim() })).id
      : null;

  const destinationId = data.destinationId
    ? data.destinationId
    : (
        await createDestination(user, {
          name: (data.destinationNew ?? "").trim(),
          scope: data.tripType,
          color: paletteColor((data.destinationNew ?? "").trim()),
        })
      ).id;

  const hotelId = data.hotelId
    ? data.hotelId
    : data.hotelNew
      ? (await quickCreateHotel(user, destinationId, data.hotelNew.trim())).id
      : null;

  const groupId = await resolveGroup(user, { groupId: data.groupId, groupNew: data.groupNew });

  const settings = await getSettingsMap();
  const config = rulesConfigFromSettings(settings);
  const prefix = await getSetting<string>("contract.numberPrefix");

  // Días de anticipación efectivos según tipo de viaje (se congelan).
  const leadDays = config.liquidationLeadDays[data.tripType];

  // Comisión: la del formulario o, si no, la del vendedor.
  let commissionKind = data.commissionKind ?? "percentage";
  let commissionValue = data.commissionValue ?? "0";
  let commissionCurrency = data.currency;
  if (sellerId) {
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new ValidationError("El vendedor seleccionado no existe");
    if (!data.commissionKind) {
      commissionKind = seller.commissionKind as "percentage" | "fixed";
      commissionValue = seller.commissionValue;
      commissionCurrency = seller.commissionCurrency;
    }
  }

  const price = fromMajor(data.priceMajor, data.currency);
  const year = new Date().getUTCFullYear();

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextContractNumber(tx, prefix, year);

    const contract = await tx.contract.create({
      data: {
        number,
        clientId,
        sellerId: sellerId || null,
        modality: data.modality,
        tripType: data.tripType,
        destinationId,
        hotelId: hotelId || null,
        groupId: groupId || null,
        issuer: data.issuer || "DEMO",
        saleDate: data.saleDate || null,
        vigenciaStart: data.modality === "fecha_abierta" ? data.vigenciaStart || null : null,
        vigenciaEnd: data.modality === "fecha_abierta" ? data.vigenciaEnd || null : null,
        travelDate: data.modality === "fecha_cerrada" ? data.travelDate || null : null,
        returnDate: data.modality === "fecha_cerrada" ? data.returnDate || null : null,
        days: data.days ?? null,
        nights: data.nights ?? null,
        priceAmount: price.amount,
        currency: data.currency,
        liquidationLeadDays: leadDays,
        commissionKind,
        commissionValue,
        commissionCurrency,
        commissionAccrual: config.commission.accrual,
        lifecycleState: "activo",
        createdBy: user.id,
        passengers: {
          create: {
            adults: data.adults,
            children: data.children,
            infants: data.infants,
            packs: data.packs,
          },
        },
        ...(data.modality === "fecha_cerrada" && data.travelDate
          ? {
              reservation: {
                create: {
                  checkIn: data.travelDate,
                  checkOut: data.returnDate || data.travelDate,
                  state: "pendiente_confirmacion",
                },
              },
            }
          : {}),
      },
    });

    // Comisión esperada (valor derivado congelado en la fila).
    if (sellerId) {
      const view = toContractView(
        await tx.contract.findUniqueOrThrow({
          where: { id: contract.id },
          include: contractViewInclude,
        }),
      );
      const expected = deriveContract(view, config, systemClock(env.APP_TIMEZONE)).expectedCommission;
      if (expected) {
        await tx.commission.create({
          data: {
            contractId: contract.id,
            sellerId,
            expectedAmount: expected.amount,
            currency: expected.currency,
            accrual: config.commission.accrual,
          },
        });
      }
    }

    await writeAudit(tx, {
      entityType: "contract",
      entityId: contract.id,
      action: "create",
      userId: user.id,
      after: {
        number,
        modality: data.modality,
        tripType: data.tripType,
        price: price.amount.toString(),
        currency: data.currency,
        liquidationLeadDays: leadDays,
      },
      summary: `Contrato ${number} creado (${data.modality})`,
    });

    return contract;
  });

  if (pdf && pdf.size > 0) {
    await uploadDocument(user, {
      file: pdf,
      kind: "contrato",
      entityType: "contract",
      entityId: created.id,
    }).catch((e) => {
      console.error("[contract:pdf] no se pudo adjuntar el PDF", e);
    });
  }

  return { id: created.id, number: created.number };
}

/** Edición de campos del contrato con bloqueo optimista (§22). */
export async function updateContract(
  user: SessionUser,
  id: string,
  input: unknown,
  expectedVersion: number,
) {
  assertCan(user, "contract.edit");
  const r = contractEditSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Revisa los campos", z.flattenError(r.error).fieldErrors);
  }
  const data = r.data as Record<string, unknown>;

  const before = await prisma.contract.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("contrato");
  if (before.version !== expectedVersion) {
    throw new ConflictError(
      "Otra persona modificó este contrato mientras lo editabas. Recarga la página y vuelve a intentarlo.",
    );
  }

  const patch: Record<string, unknown> = {};
  // Estos campos SÍ pueden quedar vacíos (se guardan como null).
  const nullableFields = [
    "sellerId",
    "hotelId",
    "saleDate",
    "travelDate",
    "vigenciaStart",
    "vigenciaEnd",
    "returnDate",
    "days",
    "nights",
    "notes",
  ] as const;
  for (const f of nullableFields) if (f in data) patch[f] = data[f] === "" ? null : data[f];
  // Estos NO pueden quedar vacíos: sólo se aplican si traen valor.
  for (const f of ["destinationId", "tripType", "liquidationLeadDays"] as const) {
    if (f in data && data[f] !== "" && data[f] != null) patch[f] = data[f];
  }
  if ("issuer" in data && data.issuer !== undefined) patch.issuer = data.issuer || "DEMO";
  if ("priceMajor" in data && data.priceMajor != null && String(data.priceMajor) !== "") {
    patch.priceAmount = fromMajor(Number(data.priceMajor), before.currency).amount;
  }
  // Comisión congelada: si viene, se corrige (% tal cual; fijo → minor units).
  if ("commissionKind" in data && data.commissionKind) {
    patch.commissionKind = data.commissionKind;
  }
  // Grupo de viaje: id existente, nombre nuevo, o vacío para quitarlo.
  if ("groupId" in data || "groupNew" in data) {
    patch.groupId = await resolveGroup(user, {
      groupId: data.groupId as string | undefined,
      groupNew: data.groupNew as string | undefined,
    });
  }
  if ("commissionValueMajor" in data && data.commissionValueMajor != null && data.commissionValueMajor !== "") {
    const kind = (patch.commissionKind ?? before.commissionKind) as string;
    patch.commissionValue =
      kind === "fixed"
        ? fromMajor(Number(data.commissionValueMajor), before.commissionCurrency).amount.toString()
        : String(data.commissionValueMajor);
  }
  // Si cambia el tipo de viaje y no se fijó a mano, recalcula días de anticipación.
  if (
    typeof patch.tripType === "string" &&
    patch.tripType !== before.tripType &&
    !("liquidationLeadDays" in data && data.liquidationLeadDays)
  ) {
    const cfg = rulesConfigFromSettings(await getSettingsMap());
    patch.liquidationLeadDays = cfg.liquidationLeadDays[patch.tripType as "nacional" | "internacional"];
  }

  const paxKeys = ["adults", "children", "infants", "packs"] as const;
  const paxPatch: Record<string, number> = {};
  for (const k of paxKeys) if (k in data && data[k] != null && data[k] !== "") paxPatch[k] = Number(data[k]);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.contract.update({
      where: { id },
      data: { ...patch, version: { increment: 1 } },
    });

    // Pasajeros (corrección puntual).
    if (Object.keys(paxPatch).length) {
      await tx.contractPassenger.upsert({
        where: { contractId: id },
        create: {
          contractId: id,
          adults: paxPatch.adults ?? 0,
          children: paxPatch.children ?? 0,
          infants: paxPatch.infants ?? 0,
          packs: paxPatch.packs ?? 1,
        },
        update: paxPatch,
      });
    }

    // Mantener la reserva en sintonía con las fechas del contrato.
    const newCheckIn = patch.travelDate as string | null | undefined;
    const newCheckOut = patch.returnDate as string | null | undefined;
    if ((newCheckIn || newCheckOut) && (await tx.reservation.findUnique({ where: { contractId: id } }))) {
      await tx.reservation.update({
        where: { contractId: id },
        data: {
          ...(newCheckIn ? { checkIn: newCheckIn } : {}),
          ...(newCheckIn || newCheckOut ? { checkOut: newCheckOut || newCheckIn || u.returnDate || u.travelDate! } : {}),
          version: { increment: 1 },
        },
      });
    }

    // Recalcular la comisión esperada si cambió la comisión o el precio.
    if (
      u.sellerId &&
      ("commissionKind" in patch || "commissionValue" in patch || "priceAmount" in patch)
    ) {
      const cfg = rulesConfigFromSettings(await getSettingsMap());
      const view = toContractView(
        await tx.contract.findUniqueOrThrow({ where: { id }, include: contractViewInclude }),
      );
      const expected = deriveContract(view, cfg, systemClock(env.APP_TIMEZONE)).expectedCommission;
      if (expected) {
        await tx.commission.upsert({
          where: { contractId: id },
          create: {
            contractId: id,
            sellerId: u.sellerId,
            expectedAmount: expected.amount,
            currency: expected.currency,
            accrual: cfg.commission.accrual,
          },
          update: { expectedAmount: expected.amount, currency: expected.currency },
        });
      }
    }

    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: "update",
      userId: user.id,
      before,
      after: u,
      summary: `Contrato ${u.number} editado`,
    });
    return u;
  });
  return updated;
}

/**
 * Traspaso de titular (§23.1) — el contrato pasa a otro cliente sin rehacerlo.
 * Los pagos, cuotas, documentos e historial van con el contrato. Queda
 * registrado quién era el titular anterior.
 */
export async function transferContract(
  user: SessionUser,
  id: string,
  input: { newClientId?: string; newClientName?: string },
) {
  assertCan(user, "contract.edit");
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!contract) throw new NotFoundError("contrato");

  const newClientId = input.newClientId
    ? input.newClientId
    : (await createClient(user, { fullName: (input.newClientName ?? "").trim() })).id;
  if (!newClientId) throw new ValidationError("Elige o escribe el nuevo titular");
  if (newClientId === contract.clientId) {
    throw new ConflictError("El contrato ya es de ese cliente.");
  }
  const newClient = await prisma.client.findUnique({ where: { id: newClientId } });
  if (!newClient) throw new NotFoundError("cliente");

  return prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id },
      data: {
        clientId: newClientId,
        transferredFromClientId: contract.clientId,
        transferredAt: new Date(),
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: "transfer",
      userId: user.id,
      before: { clientId: contract.clientId, client: contract.client.fullName },
      after: { clientId: newClientId, client: newClient.fullName },
      summary: `Titular cambiado: ${contract.client.fullName} → ${newClient.fullName}`,
    });
  });
}

/**
 * Duplicar un contrato (acompañantes del mismo viaje: destino, fechas, hotel
 * y vendedor iguales, cada quien con su propio contrato/cliente). No copia
 * pagos, documentos ni notas — es un contrato nuevo desde cero salvo los
 * datos del viaje.
 */
export async function duplicateContract(
  user: SessionUser,
  id: string,
  input: { clientId?: string; clientNew?: string; keepGroup?: boolean },
): Promise<{ id: string; number: string }> {
  assertCan(user, "contract.create");
  const original = await prisma.contract.findUnique({ where: { id }, include: { client: true } });
  if (!original) throw new NotFoundError("contrato");

  const clientId = input.clientId
    ? input.clientId
    : (await createClient(user, { fullName: (input.clientNew ?? "").trim() })).id;
  if (!clientId) throw new ValidationError("Elige o escribe el cliente del nuevo contrato");

  const keepGroup = input.keepGroup ?? true;
  let groupId: string | null = original.groupId;
  if (keepGroup && !groupId) {
    groupId = (
      await createGroup(user, { name: `${original.client.fullName} y familia` })
    ).id;
  } else if (!keepGroup) {
    groupId = null;
  }

  const settings = await getSettingsMap();
  const prefix = await getSetting<string>("contract.numberPrefix");
  const year = new Date().getUTCFullYear();

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextContractNumber(tx, prefix, year);
    // El contrato original entra al grupo recién creado, si aplica.
    if (keepGroup && groupId && !original.groupId) {
      await tx.contract.update({ where: { id: original.id }, data: { groupId, version: { increment: 1 } } });
    }
    const contract = await tx.contract.create({
      data: {
        number,
        clientId,
        sellerId: original.sellerId,
        modality: original.modality,
        tripType: original.tripType,
        destinationId: original.destinationId,
        hotelId: original.hotelId,
        saleDate: original.saleDate,
        vigenciaStart: original.vigenciaStart,
        vigenciaEnd: original.vigenciaEnd,
        travelDate: original.travelDate,
        returnDate: original.returnDate,
        days: original.days,
        nights: original.nights,
        priceAmount: original.priceAmount,
        currency: original.currency,
        liquidationLeadDays: original.liquidationLeadDays,
        commissionKind: original.commissionKind,
        commissionValue: original.commissionValue,
        commissionCurrency: original.commissionCurrency,
        commissionAccrual: original.commissionAccrual,
        groupId,
        issuer: original.issuer,
        lifecycleState: "activo",
        createdBy: user.id,
        passengers: { create: { adults: 2, children: 0, infants: 0, packs: 1 } },
        ...(original.modality === "fecha_cerrada" && original.travelDate
          ? {
              reservation: {
                create: {
                  checkIn: original.travelDate,
                  checkOut: original.returnDate || original.travelDate,
                  state: "pendiente_confirmacion",
                },
              },
            }
          : {}),
      },
    });

    if (original.sellerId) {
      const view = toContractView(
        await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include: contractViewInclude }),
      );
      const cfg = rulesConfigFromSettings(settings);
      const expected = deriveContract(view, cfg, systemClock(env.APP_TIMEZONE)).expectedCommission;
      if (expected) {
        await tx.commission.create({
          data: {
            contractId: contract.id,
            sellerId: original.sellerId,
            expectedAmount: expected.amount,
            currency: expected.currency,
            accrual: cfg.commission.accrual,
          },
        });
      }
    }

    await writeAudit(tx, {
      entityType: "contract",
      entityId: contract.id,
      action: "create",
      userId: user.id,
      after: { number, duplicatedFrom: original.number },
      summary: `Contrato duplicado de ${original.number}`,
    });
    return contract;
  });

  return { id: created.id, number: created.number };
}

/**
 * Programar viaje de un contrato de fecha abierta (§4). Crea la reserva
 * reutilizando los datos del contrato; a partir de aquí se comporta como
 * fecha cerrada.
 */
export async function scheduleTrip(user: SessionUser, contractId: string, input: unknown) {
  assertCan(user, "contract.edit");
  const r = scheduleTripSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { reservation: true },
  });
  if (!contract) throw new NotFoundError("contrato");
  if (contract.modality !== "fecha_abierta") {
    throw new ConflictError("Solo los contratos de fecha abierta se programan.");
  }
  if (contract.reservation) throw new ConflictError("El contrato ya tiene una reserva.");
  if (contract.vigenciaStart && data.travelDate < contract.vigenciaStart) {
    throw new ValidationError("La fecha de viaje está antes de la ventana de vigencia.");
  }
  if (contract.vigenciaEnd && data.travelDate > contract.vigenciaEnd) {
    throw new ValidationError("La fecha de viaje está después de la ventana de vigencia.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contractId },
      data: {
        // El cliente ya eligió fecha: el contrato pasa a fecha cerrada.
        modality: "fecha_cerrada",
        travelDate: data.travelDate,
        returnDate: data.returnDate || null,
        days: data.days ?? contract.days,
        nights: data.nights ?? contract.nights,
        version: { increment: 1 },
        reservation: {
          create: {
            checkIn: data.travelDate,
            checkOut: data.returnDate || data.travelDate,
            state: "pendiente_confirmacion",
          },
        },
      },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: contractId,
      action: "schedule_trip",
      userId: user.id,
      before: { modality: "fecha_abierta", travelDate: null },
      after: { modality: "fecha_cerrada", travelDate: data.travelDate, returnDate: data.returnDate || null },
      summary: `Contrato pasado a fecha cerrada — viaje programado para ${data.travelDate} (reserva pendiente de confirmación)`,
    });
    return updated;
  });
}

/** RN-16 — cancelación como acción con motivo y asientos opcionales. */
export async function cancelContract(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "contract.cancel");
  const r = cancelContractSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { reservation: true },
  });
  if (!contract) throw new NotFoundError("contrato");
  if (contract.lifecycleState === "cancelado") {
    throw new ConflictError("El contrato ya está cancelado.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id },
      data: {
        lifecycleState: "cancelado",
        cancellationReason: data.reason,
        cancellationCode: data.code,
        cancelledAt: new Date(),
        cancelledBy: user.id,
        version: { increment: 1 },
      },
    });
    if (contract.reservation && contract.reservation.state !== "cancelada") {
      await tx.reservation.update({
        where: { contractId: id },
        data: { state: "cancelada", version: { increment: 1 } },
      });
    }
    const today = systemClock(env.APP_TIMEZONE).today();
    if (data.refundMajor && data.refundMajor > 0) {
      const m = fromMajor(data.refundMajor, contract.currency);
      await tx.ledgerEntry.create({
        data: {
          contractId: id,
          kind: "reembolso",
          valueDate: today,
          receivedAmount: m.amount,
          receivedCurrency: contract.currency,
          appliedAmount: m.amount,
          appliedCurrency: contract.currency,
          reason: `Reembolso por cancelación: ${data.reason}`,
          createdById: user.id,
        },
      });
    }
    if (data.penaltyMajor && data.penaltyMajor > 0) {
      const m = fromMajor(data.penaltyMajor, contract.currency);
      await tx.ledgerEntry.create({
        data: {
          contractId: id,
          kind: "castigo",
          valueDate: today,
          receivedAmount: m.amount,
          receivedCurrency: contract.currency,
          appliedAmount: m.amount,
          appliedCurrency: contract.currency,
          reason: `Penalidad retenida por cancelación: ${data.reason}`,
          createdById: user.id,
        },
      });
    }
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: "cancel",
      userId: user.id,
      before: { lifecycleState: contract.lifecycleState },
      after: { lifecycleState: "cancelado", code: data.code },
      summary: `Contrato ${contract.number} cancelado — ${data.code}: ${data.reason}`,
    });
  });
}

/**
 * RN-12 — Archivar / restaurar un contrato (borrado lógico). Nada se borra
 * físicamente: el contrato sale de todas las listas pero se puede restaurar.
 * Un contrato archivado no genera alertas ni aparece en reportes.
 */
export async function archiveContract(
  user: SessionUser,
  id: string,
  archived: boolean,
  reason?: string,
) {
  assertCan(user, "contract.cancel");
  const before = await prisma.contract.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("contrato");

  return prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: archived ? "archive" : "restore",
      userId: user.id,
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: archived ? new Date().toISOString() : null },
      summary: archived
        ? `Contrato ${before.number} archivado${reason ? `: ${reason}` : ""}`
        : `Contrato ${before.number} restaurado`,
    });
  });
}

/**
 * Marca un contrato como «ya viajó» (finalizado) o lo devuelve a activo.
 * Finaliza también la reserva y deja de generar alertas de cobro.
 */
export async function markTraveled(user: SessionUser, id: string, traveled: boolean) {
  assertCan(user, "contract.cancel");
  const before = await prisma.contract.findUnique({ where: { id }, include: { reservation: true } });
  if (!before) throw new NotFoundError("contrato");
  if (before.lifecycleState === "cancelado") throw new ConflictError("El contrato está cancelado.");
  const target = traveled ? "finalizado" : "activo";
  if (before.lifecycleState === target) return;

  return prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id }, data: { lifecycleState: target, version: { increment: 1 } } });
    if (before.reservation) {
      if (traveled && before.reservation.state !== "finalizada" && before.reservation.state !== "cancelada") {
        await tx.reservation.update({ where: { contractId: id }, data: { state: "finalizada", version: { increment: 1 } } });
      } else if (!traveled && before.reservation.state === "finalizada") {
        await tx.reservation.update({ where: { contractId: id }, data: { state: "confirmada", version: { increment: 1 } } });
      }
    }
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: traveled ? "traveled" : "untraveled",
      userId: user.id,
      before: { lifecycleState: before.lifecycleState },
      after: { lifecycleState: target },
      summary: traveled ? `Contrato ${before.number} marcado como «ya viajó»` : `Contrato ${before.number} vuelve a activo`,
    });
  });
}

/**
 * Borrado DEFINITIVO de un contrato (§23 — acción destructiva de administración).
 *
 * A diferencia de archivar (reversible) o cancelar (conserva el contrato), esto
 * elimina el contrato y TODO lo que cuelga de él. Sólo `contract.delete`
 * (admin). Exige volver a escribir el número como confirmación. El rastro queda
 * en la bitácora de auditoría (AuditLog no tiene clave foránea al contrato).
 *
 * Los cupos asignados a este contrato se liberan y se recalcula su estado.
 */
export async function deleteContract(
  user: SessionUser,
  id: string,
  input: { confirmNumber?: string },
) {
  assertCan(user, "contract.delete");

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      _count: { select: { ledger: true, installments: true } },
      inventoryAssignments: { select: { pendingInventoryId: true } },
    },
  });
  if (!contract) throw new NotFoundError("contrato");

  if ((input.confirmNumber ?? "").trim() !== contract.number) {
    throw new ValidationError("Confirmación incorrecta", {
      confirmNumber: ["Escribe el número exacto del contrato para confirmar el borrado."],
    });
  }

  // Rutas de archivos (documentos + comprobantes de pago) para enviar a la
  // papelera interna DESPUÉS de que la transacción confirme.
  const [docs, receiptDocs] = await Promise.all([
    prisma.document.findMany({
      where: { entityType: "contract", entityId: id },
      select: { storagePath: true },
    }),
    prisma.document.findMany({
      where: { receipts: { some: { ledgerEntry: { contractId: id } } } },
      select: { storagePath: true },
    }),
  ]);
  const filePaths = [...new Set([...docs, ...receiptDocs].map((d) => d.storagePath))];
  const affectedInventories = [
    ...new Set(contract.inventoryAssignments.map((a) => a.pendingInventoryId)),
  ];

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: "delete",
      userId: user.id,
      before: {
        number: contract.number,
        priceAmount: contract.priceAmount.toString(),
        currency: contract.currency,
        lifecycleState: contract.lifecycleState,
      },
      summary:
        `Contrato ${contract.number} ELIMINADO definitivamente ` +
        `(${contract._count.ledger} movimiento(s) de dinero, ${contract._count.installments} cuota(s), ` +
        `${docs.length} documento(s)).`,
    });

    // 1) Ledger (los comprobantes Receipt caen por cascada desde LedgerEntry).
    await tx.ledgerEntry.deleteMany({ where: { contractId: id } });

    // 2) Asignaciones de cupo (ya sin asientos que las referencien).
    await tx.inventoryAssignment.deleteMany({ where: { contractId: id } });

    // 3) Recalcular el estado de cada cupo afectado.
    for (const invId of affectedInventories) {
      const inv = await tx.pendingInventory.findUnique({
        where: { id: invId },
        select: { seats: true, assignments: { where: { reversed: false }, select: { seats: true } } },
      });
      if (!inv) continue;
      const assigned = inv.assignments.reduce((s, a) => s + a.seats, 0);
      const state =
        assigned === 0 ? "disponible" : assigned >= inv.seats ? "asignado" : "parcialmente_asignado";
      await tx.pendingInventory.update({ where: { id: invId }, data: { state } });
    }

    // 4) Documentos, notas y estado de alertas (polimórficos: sin clave foránea).
    await tx.document.deleteMany({ where: { entityType: "contract", entityId: id } });
    await tx.note.deleteMany({ where: { entityType: "contract", entityId: id } });
    await tx.alertState.deleteMany({ where: { entityType: "contract", entityId: id } });

    // 5) El contrato: la cascada elimina pasajeros, reserva, cuotas y comisión.
    await tx.contract.delete({ where: { id } });
  });

  // Archivos a la papelera interna (no rompe el borrado si algo falla).
  for (const path of filePaths) {
    await storage.softDelete(path).catch(() => {});
  }

  return { number: contract.number };
}

/** RN-07 — resolución explícita de un contrato fuera de plazo. */
export async function resolveException(user: SessionUser, id: string, input: unknown) {
  assertCan(user, "contract.resolve_exception");
  const r = resolveExceptionSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const contract = await prisma.contract.findUnique({ where: { id }, include: { reservation: true } });
  if (!contract) throw new NotFoundError("contrato");

  return prisma.$transaction(async (tx) => {
    const patch: Record<string, unknown> = {
      exceptionResolution: data.resolution,
      version: { increment: 1 },
    };
    if (data.resolution === "fecha_extendida" && data.newTravelDate && isPlainDate(data.newTravelDate)) {
      patch.travelDate = data.newTravelDate;
      if (contract.reservation) {
        await tx.reservation.update({
          where: { contractId: id },
          data: { checkIn: data.newTravelDate, state: "requiere_cambio_fecha", version: { increment: 1 } },
        });
      }
    }
    if (data.resolution === "incumplido") patch.lifecycleState = "finalizado";
    await tx.contract.update({ where: { id }, data: patch });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: id,
      action: "resolve_exception",
      userId: user.id,
      after: { resolution: data.resolution, newTravelDate: data.newTravelDate || null },
      summary: `Excepción resuelta (${data.resolution}): ${data.reason}`,
    });
  });
}

/** Datos completos para la pantalla 360°. */
export async function getContractDetail(id: string) {
  const row = await prisma.contract.findUnique({
    where: { id },
    include: {
      ...contractViewInclude,
      passengers: true,
      client: true,
      transferredFromClient: { select: { fullName: true } },
      group: true,
      seller: true,
      destination: true,
      hotel: true,
      commission: true,
      ledger: {
        orderBy: { valueDate: "asc" },
        include: { createdBy: { select: { name: true } }, receipts: { include: { document: true } } },
      },
      installments: { orderBy: { sequence: "asc" } },
    },
  });
  if (!row) throw new NotFoundError("contrato");

  const settings = await getSettingsMap();
  const config = rulesConfigFromSettings(settings);
  const clock = systemClock(env.APP_TIMEZONE);
  const derived = deriveContract(toContractView(row), config, clock);

  const [documents, notes, history] = await Promise.all([
    prisma.document.findMany({
      where: { entityType: "contract", entityId: id, archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: { entityType: "contract", entityId: id, archivedAt: null },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
    prisma.auditLog.findMany({
      where: { entityType: "contract", entityId: id },
      orderBy: { at: "desc" },
      take: 100,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return { contract: row, derived, documents, notes, history };
}

export type ContractDetail = Awaited<ReturnType<typeof getContractDetail>>;
