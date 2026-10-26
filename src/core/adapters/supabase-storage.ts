import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import {
  ACCEPTED_EXT,
  type SaveFileInput,
  type StoragePort,
  type StoredFile,
} from "@/core/ports/storage";
import { assertSafeStoragePath } from "./storage-path";

/**
 * Almacenamiento en Supabase Storage (bucket PRIVADO) para la versión web.
 * Mantiene la misma convención de rutas que el adaptador local
 * ({año}/{uuid}.{ext}; papelera en `_trash/…`), de modo que `Document.storagePath`
 * no cambia al migrar. La clave de servicio solo vive en el servidor.
 */
let client: SupabaseClient | null = null;

function bucket() {
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client.storage.from(env.SUPABASE_BUCKET);
}

export const supabaseStorage: StoragePort = {
  async save({ bytes, originalName, mimeType }: SaveFileInput): Promise<StoredFile> {
    const fallbackExt = (originalName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = ACCEPTED_EXT[mimeType] ?? (fallbackExt || "bin");
    const storagePath = `${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
    const { error } = await bucket().upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
    return {
      storagePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      mimeType,
    };
  },

  async read(storagePath: string): Promise<Buffer> {
    const { data, error } = await bucket().download(assertSafeStoragePath(storagePath));
    if (error || !data) throw new Error(`Archivo no encontrado: ${storagePath}`);
    return Buffer.from(await data.arrayBuffer());
  },

  async softDelete(storagePath: string): Promise<void> {
    const from = assertSafeStoragePath(storagePath);
    // Mueve a la papelera; si falla, el archivo se conserva donde está.
    await bucket().move(from, `_trash/${from}`).catch(() => {});
  },

  async signAccess(storagePath: string): Promise<string> {
    const { data, error } = await bucket().createSignedUrl(assertSafeStoragePath(storagePath), 300);
    if (error || !data) throw new Error("No se pudo firmar el acceso al archivo");
    return data.signedUrl;
  },

  async exists(storagePath: string): Promise<boolean> {
    const { data, error } = await bucket().exists(assertSafeStoragePath(storagePath));
    return !error && data === true;
  },
};
