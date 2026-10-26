import "server-only";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { systemClock } from "@/core/time/clock";
import { assertCan, type SessionUser } from "@/core/auth";
import { writeAudit } from "@/core/audit/audit";
import { NotFoundError } from "@/core/errors";
import { rulesConfigFromSettings } from "@/core/domain/rules";
import { label } from "@/core/domain/enums";
import { getSettingsMap } from "@/modules/settings/service";
import { quickInclude, toQuickContract, type QuickContract } from "@/modules/payments/quick";
import { scheduleTrip } from "@/modules/contracts/service";
import { rescheduleReservation } from "@/modules/reservations/service";

/**
 * Revisión rápida: cola de contratos con algo pendiente, para resolverlos uno tras otro
 * (¿ya viajó?, ¿confirmada?, vendedor, pagos, comprobantes, reembolso).
 */

export const REVIEW_FLAGS = {
  viaje_pasado: "Fecha de viaje pasada: ¿ya viajó?",
  por_confirmar: "Reserva por confirmar",
  sin_pagos: "Sin pagos",
  sin_vendedor: "Sin vendedor",
  sin_comprobante: "Pagos sin comprobante",
} as const;
export type ReviewFlag = keyof typeof REVIEW_FLAGS;
const ORDER = Object.keys(REVIEW_FLAGS) as ReviewFlag[];

export interface ReviewItem {
  id: string;
  number: string;
  client: string;
  phone: string | null;
  email: string | null;
  destination: string;
  hotel: string | null;
  seller: { id: string; name: string } | null;
  issuer: string;
  group: string | null;
  modality: string;
  vigencia: string | null;
  reservation: { checkIn: string; checkOut: string | null; state: string; stateLabel: string } | null;
  /** Datos de pago para el panel de comprobantes (mismo que «Subir comprobante»). */
  pay: QuickContract;
  refunds: { id: string; state: string }[];
  notes: string | null;
  flags: ReviewFlag[];
}

interface FlagInput {
  sellerId: string | null;
  priceAmount: bigint;
  reservation: { state: string; checkIn: string; checkOut: string | null } | null;
  /** Pagos recibidos vigentes, con cuántos comprobantes tiene cada uno. */
  payReceipts: number[];
}

/** Qué le falta a un contrato activo (misma regla para la cola y para los contadores del inicio). */
function flagsFor(c: FlagInput, today: string): ReviewFlag[] {
  const r = c.reservation;
  const flags: ReviewFlag[] = [];
  const end = r?.checkOut ?? r?.checkIn;
  if (r && r.state !== "cancelada" && r.state !== "finalizada" && end && end < today) flags.push("viaje_pasado");
  else if (r && (r.state === "pendiente_confirmacion" || r.state === "requiere_cambio_fecha")) flags.push("por_confirmar");
  if (!c.payReceipts.length && c.priceAmount > 0n) flags.push("sin_pagos");
  if (!c.sellerId) flags.push("sin_vendedor");
  if (c.payReceipts.some((n) => n === 0)) flags.push("sin_comprobante");
  return flags;
}

/**
 * Contadores para el inicio: cuántos contratos tienen cada pendiente. Consulta liviana
 * (sin libro completo ni cálculos de saldo): unas pocas decenas de milisegundos.
 */
export async function reviewCounts(): Promise<{ total: number; byFlag: Record<ReviewFlag, number> }> {
  const today = systemClock(env.APP_TIMEZONE).today();
  const rows = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: "activo" },
    select: {
      sellerId: true,
      priceAmount: true,
      reservation: { select: { state: true, checkIn: true, checkOut: true } },
      ledger: { where: { voided: false, kind: "pago_recibido" }, select: { _count: { select: { receipts: true } } } },
    },
  });
  const byFlag = Object.fromEntries(ORDER.map((f) => [f, 0])) as Record<ReviewFlag, number>;
  let total = 0;
  for (const c of rows) {
    const flags = flagsFor({ ...c, payReceipts: c.ledger.map((e) => e._count.receipts) }, today);
    if (flags.length) total++;
    for (const f of flags) byFlag[f]++;
  }
  return { total, byFlag };
}

export async function buildReviewQueue(): Promise<ReviewItem[]> {
  const clock = systemClock(env.APP_TIMEZONE);
  const today = clock.today();
  const config = rulesConfigFromSettings(await getSettingsMap());
  const rows = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: "activo" },
    include: {
      ...quickInclude,
      client: { select: { fullName: true, phone: true, email: true } },
      hotel: { select: { name: true } },
      group: { select: { name: true } },
      refunds: { select: { id: true, state: true } },
    },
    orderBy: { number: "asc" },
  });

  const items: ReviewItem[] = [];
  for (const c of rows) {
    const pays = c.ledger.filter((e) => !e.voided && e.kind === "pago_recibido");
    const r = c.reservation;
    const flags = flagsFor({ ...c, payReceipts: pays.map((e) => e.receipts.length) }, today);
    if (!flags.length) continue;

    items.push({
      id: c.id,
      number: c.number,
      client: c.client.fullName,
      phone: c.client.phone,
      email: c.client.email,
      destination: c.destination.name,
      hotel: c.hotel?.name ?? null,
      seller: c.seller ? { id: c.seller.id, name: c.seller.name } : null,
      issuer: c.issuer,
      group: c.group?.name ?? null,
      modality: label(c.modality),
      vigencia: c.vigenciaStart || c.vigenciaEnd ? `${c.vigenciaStart ?? "?"} → ${c.vigenciaEnd ?? "?"}` : null,
      reservation: r
        ? { checkIn: r.checkIn, checkOut: r.checkOut, state: r.state, stateLabel: label(r.state) }
        : null,
      pay: toQuickContract(c, config, clock),
      refunds: c.refunds,
      notes: c.notes,
      flags,
    });
  }
  // Primero lo más urgente (orden de las banderas), luego por fecha de viaje.
  const rank = (i: ReviewItem) => Math.min(...i.flags.map((f) => ORDER.indexOf(f)));
  return items.sort(
    (a, b) => rank(a) - rank(b) || (a.reservation?.checkIn ?? "9999").localeCompare(b.reservation?.checkIn ?? "9999"),
  );
}

export async function reviewSetSeller(user: SessionUser, contractId: string, sellerId: string) {
  assertCan(user, "contract.edit");
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c) throw new NotFoundError("contrato");
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contractId }, data: { sellerId: sellerId || null, version: { increment: 1 } } });
    await writeAudit(tx, {
      entityType: "contract",
      entityId: contractId,
      action: "update",
      userId: user.id,
      before: { sellerId: c.sellerId },
      after: { sellerId: sellerId || null },
      summary: "Vendedor cambiado desde «Revisión rápida».",
    });
  });
}

/** Pone las fechas del viaje: agenda si no había reserva, reprograma si ya había. */
export async function reviewSetDates(user: SessionUser, contractId: string, checkIn: string, checkOut: string) {
  const r = await prisma.reservation.findUnique({ where: { contractId } });
  if (!r) {
    const nights = Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000));
    return scheduleTrip(user, contractId, { travelDate: checkIn, returnDate: checkOut, days: nights + 1, nights });
  }
  return rescheduleReservation(user, contractId, { checkIn, checkOut, reason: "Cambio de fecha (Revisión rápida)" });
}
