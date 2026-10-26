import { z } from "zod";
import { isPlainDate } from "@/core/time/clock";
import { PAYMENT_METHOD } from "@/core/domain/enums";

const plainDate = z.string().refine(isPlainDate, "Fecha inválida (YYYY-MM-DD)");

export const inventorySchema = z.object({
  sellerId: z.string().min(1, "Selecciona el vendedor"),
  purchaseDate: plainDate,
  destinationId: z.string().min(1, "Selecciona el destino"),
  hotelId: z.string().optional().or(z.literal("")),
  travelDate: plainDate.optional().or(z.literal("")),
  seats: z.coerce.number().int().positive("Debe haber al menos un cupo"),
  amountMajor: z.coerce.number().positive("El valor debe ser mayor que cero"),
  currency: z.string().min(3).default("COP"),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const inventoryPaymentSchema = z.object({
  pendingInventoryId: z.string().min(1),
  valueDate: plainDate,
  amountMajor: z.coerce.number().positive(),
  currency: z.string().min(3),
  method: z.enum(PAYMENT_METHOD).optional(),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

/** Asignar un cupo a un contrato (RN-14). */
export const assignInventorySchema = z.object({
  pendingInventoryId: z.string().min(1),
  contractId: z.string().min(1, "Selecciona el contrato"),
  seats: z.coerce.number().int().positive(),
  /** Importe a aplicar al contrato, en unidades mayores de la moneda del contrato. */
  appliedMajor: z.coerce.number().positive(),
  exchangeRate: z.string().optional().or(z.literal("")),
  valueDate: plainDate,
});

export const reverseAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
  reason: z.string().trim().min(5, "El motivo es obligatorio"),
});
