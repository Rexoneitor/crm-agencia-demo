import { z } from "zod";
import { DESTINATION_SCOPE } from "@/core/domain/enums";

export const destinationSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  country: z.string().trim().min(1).default("Colombia"),
  scope: z.enum(DESTINATION_SCOPE),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej #2563eb)")
    .default("#2563eb"),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type DestinationInput = z.infer<typeof destinationSchema>;
