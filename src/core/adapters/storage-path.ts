/**
 * Valida una ruta interna de archivo (`storagePath`): relativa, con «/» como
 * separador y sin «..», segmentos vacíos ni barras invertidas. Pura y sin
 * dependencias de servidor, para poder probarla.
 */
export function assertSafeStoragePath(storagePath: string): string {
  if (
    !storagePath ||
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.includes("\0") ||
    storagePath.split("/").some((p) => p === ".." || p === "." || p === "")
  ) {
    throw new Error("Ruta de archivo no permitida");
  }
  return storagePath;
}
