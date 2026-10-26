import { z } from "zod";

export const clientSchema = z.object({
  fullName: z.string().trim().min(3, "El nombre completo es obligatorio"),
  documentId: z.string().trim().max(40).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type ClientInput = z.infer<typeof clientSchema>;
