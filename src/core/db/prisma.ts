import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma único (evita agotar conexiones en desarrollo con hot-reload).
 * Es el ÚNICO punto de acceso a la base de datos. Ningún componente de UI
 * importa este módulo directamente: siempre pasa por un servicio.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Solo para scripts de mantenimiento: DB_WEBSOCKET=1 conecta a Neon por WebSocket (puerto 443)
 * en vez de TCP 5432. Sirve cuando una VPN o un cortafuegos bloquea el puerto de Postgres.
 * El programa en producción no lo usa.
 */
function createClient(): PrismaClient {
  const log = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);
  if (process.env.DB_WEBSOCKET === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = eval("require") as NodeRequire;
    const { neonConfig } = req("@neondatabase/serverless");
    neonConfig.webSocketConstructor = req("ws");
    const { PrismaNeon } = req("@prisma/adapter-neon");
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter, log: [...log], transactionOptions: { maxWait: 30000, timeout: 120000 } });
  }
  return new PrismaClient({ log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Azúcar para transacciones interactivas. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
