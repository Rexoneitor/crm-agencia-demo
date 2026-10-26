import { z } from "zod";

export const hotelSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  destinationId: z.string().min(1, "Selecciona un destino"),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type HotelInput = z.infer<typeof hotelSchema>;
