import "server-only";
import { redirect } from "next/navigation";
import { readSession, type SessionUser } from "./session";

export type { SessionUser } from "./session";

/**
 * Capacidades (permisos por acción). El modelo se estructura por capacidad
 * desde ya (ARQUITECTURA.md §17) para que añadir roles sea configuración.
 */
export const CAPABILITIES = [
  "contract.create",
  "contract.edit",
  "contract.cancel",
  "contract.delete",
  "contract.resolve_exception",
  "reservation.confirm",
  "reservation.reschedule",
  "payment.register",
  "payment.void",
  "payment.delete",
  "payment.edit",
  "contract.mark_liquidated",
  "inventory.manage",
  "inventory.assign",
  "master.manage",
  "settings.manage",
  "users.manage",
  "backup.create",
  "backup.restore",
  "export.run",
  "import.run",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<string, Capability[] | "*"> = {
  admin: "*",
  standard: [
    "contract.create",
    "contract.edit",
    "reservation.confirm",
    "reservation.reschedule",
    "payment.register",
    "inventory.manage",
    "inventory.assign",
    "master.manage",
    "export.run",
  ],
};

export function can(user: SessionUser | null, capability: Capability): boolean {
  if (!user) return false;
  const caps = ROLE_CAPABILITIES[user.role];
  if (!caps) return false;
  return caps === "*" || caps.includes(capability);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return readSession();
}

/** Exige sesión; redirige a /login si no hay. Para páginas y layouts. */
export async function requireUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect("/login");
  return user;
}

export class AuthorizationError extends Error {
  constructor(capability: Capability) {
    super(`No tienes permiso para: ${capability}`);
    this.name = "AuthorizationError";
  }
}

/**
 * Comprobación de autorización EN EL SERVICIO (no en la UI). Ocultar un botón
 * no es control de acceso: el servicio rechaza aunque la petición llegue directa.
 */
export function assertCan(user: SessionUser | null, capability: Capability): SessionUser {
  if (!user || !can(user, capability)) {
    throw new AuthorizationError(capability);
  }
  return user;
}
