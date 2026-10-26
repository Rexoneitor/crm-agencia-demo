/**
 * Orden alfabético estable en español (sin distinguir mayúsculas ni tildes de
 * forma "rara"). En la versión web la base es PostgreSQL (Neon), cuyo orden por
 * defecto es binario («Zoe» antes que «ana», «Álvaro» al final); por eso los
 * listados de nombres se ordenan aquí, con la misma regla en cualquier base.
 */
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function compareEs(a: string | null | undefined, b: string | null | undefined): number {
  return collator.compare(a ?? "", b ?? "");
}

/** Copia ordenada por la clave de texto. `Array.prototype.sort` es estable. */
export function sortEs<T>(rows: readonly T[], key: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((x, y) => compareEs(key(x), key(y)));
}

/** Igual que `sortEs`, pero sobre una promesa de consulta. */
export async function sortedEs<T>(rows: Promise<T[]>, key: (row: T) => string | null | undefined): Promise<T[]> {
  return sortEs(await rows, key);
}

/** Primero los activos y luego por nombre (como `orderBy: [{active:"desc"},{name:"asc"}]`). */
export function sortActiveThenName<T extends { active: boolean; name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((x, y) => Number(y.active) - Number(x.active) || compareEs(x.name, y.name));
}
