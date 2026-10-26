import "server-only";
import { z } from "zod";
import { prisma } from "@/core/db/prisma";
import { writeAudit } from "@/core/audit/audit";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { createSession, destroySession, type SessionUser } from "@/core/auth/session";
import { DomainError, ValidationError } from "@/core/errors";
import { loginLimiter } from "@/core/auth/rate-limit";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});

export async function login(
  input: unknown,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<SessionUser> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Datos inválidos", z.flattenError(parsed.error).fieldErrors);
  }
  const { email, password } = parsed.data;

  // Límite de intentos: 5 fallos por correo o por IP → bloqueo de 15 minutos.
  const keys = [`email:${email}`, ...(meta.ip ? [`ip:${meta.ip}`] : [])];
  const lockedMs = loginLimiter.lockedForMs(...keys);
  if (lockedMs > 0) {
    throw new DomainError(
      `Demasiados intentos fallidos. Espera ${Math.ceil(lockedMs / 60_000)} minuto(s) e inténtalo de nuevo.`,
      "RATE_LIMITED",
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Verificación en tiempo ~constante: siempre corre argon2 aunque no exista.
  const hash =
    user?.passwordHash ??
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000";
  const valid = await verifyPassword(hash, password);

  if (!user || !valid || !user.active) {
    loginLimiter.recordFailure(...keys);
    throw new DomainError("Correo o contraseña incorrectos, o usuario inactivo.", "AUTH_FAILED");
  }

  loginLimiter.recordSuccess(keys[0]);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, meta);

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function logout(userId?: string): Promise<void> {
  await destroySession();
  if (userId) {
    await writeAudit(prisma, {
      entityType: "user",
      entityId: userId,
      action: "logout",
      userId,
      summary: "Cierre de sesión",
    });
  }
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Escribe tu contraseña actual"),
    newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export async function changePassword(user: SessionUser, input: unknown): Promise<void> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Datos inválidos", z.flattenError(parsed.error).fieldErrors);
  }
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row) throw new DomainError("Usuario no encontrado");

  const ok = await verifyPassword(row.passwordHash, parsed.data.currentPassword);
  if (!ok) throw new DomainError("La contraseña actual no es correcta", "AUTH_FAILED");

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Invalida el resto de sesiones del usuario tras el cambio.
    await tx.session.deleteMany({ where: { userId: user.id } });
    await writeAudit(tx, {
      entityType: "user",
      entityId: user.id,
      action: "change_password",
      userId: user.id,
      summary: "Cambio de contraseña (sesiones invalidadas)",
    });
  });
}
