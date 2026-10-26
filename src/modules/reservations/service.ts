import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { isPlainDate, systemClock } from "@/core/time/clock";
import { rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { deriveContract } from "@/core/domain/rules";
import { formatMoney, money } from "@/core/money/money";

/** Confirmación de reserva (§4). Reversible pero deja rastro. */
export async function confirmReservation(user: SessionUser, contractId: string, confirm: boolean) {
  assertCan(user, "reservation.confirm");
  const reservation = await prisma.reservation.findUnique({
    where: { contractId },
    include: { contract: { select: { number: true, lifecycleState: true } } },
  });
  if (!reservation) throw new NotFoundError("reserva");
  if (reservation.contract.lifecycleState === "cancelado") {
    throw new ConflictError("El contrato está cancelado.");
  }

  const next = confirm ? "confirmada" : "pendiente_confirmacion";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.update({
      where: { contractId },
      data: {
        state: next,
        confirmedAt: confirm ? new Date() : null,
        confirmedBy: confirm ? user.id : null,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      entityType: "reservation",
      entityId: contractId,
      action: confirm ? "confirm" : "unconfirm",
      userId: user.id,
      before: { state: reservation.state },
      after: { state: next },
      summary: confirm
        ? `Reserva de ${reservation.contract.number} confirmada`
        : `Confirmación de reserva de ${reservation.contract.number} revertida`,
    });
    return updated;
  });
}

const rescheduleSchema = z
  .object({
    checkIn: z.string().refine(isPlainDate, "Fecha de entrada inválida"),
    checkOut: z.string().refine(isPlainDate, "Fecha de salida inválida"),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((d) => d.checkOut >= d.checkIn, {
    message: "La salida no puede ser anterior a la entrada",
    path: ["checkOut"],
  });

/**
 * Reprogramación (§4). Se edita la fecha de la reserva; el sistema recalcula
 * la fecha límite y reevalúa alertas (deriva, no almacena). Conserva el
 * valor anterior en el historial.
 */
export async function rescheduleReservation(user: SessionUser, contractId: string, input: unknown) {
  assertCan(user, "reservation.reschedule");
  const r = rescheduleSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors);
  const data = r.data;

  const reservation = await prisma.reservation.findUnique({
    where: { contractId },
    include: { contract: { select: { number: true } } },
  });
  if (!reservation) throw new NotFoundError("reserva");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.update({
      where: { contractId },
      data: {
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        state:
          reservation.state === "confirmada" ? "requiere_cambio_fecha" : reservation.state,
        confirmedAt: reservation.state === "confirmada" ? null : reservation.confirmedAt,
        version: { increment: 1 },
      },
    });
    // El contrato refleja la nueva fecha de viaje.
    await tx.contract.update({
      where: { id: contractId },
      data: { travelDate: data.checkIn, returnDate: data.checkOut, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entityType: "reservation",
      entityId: contractId,
      action: "reschedule",
      userId: user.id,
      before: { checkIn: reservation.checkIn, checkOut: reservation.checkOut },
      after: { checkIn: data.checkIn, checkOut: data.checkOut },
      summary: `Reserva de ${reservation.contract.number} reprogramada: ${reservation.checkIn} → ${data.checkIn}${data.reason ? ` (${data.reason})` : ""}`,
    });
    return updated;
  });
}

// ── Calendario ────────────────────────────────────────────────────────────

export interface CalendarReservation {
  contractId: string;
  number: string;
  client: string;
  clientShort: string;
  destination: string;
  destinationId: string;
  color: string;
  hotel: string | null;
  scope: string;
  sellerId: string | null;
  seller: string | null;
  checkIn: string;
  checkOut: string;
  state: string;
  paymentState: string;
  passengers: number;
  priceFormatted: string;
  balanceFormatted: string;
  group: string | null;
}

export interface CalendarFilters {
  from?: string;
  to?: string;
  destinationId?: string;
  hotelId?: string;
  scope?: string;
  sellerId?: string;
  confirmation?: "confirmada" | "pendiente";
  paymentState?: string;
  clientId?: string;
}

export async function getCalendarReservations(
  filters: CalendarFilters = {},
): Promise<CalendarReservation[]> {
  const rows = await prisma.contract.findMany({
    where: {
      archivedAt: null,
      reservation: {
        is: {
          // «desde» y «hasta» juntos (antes el segundo pisaba al primero).
          ...(filters.from || filters.to
            ? { checkIn: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
            : {}),
          ...(filters.confirmation === "confirmada" ? { state: "confirmada" } : {}),
          ...(filters.confirmation === "pendiente" ? { state: "pendiente_confirmacion" } : {}),
        },
      },
      ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
      ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters.scope ? { tripType: filters.scope } : {}),
      ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
    },
    include: {
      ...contractViewInclude,
      passengers: true,
      client: { select: { fullName: true } },
      destination: { select: { name: true, color: true } },
      hotel: { select: { name: true } },
      seller: { select: { name: true } },
      group: { select: { name: true } },
    },
  });

  const settings = await getSettingsMap();
  const config = rulesConfigFromSettings(settings);
  const clock = systemClock(env.APP_TIMEZONE);

  return rows
    .filter((c) => c.reservation)
    .map((c) => {
      const d = deriveContract(toContractView(c), config, clock);
      const p = c.passengers;
      const short = c.client.fullName.split(" ").slice(-1)[0] || c.client.fullName;
      return {
        contractId: c.id,
        number: c.number,
        client: c.client.fullName,
        clientShort: short,
        destination: c.destination.name,
        destinationId: c.destinationId,
        color: c.destination.color,
        hotel: c.hotel?.name ?? null,
        scope: c.tripType,
        sellerId: c.sellerId,
        seller: c.seller?.name ?? null,
        checkIn: c.reservation!.checkIn,
        checkOut: c.reservation!.checkOut,
        state: c.reservation!.state,
        paymentState: d.paymentState,
        passengers: p ? p.adults + p.children + p.infants : 0,
        priceFormatted: formatMoney(money(c.priceAmount, c.currency), { withCode: true }),
        balanceFormatted: formatMoney(d.balance, { withCode: true }),
        group: c.group?.name ?? null,
      };
    })
    .filter((c) => !filters.paymentState || c.paymentState === filters.paymentState)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
