import { z } from "zod";
import { isPlainDate } from "@/core/time/clock";
import {
  CONTRACT_MODALITY,
  PAYMENT_METHOD,
  REFUND_CHANNEL,
  REFUND_REASON,
  REFUND_STATE,
  TRIP_TYPE,
} from "@/core/domain/enums";

const plainDate = z.string().refine(isPlainDate, "Fecha inválida (YYYY-MM-DD)");
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optMajor = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().min(0, "No puede ser negativo").optional(),
);

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/**
 * Datos del contrato que se crea AL VUELO cuando el reembolso es de un contrato
 * que todavía no está cargado (campos con prefijo `nc`). Solo se leen si
 * `newContract` está marcado y no se eligió un contrato existente.
 */
const newContractFields = {
  newContract: checkbox.optional(),
  /** Marca el contrato (existente o recién creado) como cancelado. */
  cancelContract: checkbox.optional(),
  ncDestinationId: optText(60),
  ncDestinationNew: optText(80),
  ncSellerId: optText(60),
  ncSellerNew: optText(80),
  ncTripType: z.enum(TRIP_TYPE).optional().or(z.literal("")),
  ncModality: z.enum(CONTRACT_MODALITY).optional().or(z.literal("")),
  ncVigenciaStart: optText(10),
  ncVigenciaEnd: optText(10),
  ncTravelDate: optText(10),
  ncReturnDate: optText(10),
  ncSaleDate: optText(10),
  ncPriceMajor: optMajor,
  ncPaidMajor: optMajor,
  ncAdults: optMajor,
  ncChildren: optMajor,
};

/** Alta / edición de una solicitud de reembolso. */
export const refundSchema = z.object({
  contractId: z.string().optional().or(z.literal("")),
  groupId: z.string().optional().or(z.literal("")),
  clientName: z.string().trim().min(2, "Indica quién pide la devolución"),
  clientDoc: optText(40),
  contactEmail: optText(120),
  contactPhone: optText(40),
  people: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(200).optional(),
  ),
  requestedAt: plainDate,
  channel: z.enum(REFUND_CHANNEL),
  reasonCode: z.enum(REFUND_REASON),
  reason: z.string().trim().min(5, "Describe brevemente el motivo"),
  dueDate: plainDate.optional().or(z.literal("")),
  currency: z.string().min(3).default("COP"),
  requestedMajor: optMajor,
  agreedMajor: optMajor,
  emailThread: optText(500),
  notes: optText(4000),
  ...newContractFields,
});
export type RefundInput = z.infer<typeof refundSchema>;

/** Cambio de estado con nota (p. ej. "enviado a operaciones", "rechazado porque…"). */
export const refundStateSchema = z.object({
  refundId: z.string().min(1),
  state: z.enum(REFUND_STATE),
  note: optText(1000),
});

/** Pago (total o parcial) de un reembolso al cliente. */
export const refundPaymentSchema = z.object({
  refundId: z.string().min(1),
  paidDate: plainDate,
  amountMajor: z.coerce.number().positive("El monto debe ser mayor que cero"),
  method: z.enum(PAYMENT_METHOD).optional(),
  reference: optText(120),
  notes: optText(1000),
});

export const voidRefundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(5, "El motivo de la anulación es obligatorio"),
});
