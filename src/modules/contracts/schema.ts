import { z } from "zod";
import {
  CANCELLATION_CODE,
  COMMISSION_KIND,
  CONTRACT_MODALITY,
  EXCEPTION_RESOLUTION,
  TRIP_TYPE,
} from "@/core/domain/enums";
import { isPlainDate } from "@/core/time/clock";

const plainDate = z
  .string()
  .refine((v) => v === "" || isPlainDate(v), "Fecha inválida (YYYY-MM-DD)");

const optText = z.string().trim().optional().or(z.literal(""));

export const contractSchema = z
  .object({
    // Cada referencia: o un id existente, o un nombre nuevo a crear al vuelo.
    clientId: optText,
    clientNew: optText,
    sellerId: optText,
    sellerNew: optText,
    modality: z.enum(CONTRACT_MODALITY),
    tripType: z.enum(TRIP_TYPE),
    destinationId: optText,
    destinationNew: optText,
    hotelId: optText,
    hotelNew: optText,
    // Grupo de viaje (varias personas, mismo viaje) — opcional.
    groupId: optText,
    groupNew: optText,

    saleDate: plainDate.optional().or(z.literal("")),

    // fecha_abierta
    vigenciaStart: plainDate.optional().or(z.literal("")),
    vigenciaEnd: plainDate.optional().or(z.literal("")),

    // fecha_cerrada
    travelDate: plainDate.optional().or(z.literal("")),
    returnDate: plainDate.optional().or(z.literal("")),

    days: z.coerce.number().int().min(0).optional(),
    nights: z.coerce.number().int().min(0).optional(),

    // Dinero: el usuario teclea en unidades mayores; el servicio convierte.
    priceMajor: z.coerce.number().min(0, "El precio no puede ser negativo"),
    currency: z.string().min(3).default("COP"),

    // Pasajeros
    adults: z.coerce.number().int().min(0).default(2),
    children: z.coerce.number().int().min(0).default(0),
    infants: z.coerce.number().int().min(0).default(0),
    packs: z.coerce.number().int().min(1).default(1),

    // Comisión (si no se pasa, se toma la del vendedor)
    commissionKind: z.enum(COMMISSION_KIND).optional(),
    commissionValue: z.string().optional(),

    notes: z.string().trim().max(4000).optional().or(z.literal("")),
    issuer: z.string().trim().max(60).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    // Cliente y destino son obligatorios: id existente o nombre nuevo.
    if (!d.clientId && !d.clientNew) {
      ctx.addIssue({ code: "custom", path: ["client"], message: "Elige o escribe un cliente." });
    }
    if (!d.destinationId && !d.destinationNew) {
      ctx.addIssue({ code: "custom", path: ["destination"], message: "Elige o escribe un destino." });
    }

    // RN-10 — integridad temporal
    if (d.modality === "fecha_cerrada") {
      if (!d.travelDate) {
        ctx.addIssue({ code: "custom", path: ["travelDate"], message: "Un contrato de fecha cerrada exige fecha de viaje." });
      }
      if (d.travelDate && d.returnDate && d.returnDate < d.travelDate) {
        ctx.addIssue({ code: "custom", path: ["returnDate"], message: "La fecha de regreso no puede ser anterior a la de viaje." });
      }
    }
    if (d.modality === "fecha_abierta") {
      if (!d.vigenciaStart || !d.vigenciaEnd) {
        ctx.addIssue({ code: "custom", path: ["vigenciaEnd"], message: "Un contrato de fecha abierta exige ventana de vigencia." });
      }
      if (d.vigenciaStart && d.vigenciaEnd && d.vigenciaEnd < d.vigenciaStart) {
        ctx.addIssue({ code: "custom", path: ["vigenciaEnd"], message: "La fecha final de vigencia no puede ser anterior a la inicial." });
      }
    }
  });

export type ContractInput = z.infer<typeof contractSchema>;

/** Campos editables después del alta (edición puntual, no re-alta). */
export const contractEditSchema = z.object({
  sellerId: z.string().optional(),
  destinationId: z.string().optional(),
  hotelId: z.string().optional(),
  groupId: z.string().optional(),
  groupNew: z.string().optional(),
  tripType: z.enum(TRIP_TYPE).optional(),
  saleDate: plainDate.optional().or(z.literal("")),
  travelDate: plainDate.optional().or(z.literal("")),
  vigenciaStart: plainDate.optional().or(z.literal("")),
  vigenciaEnd: plainDate.optional().or(z.literal("")),
  returnDate: plainDate.optional().or(z.literal("")),
  days: z.coerce.number().int().min(0).optional(),
  nights: z.coerce.number().int().min(0).optional(),
  priceMajor: z.coerce.number().min(0).optional(),
  issuer: z.string().trim().max(60).optional(),
  liquidationLeadDays: z.coerce.number().int().min(0).optional(),
  // Pasajeros (corrección puntual)
  adults: z.coerce.number().int().min(0).optional(),
  children: z.coerce.number().int().min(0).optional(),
  infants: z.coerce.number().int().min(0).optional(),
  packs: z.coerce.number().int().min(1).optional(),
  // Comisión congelada (corrección puntual)
  commissionKind: z.enum(COMMISSION_KIND).optional(),
  commissionValueMajor: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const scheduleTripSchema = z
  .object({
    travelDate: plainDate.refine((v) => isPlainDate(v), "Fecha de viaje obligatoria"),
    returnDate: plainDate.optional().or(z.literal("")),
    days: z.coerce.number().int().min(0).optional(),
    nights: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.returnDate && d.returnDate < d.travelDate) {
      ctx.addIssue({ code: "custom", path: ["returnDate"], message: "El regreso no puede ser antes del viaje." });
    }
  });

export const cancelContractSchema = z.object({
  reason: z.string().trim().min(5, "El motivo es obligatorio"),
  code: z.enum(CANCELLATION_CODE),
  refundMajor: z.coerce.number().min(0).optional(),
  penaltyMajor: z.coerce.number().min(0).optional(),
});

export const resolveExceptionSchema = z.object({
  resolution: z.enum(EXCEPTION_RESOLUTION).refine((v) => v !== "ninguna", "Elige una resolución"),
  reason: z.string().trim().min(5, "Explica la decisión"),
  newTravelDate: plainDate.optional().or(z.literal("")),
});
