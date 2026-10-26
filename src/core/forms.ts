import { getCurrentUser, type SessionUser } from "@/core/auth";
import { fail, ok, type ActionResult } from "@/core/errors";

/** Convierte un FormData a objeto plano (checkbox → boolean). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) {
      out[k] = v;
      continue;
    }
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Envuelve la lógica de una Server Action: obtiene el usuario, ejecuta y
 * normaliza el resultado/errores. Nunca filtra un error técnico a la UI.
 */
export async function runAction<T>(
  fn: (user: SessionUser) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar.", code: "NO_SESSION" };
    const data = await fn(user);
    return ok(data);
  } catch (e) {
    return fail(e);
  }
}
