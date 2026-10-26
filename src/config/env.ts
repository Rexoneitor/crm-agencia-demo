import { z } from "zod";

/**
 * Validación de variables de entorno en el borde del proceso.
 * Si falta algo crítico, el servidor no arranca (mejor que fallar en runtime).
 */
const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    // Solo las migraciones lo usan (Prisma lo lee por su cuenta); aquí es informativo.
    DIRECT_URL: z.string().optional().default(""),
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET debe tener al menos 16 caracteres"),
    APP_TIMEZONE: z.string().default("America/Bogota"),
    FILES_DIR: z.string().default("./data/files"),
    BACKUP_PRIMARY_DIR: z.string().default("./data/backups"),
    BACKUP_SECONDARY_DIR: z.string().optional().default(""),
    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    SUPABASE_URL: z.string().optional().default(""),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
    SUPABASE_BUCKET: z.string().default("crm-files"),
    PORT: z.coerce.number().default(3200),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((v, ctx) => {
    if (v.STORAGE_DRIVER === "supabase") {
      for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
        if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} es obligatorio con STORAGE_DRIVER=supabase` });
      }
    }
    if (v.NODE_ENV === "production") {
      const weak =
        v.AUTH_SECRET.length < 32 ||
        /cambia|changeme|example|ejemplo|secret|password|^(.)\1+$/i.test(v.AUTH_SECRET);
      if (weak) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message:
            "En producción AUTH_SECRET debe tener 32+ caracteres aleatorios (no el de ejemplo). " +
            "Genera uno: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Variables de entorno inválidas:\n",
    z.prettifyError(parsed.error),
  );
  throw new Error("Configuración de entorno inválida. Revisa tu archivo .env");
}

export const env = parsed.data;
