import "server-only";
import { cache } from "react";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import { assertCan, type SessionUser } from "@/core/auth";
import { SETTING_DEFS, SETTING_DEFS_BY_KEY, type SettingDef } from "./defaults";

/** Valor efectivo de una clave: BD si existe, si no el default. */
function parseValue(raw: string, type: SettingDef["type"]): unknown {
  switch (type) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true";
    case "json":
      return JSON.parse(raw);
    default:
      return raw;
  }
}

function serializeValue(value: unknown, type: SettingDef["type"]): string {
  if (type === "json") return JSON.stringify(value);
  return String(value);
}

export interface EffectiveSetting {
  key: string;
  value: unknown;
  type: SettingDef["type"];
  group: string;
  label: string;
  isDefault: boolean;
}

/** Devuelve TODA la configuración efectiva (defaults + overrides de BD). */
export async function getAllSettings(): Promise<EffectiveSetting[]> {
  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return SETTING_DEFS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      type: def.type,
      group: def.group,
      label: def.label,
      value: row ? parseValue(row.value, def.type) : def.value,
      isDefault: !row,
    };
  });
}

/**
 * Mapa clave→valor efectivo, para el motor de reglas.
 * Memoizado por petición (React `cache`): varios servicios lo piden en la
 * misma request y no tiene sentido consultar la tabla `Setting` cada vez.
 */
export const getSettingsMap = cache(async (): Promise<Record<string, unknown>> => {
  const all = await getAllSettings();
  return Object.fromEntries(all.map((s) => [s.key, s.value]));
});

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const def = SETTING_DEFS_BY_KEY[key];
  if (!def) throw new Error(`Setting desconocido: ${key}`);
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row ? parseValue(row.value, def.type) : def.value) as T;
}

export async function updateSettings(
  user: SessionUser,
  updates: Record<string, unknown>,
): Promise<void> {
  assertCan(user, "settings.manage");
  const before = await getSettingsMap();

  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(updates)) {
      const def = SETTING_DEFS_BY_KEY[key];
      if (!def) continue;
      await tx.setting.upsert({
        where: { key },
        create: {
          key,
          value: serializeValue(value, def.type),
          type: def.type,
          group: def.group,
          label: def.label,
          updatedBy: user.id,
        },
        update: { value: serializeValue(value, def.type), updatedBy: user.id },
      });
    }
    await writeAudit(tx, {
      entityType: "settings",
      entityId: "global",
      action: "update",
      userId: user.id,
      before,
      after: { ...before, ...updates },
      summary: `Configuración actualizada: ${Object.keys(updates).join(", ")}`,
    });
  });
}

/** Inserta los defaults que aún no existan (idempotente, usado por el seed). */
export async function ensureSettingDefaults(): Promise<void> {
  const existing = new Set((await prisma.setting.findMany({ select: { key: true } })).map((r) => r.key));
  const missing = SETTING_DEFS.filter((d) => !existing.has(d.key));
  if (missing.length === 0) return;
  await prisma.setting.createMany({
    data: missing.map((d) => ({
      key: d.key,
      value: serializeValue(d.value, d.type),
      type: d.type,
      group: d.group,
      label: d.label,
    })),
  });
}
