import { z } from "zod";
import { isPlainDate } from "@/core/time/clock";
import { PAYMENT_METHOD } from "@/core/domain/enums";

const plainDate = z.string().refine(isPlainDate, "Fecha inválida (YYYY-MM-DD)");

/** Registro de un pago recibido (RN-11: no montos negativos). */
export const registerPaymentSchema = z
  .object({
    contractId: z.string().min(1),
    valueDate: plainDate,
    /** Importe recibido, en unidades mayores de la moneda de recepción. */
    receivedMajor: z.coerce.number().positive("El monto debe ser mayor que cero"),
    receivedCurrency: z.string().min(3),
    method: z.enum(PAYMENT_METHOD).optional(),
    reference: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    installmentId: z.string().optional().or(z.literal("")),
    /** Si la moneda recibida ≠ moneda del contrato: tasa y (opcional) importe aplicado. */
    exchangeRate: z.string().optional().or(z.literal("")),
    appliedMajorOverride: z.coerce.number().positive().optional(),
    /**
     * Con este pago el contrato queda saldado: lo que falte respecto al precio
     * se anota como `comision_retenida` (el vendedor cobró su parte directamente).
     */
    settleRetainedCommission: z.coerce.boolean().default(false),
  });

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/** Anulación de un asiento (RN-11): con motivo, sin borrado físico. */
export const voidEntrySchema = z.object({
  entryId: z.string().min(1),
  reason: z.string().trim().min(5, "El motivo de la anulación es obligatorio"),
});

/** Edición de un asiento de pago (corregir un error de tecleo). Queda auditado. */
export const editEntrySchema = z.object({
  entryId: z.string().min(1),
  valueDate: plainDate,
  receivedMajor: z.coerce.number().positive("El monto debe ser mayor que cero"),
  receivedCurrency: z.string().min(3),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  method: z.enum(PAYMENT_METHOD).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  exchangeRate: z.string().optional().or(z.literal("")),
  appliedMajorOverride: z.coerce.number().positive().optional(),
});

/** Marcar liquidado: escribe un asiento `comision_retenida` por el saldo. */
export const markLiquidatedSchema = z.object({
  contractId: z.string().min(1),
  reason: z.string().trim().min(5, "Indica el motivo (p. ej. comisión retenida por el vendedor)"),
});

/** Descuento o castigo autorizado. */
export const adjustmentSchema = z.object({
  contractId: z.string().min(1),
  kind: z.enum(["descuento", "castigo"]),
  amountMajor: z.coerce.number().positive("El monto debe ser mayor que cero"),
  reason: z.string().trim().min(5, "El motivo es obligatorio"),
  valueDate: plainDate,
});

/** Definición / edición del plan de cuotas. */
export const installmentPlanSchema = z.object({
  contractId: z.string().min(1),
  rows: z
    .array(
      z.object({
        dueDate: plainDate,
        amountMajor: z.coerce.number().positive(),
      }),
    )
    .min(1, "Define al menos una cuota"),
});

export const settleCommissionSchema = z.object({
  contractId: z.string().min(1),
  settledMajor: z.coerce.number().positive(),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});
