import "server-only";
import { prisma } from "@/core/db/prisma";
import type { Tx } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth";
import { DomainError, ValidationError } from "@/core/errors";
import { storage } from "@/core/adapters/storage";
import { ACCEPTED_MIME } from "@/core/ports/storage";
import { getSetting } from "@/modules/settings/service";
import { DOCUMENT_KIND, type DocumentKind } from "@/core/domain/enums";


export interface UploadInput {
  file: File;
  kind: DocumentKind;
  entityType: string;
  entityId: string;
}

/** Sube un documento y lo asocia a una entidad. Valida MIME real y tamaño. */
export async function uploadDocument(
  user: SessionUser,
  input: UploadInput,
  tx?: Tx,
): Promise<{ id: string; storagePath: string; sha256: string }> {
  const client = tx ?? prisma;
  const { file, kind, entityType, entityId } = input;

  if (!DOCUMENT_KIND.includes(kind)) {
    throw new ValidationError(`Tipo de documento inválido: ${kind}`);
  }
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    throw new ValidationError("Solo se aceptan archivos PDF, JPG o PNG.");
  }
  const maxMb = await getSetting<number>("documents.maxSizeMb");
  if (file.size > maxMb * 1024 * 1024) {
    throw new ValidationError(`El archivo supera el máximo de ${maxMb} MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storage.save({
    bytes,
    originalName: file.name,
    mimeType: file.type,
  });

  // Detección de duplicado exacto en la misma entidad (mismo hash).
  const dup = await client.document.findFirst({
    where: { entityType, entityId, sha256: stored.sha256, archivedAt: null },
  });

  const doc = await client.document.create({
    data: {
      kind,
      originalName: file.name.slice(0, 255),
      storagePath: stored.storagePath,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      mimeType: stored.mimeType,
      entityType,
      entityId,
      createdBy: user.id,
    },
  });

  await writeAudit(client, {
    entityType,
    entityId,
    action: "document_added",
    userId: user.id,
    after: { documentId: doc.id, kind, name: file.name, duplicateOf: dup?.id ?? null },
    summary: `Documento adjuntado: ${file.name}${dup ? " (posible duplicado)" : ""}`,
  });

  return { id: doc.id, storagePath: doc.storagePath, sha256: doc.sha256 };
}

export async function listDocuments(entityType: string, entityId: string) {
  return prisma.document.findMany({
    where: { entityType, entityId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function archiveDocument(user: SessionUser, id: string) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new DomainError("Documento no encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      entityType: doc.entityType,
      entityId: doc.entityId,
      action: "document_archived",
      userId: user.id,
      before: { documentId: id, name: doc.originalName },
      summary: `Documento archivado: ${doc.originalName}`,
    });
  });
  await storage.softDelete(doc.storagePath).catch(() => {});
}

export async function readDocumentForDownload(id: string) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.archivedAt) throw new DomainError("Documento no disponible");
  const bytes = await storage.read(doc.storagePath);
  return { bytes, mimeType: doc.mimeType, name: doc.originalName };
}
