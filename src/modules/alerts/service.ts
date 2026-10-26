import "server-only";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { systemClock } from "@/core/time/clock";
import type { SessionUser } from "@/core/auth";
import { ValidationError } from "@/core/errors";
import {
  deriveAlerts,
  rulesConfigFromSettings,
  type DerivedAlert,
  type InventoryAlertView,
} from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { loadContractViews } from "@/modules/contracts/view";
import { label } from "@/core/domain/enums";

export interface ActiveAlert extends DerivedAlert {
  /** Estado de interacción persistido (leída / pospuesta / descartada). */
  interaction: "nueva" | "leida" | "pospuesta" | "descartada";
  snoozeUntil?: string | null;
}

/**
 * §13 — lista de alertas activas + su estado de interacción.
 * Memoizada por request: el layout la usa para el contador y el panel para la
 * lista; una sola derivación (con su `loadContractViews`) por petición.
 */
export const getActiveAlerts = cache(async (): Promise<ActiveAlert[]> => {
  const [settings, contracts, inventoryRows, interactions] = await Promise.all([
    getSettingsMap(),
    loadContractViews(),
    prisma.pendingInventory.findMany({
      where: { archivedAt: null, state: { in: ["disponible", "parcialmente_asignado"] } },
      include: { destination: true },
    }),
    prisma.alertState.findMany(),
  ]);

  const clock = systemClock(env.APP_TIMEZONE);
  const config = rulesConfigFromSettings(settings);
  const today = clock.today();

  const inventory: InventoryAlertView[] = inventoryRows.map((inv) => ({
    id: inv.id,
    state: inv.state,
    travelDate: inv.travelDate,
    label: `${inv.destination.name} · ${inv.seats} cupos`,
  }));

  const derived = deriveAlerts({ contracts, inventory }, config, clock);

  const byKey = new Map(
    interactions.map((i) => [
      `${i.alertType}|${i.entityType}|${i.entityId}|${i.referenceDate}`,
      i,
    ]),
  );

  return derived
    .map((a) => {
      const state = byKey.get(
        `${a.type}|${a.entityType}|${a.entityId}|${a.referenceDate}`,
      );
      const interaction = (state?.status ?? "nueva") as ActiveAlert["interaction"];
      return { ...a, interaction, snoozeUntil: state?.snoozeUntil ?? null };
    })
    .filter((a) => {
      if (a.interaction === "descartada") return false;
      if (a.interaction === "pospuesta" && a.snoozeUntil && a.snoozeUntil > today) {
        return false;
      }
      return true;
    });
});

export async function countActiveAlerts(): Promise<number> {
  return (await getActiveAlerts()).length;
}

export function alertTypeLabel(t: string): string {
  return label(t);
}

// ── Estado de interacción (§13) ──────────────────────────────────────────

const interactionSchema = z.object({
  alertType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  referenceDate: z.string().min(1),
  status: z.enum(["nueva", "leida", "pospuesta", "descartada"]),
  snoozeUntil: z.string().optional().or(z.literal("")),
});

/**
 * Persiste SOLO el estado de interacción del usuario con una alerta,
 * identificada por (tipo, entidad, fecha de referencia). La alerta en sí se
 * deriva; esto solo decide si se muestra.
 */
export async function setAlertInteraction(user: SessionUser, input: unknown) {
  const r = interactionSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Datos inválidos", z.flattenError(r.error).fieldErrors as Record<string, string[]>);
  }
  const d = r.data;
  await prisma.alertState.upsert({
    where: {
      alertType_entityType_entityId_referenceDate: {
        alertType: d.alertType,
        entityType: d.entityType,
        entityId: d.entityId,
        referenceDate: d.referenceDate,
      },
    },
    create: {
      alertType: d.alertType,
      entityType: d.entityType,
      entityId: d.entityId,
      referenceDate: d.referenceDate,
      status: d.status,
      snoozeUntil: d.snoozeUntil || null,
      updatedBy: user.id,
    },
    update: { status: d.status, snoozeUntil: d.snoozeUntil || null, updatedBy: user.id },
  });
}
