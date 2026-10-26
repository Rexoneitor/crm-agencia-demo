import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth";
import { ValidationError } from "@/core/errors";

const noteSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  content: z.string().trim().min(1, "La nota no puede estar vacía").max(4000),
  pinned: z.boolean().default(false),
  priority: z.enum(["normal", "alta"]).default("normal"),
});

export async function addNote(user: SessionUser, input: unknown) {
  const r = noteSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Nota inválida", z.flattenError(r.error).fieldErrors);
  const data = r.data;
  return prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        content: data.content,
        pinned: data.pinned,
        priority: data.priority,
        author: user.name,
      },
    });
    await writeAudit(tx, {
      entityType: data.entityType,
      entityId: data.entityId,
      action: "note_added",
      userId: user.id,
      summary: `Nota añadida`,
    });
    return note;
  });
}

const noteEditSchema = z.object({
  content: z.string().trim().min(1, "La nota no puede estar vacía").max(4000),
  pinned: z.coerce.boolean().default(false),
  priority: z.enum(["normal", "alta"]).default("normal"),
});

export async function updateNote(user: SessionUser, id: string, input: unknown) {
  const r = noteEditSchema.safeParse(input);
  if (!r.success) throw new ValidationError("Nota inválida", z.flattenError(r.error).fieldErrors);
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) throw new ValidationError("La nota no existe");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.note.update({
      where: { id },
      data: { content: r.data.content, pinned: r.data.pinned, priority: r.data.priority },
    });
    await writeAudit(tx, {
      entityType: note.entityType,
      entityId: note.entityId,
      action: "note_updated",
      userId: user.id,
      summary: "Nota editada",
    });
    return updated;
  });
}

export async function archiveNote(user: SessionUser, id: string) {
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return;
  await prisma.$transaction(async (tx) => {
    await tx.note.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      entityType: note.entityType,
      entityId: note.entityId,
      action: "note_archived",
      userId: user.id,
      summary: "Nota archivada",
    });
  });
}
