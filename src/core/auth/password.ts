import { hash, verify } from "@node-rs/argon2";

/**
 * Hashing de contraseñas con Argon2id y parámetros actuales
 * (ARQUITECTURA.md §17). Nunca se guarda ni se registra la contraseña en claro.
 */
const OPTIONS = {
  // OWASP 2024: m=19456 (19 MiB), t=2, p=1
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
