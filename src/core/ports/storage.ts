/**
 * Puerto de almacenamiento de archivos (ARQUITECTURA.md §14).
 * La implementación local escribe en disco; la futura en la nube escribirá en
 * almacenamiento de objetos compatible con S3, SIN que ningún módulo de
 * negocio cambie.
 */
export interface StoredFile {
  /** Ruta/clave interna generada por el sistema (nunca el nombre original). */
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

export interface SaveFileInput {
  bytes: Buffer;
  originalName: string;
  mimeType: string;
}

export interface StoragePort {
  save(input: SaveFileInput): Promise<StoredFile>;
  read(storagePath: string): Promise<Buffer>;
  /** Borrado lógico: mueve a papelera interna, no destruye. */
  softDelete(storagePath: string): Promise<void>;
  /** Devuelve una URL/token de acceso temporal (en local, la ruta del endpoint). */
  signAccess(storagePath: string): Promise<string>;
  exists(storagePath: string): Promise<boolean>;
}

export const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ACCEPTED_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
