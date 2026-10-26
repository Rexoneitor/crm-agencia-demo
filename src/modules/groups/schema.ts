import { z } from "zod";
import { isPlainDate } from "@/core/time/clock";
import { PAYMENT_METHOD } from "@/core/domain/enums";

const plainDate = z.string().refine(isPlainDate, "Fecha inválida (YYYY-MM-DD)");

/** Los inputs repetidos (una fila por contrato) llegan como string o array. */
const toArray = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]);

export const groupSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type GroupInput = z.infer<typeof groupSchema>;

/**
 * Pago repartido entre varios contratos del mismo grupo (una sola caja
 * recibida, un solo comprobante). `contractId[i]` / `receivedMajor[i]` son
 * filas paralelas — se registran los pares con importe > 0.
 */
export const groupPaymentSchema = z.object({
  groupId: z.string().min(1),
  valueDate: plainDate,
  receivedCurrency: z.string().min(3),
  method: z.enum(PAYMENT_METHOD).optional(),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  contractId: z.preprocess(toArray, z.array(z.string().min(1))),
  receivedMajor: z.preprocess(toArray, z.array(z.string())),
});

export type GroupPaymentInput = z.infer<typeof groupPaymentSchema>;
