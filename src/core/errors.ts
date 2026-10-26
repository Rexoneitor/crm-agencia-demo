/**
 * Errores de dominio. La capa de presentación traduce estos a mensajes
 * legibles; nunca se muestra un error técnico crudo al usuario (prompt §55).
 */
export class DomainError extends Error {
  readonly code: string;
  constructor(message: string, code = "DOMAIN_ERROR") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  readonly fieldErrors?: Record<string, string[]>;
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, "VALIDATION");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super(`No se encontró: ${entity}`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT");
    this.name = "ConflictError";
  }
}

/** Resultado uniforme para Server Actions. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
  }
  if (error instanceof DomainError) {
    return { ok: false, error: error.message, code: error.code };
  }
  console.error("[action:error]", error);
  return {
    ok: false,
    error: "Ocurrió un error inesperado. Inténtalo de nuevo.",
    code: "UNKNOWN",
  };
}
