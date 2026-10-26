import { z } from "zod";
import { COMMISSION_KIND } from "@/core/domain/enums";

export const sellerSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  active: z.coerce.boolean().default(true),
  retainsCommission: z.coerce.boolean().default(false),
  commissionKind: z.enum(COMMISSION_KIND).default("percentage"),
  // porcentaje "10" o importe mayor "150000" (se guarda tal cual como texto)
  commissionValue: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Debe ser un número")
    .default("0"),
  commissionCurrency: z.string().trim().default("COP"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SellerInput = z.infer<typeof sellerSchema>;
