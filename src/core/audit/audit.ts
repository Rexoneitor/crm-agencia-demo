import type { Tx } from "@/core/db/prisma";
import { prisma } from "@/core/db/prisma";

/**
 * Registro de auditoría transversal. Toda escritura relevante llama a
 * `writeAudit` DENTRO de la misma transacción que hace el cambio, de modo
 * que no exista modificación sin rastro (ARQUITECTURA.md §17, prompt §38).
 */
export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
  summary?: string;
}

/** Serializa a JSON tratando BigInt como string. */
function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

export async function writeAudit(
  client: Tx | typeof prisma,
  input: AuditInput,
): Promise<void> {
  await client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId ?? null,
      before: safeJson(input.before),
      after: safeJson(input.after),
      summary: input.summary,
    },
  });
}
