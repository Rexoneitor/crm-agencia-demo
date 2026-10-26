/**
 * Límite de intentos de inicio de sesión (en memoria; basta con un solo servidor).
 * 5 fallos seguidos para la misma clave (correo o IP) → bloqueo de 15 minutos.
 * Un inicio de sesión correcto limpia el contador del correo. Al reiniciarse el
 * servidor (Render lo duerme tras 15 min sin uso) los contadores se reinician:
 * es aceptable porque un bloqueo dura lo mismo que la siesta.
 */
export interface LimiterOptions {
  maxFailures: number;
  lockMs: number;
  now?: () => number;
}

interface Entry {
  failures: number;
  lockedUntil: number;
}

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly lockMs: number;
  private readonly now: () => number;

  constructor(opts: LimiterOptions = { maxFailures: 5, lockMs: 15 * 60_000 }) {
    this.maxFailures = opts.maxFailures;
    this.lockMs = opts.lockMs;
    this.now = opts.now ?? Date.now;
  }

  /** Milisegundos que faltan para que se levante el bloqueo (0 si no está bloqueado). */
  lockedForMs(...keys: string[]): number {
    const t = this.now();
    let max = 0;
    for (const k of keys) {
      const e = this.entries.get(k);
      if (e && e.lockedUntil > t) max = Math.max(max, e.lockedUntil - t);
    }
    return max;
  }

  recordFailure(...keys: string[]): void {
    const t = this.now();
    this.sweep(t);
    for (const k of keys) {
      const prev = this.entries.get(k);
      // Un bloqueo ya vencido empieza de cero.
      const base = prev && prev.lockedUntil !== 0 && prev.lockedUntil <= t ? undefined : prev;
      const failures = (base?.failures ?? 0) + 1;
      this.entries.set(k, {
        failures,
        lockedUntil: failures >= this.maxFailures ? t + this.lockMs : (base?.lockedUntil ?? 0),
      });
    }
  }

  recordSuccess(...keys: string[]): void {
    for (const k of keys) this.entries.delete(k);
  }

  private sweep(t: number) {
    if (this.entries.size < 500) return;
    for (const [k, e] of this.entries) if (e.lockedUntil !== 0 && e.lockedUntil <= t) this.entries.delete(k);
  }
}

export const loginLimiter = new LoginLimiter();
