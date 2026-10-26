import "server-only";
import { env } from "@/config/env";
import type { StoragePort } from "@/core/ports/storage";
import { localStorage } from "./local-storage";
import { supabaseStorage } from "./supabase-storage";

/**
 * Almacenamiento activo, según STORAGE_DRIVER (`local` por defecto, `supabase`
 * en la versión web). Todo el código de negocio importa `storage` de aquí.
 */
export const storage: StoragePort = env.STORAGE_DRIVER === "supabase" ? supabaseStorage : localStorage;
