import type { Tx } from "@/core/db/prisma";

/**
 * Número amigable de contrato: CTR-YYYY-NNNNNN, con secuencia por año y
 * unicidad garantizada por la columna `Contract.number @unique` + el Counter.
 * DEBE llamarse dentro de la misma transacción que crea el contrato.
 */
export async function nextContractNumber(
  tx: Tx,
  prefix: string,
  year: number,
): Promise<string> {
  const key = `contract:${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
