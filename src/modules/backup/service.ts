import "server-only";
import { pruneExpiredSessions } from "@/core/auth/session";

/**
 * Versión web: NO hay respaldos en disco. Render no guarda archivos (su disco
 * se borra en cada reinicio) y los datos viven en Neon (copias automáticas con
 * historial de restauración) y Supabase Storage. Para llevarse una copia propia:
 * Sistema → «Descargar TODO en un Excel».
 *
 * El código de respaldos locales (carpeta con crm.db + files) sigue en git en la
 * rama de la versión del PC.
 */
export const BACKUP_DISABLED_MESSAGE =
  "Los respaldos los hace Neon automáticamente; descarga el Excel completo desde Exportar.";

/** Limpieza diaria ligera de sesiones vencidas (sustituye al respaldo perezoso). */
let lastPrune = 0;
export async function maybeAutoBackup(): Promise<void> {
  const now = Date.now();
  if (now - lastPrune < 6 * 3_600_000) return;
  lastPrune = now;
  await pruneExpiredSessions().catch(() => {});
}
