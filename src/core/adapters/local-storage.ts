import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { env } from "@/config/env";
import {
  ACCEPTED_EXT,
  type SaveFileInput,
  type StoragePort,
  type StoredFile,
} from "@/core/ports/storage";

/**
 * Implementación local del puerto de almacenamiento.
 * Estructura: data/files/{año}/{uuid}.{ext}  (§14).
 * Papelera:   data/files/_trash/{año}/{uuid}.{ext}
 */
const ROOT = path.resolve(process.cwd(), env.FILES_DIR);

function resolveSafe(storagePath: string): string {
  const full = path.resolve(ROOT, storagePath);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) {
    throw new Error("Ruta de archivo fuera del directorio permitido");
  }
  return full;
}

export const localStorage: StoragePort = {
  async save({ bytes, originalName, mimeType }: SaveFileInput): Promise<StoredFile> {
    const ext =
      ACCEPTED_EXT[mimeType] ??
      (path.extname(originalName).replace(".", "").toLowerCase() || "bin");
    const year = String(new Date().getUTCFullYear());
    const relDir = path.join(year);
    const rel = path.join(relDir, `${randomUUID()}.${ext}`);
    const abs = resolveSafe(rel);

    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);

    return {
      storagePath: rel.split(path.sep).join("/"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      mimeType,
    };
  },

  async read(storagePath: string): Promise<Buffer> {
    return readFile(resolveSafe(storagePath));
  },

  async softDelete(storagePath: string): Promise<void> {
    const abs = resolveSafe(storagePath);
    const trashRel = path.join("_trash", storagePath);
    const trashAbs = resolveSafe(trashRel);
    await mkdir(path.dirname(trashAbs), { recursive: true });
    await rename(abs, trashAbs).catch(() => {});
  },

  async signAccess(storagePath: string): Promise<string> {
    // En local: endpoint autenticado. El id real se resuelve por Document.
    return `/api/files?path=${encodeURIComponent(storagePath)}`;
  },

  async exists(storagePath: string): Promise<boolean> {
    try {
      await access(resolveSafe(storagePath));
      return true;
    } catch {
      return false;
    }
  },
};
