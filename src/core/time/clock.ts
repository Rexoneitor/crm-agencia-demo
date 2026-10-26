import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Reloj inyectable. El motor de reglas NUNCA lee la hora del sistema
 * directamente (ARQUITECTURA.md §7): recibe un `Clock` como parámetro para
 * que los vencimientos se puedan probar de forma determinista.
 */
export interface Clock {
  /** Instante actual (UTC). */
  now(): Date;
  /** Fecha "pura" de hoy en la zona de la agencia, como "YYYY-MM-DD". */
  today(): PlainDate;
  /** Zona horaria IANA de operación. */
  timezone: string;
}

/** Fecha de calendario sin hora ni zona: "YYYY-MM-DD". */
export type PlainDate = string;

const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: unknown): value is PlainDate {
  return typeof value === "string" && PLAIN_DATE_RE.test(value) && isValid(parseISO(value));
}

export function assertPlainDate(value: string, field = "fecha"): PlainDate {
  if (!isPlainDate(value)) {
    throw new Error(`${field} debe tener formato YYYY-MM-DD (recibió "${value}")`);
  }
  return value;
}

/** Reloj real, anclado a una zona horaria. */
export function systemClock(timezone: string): Clock {
  return {
    timezone,
    now: () => new Date(),
    today: () => formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"),
  };
}

/** Reloj fijo para pruebas. */
export function fixedClock(isoDateTime: string, timezone = "America/Bogota"): Clock {
  const instant = new Date(isoDateTime);
  return {
    timezone,
    now: () => instant,
    today: () => formatInTimeZone(instant, timezone, "yyyy-MM-dd"),
  };
}

// ── Aritmética de fechas puras ────────────────────────────────────────────

export function plainDate(date: Date | string): PlainDate {
  if (typeof date === "string") return assertPlainDate(date);
  return format(date, "yyyy-MM-dd");
}

/** Suma (o resta, con negativos) días naturales a una fecha pura. */
export function addPlainDays(date: PlainDate, days: number): PlainDate {
  return format(addDays(parseISO(assertPlainDate(date)), days), "yyyy-MM-dd");
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return differenceInCalendarDays(
    parseISO(assertPlainDate(b)),
    parseISO(assertPlainDate(a)),
  );
}

export function comparePlain(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  const aa = assertPlainDate(a);
  const bb = assertPlainDate(b);
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

export function isBefore(a: PlainDate, b: PlainDate): boolean {
  return comparePlain(a, b) < 0;
}

export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return comparePlain(a, b) > 0;
}

export function isSameOrBefore(a: PlainDate, b: PlainDate): boolean {
  return comparePlain(a, b) <= 0;
}

export function isSameOrAfter(a: PlainDate, b: PlainDate): boolean {
  return comparePlain(a, b) >= 0;
}
