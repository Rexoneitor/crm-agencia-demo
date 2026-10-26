import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeStoragePath } from "./storage-path";

/**
 * Prueba el adaptador REAL de Supabase contra un servidor falso que imita la API
 * de Storage (subir, descargar, existe, mover a la papelera, firmar).
 */
const files = new Map<string, { body: Buffer; type: string }>();
let server: Server;
let base = "";

function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ""));
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const notFound = () => json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
    const body = await readBody(req);

    if (req.method === "POST" && p === "move") {
      const { sourceKey, destinationKey } = JSON.parse(body.toString());
      const f = files.get(`crm-files/${sourceKey}`);
      if (!f) return notFound();
      files.delete(`crm-files/${sourceKey}`);
      files.set(`crm-files/${destinationKey}`, f);
      return json(200, { message: "Successfully moved" });
    }
    if (req.method === "POST" && p.startsWith("sign/")) {
      return json(200, { signedURL: `/object/${p}?token=t0k3n` });
    }
    if (req.method === "POST") {
      files.set(p, { body, type: String(req.headers["content-type"]) });
      return json(200, { Key: p, Id: "id" });
    }
    const f = files.get(p);
    if (!f) return notFound();
    res.writeHead(200, { "content-type": f.type, "content-length": f.body.length });
    res.end(req.method === "HEAD" ? undefined : f.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function loadAdapter() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://x:x@localhost:5432/x");
  vi.stubEnv("AUTH_SECRET", "a".repeat(20));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STORAGE_DRIVER", "supabase");
  vi.stubEnv("SUPABASE_URL", base);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-de-prueba");
  vi.stubEnv("SUPABASE_BUCKET", "crm-files");
  return (await import("./supabase-storage")).supabaseStorage;
}

describe("supabaseStorage (misma interfaz que el almacenamiento local)", () => {
  it("guarda con ruta {año}/{uuid}.{ext}, calcula sha256 y relee los mismos bytes", async () => {
    const st = await loadAdapter();
    const bytes = Buffer.from("%PDF-1.4 contrato de prueba");
    const saved = await st.save({ bytes, originalName: "Contrato Ñandú.pdf", mimeType: "application/pdf" });
    expect(saved.storagePath).toMatch(/^\d{4}\/[0-9a-f-]{36}\.pdf$/);
    expect(saved.sizeBytes).toBe(bytes.length);
    expect(saved.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await st.exists(saved.storagePath)).toBe(true);
    expect((await st.read(saved.storagePath)).equals(bytes)).toBe(true);
  });

  it("exists es falso si no hay archivo y read falla", async () => {
    const st = await loadAdapter();
    expect(await st.exists("2026/no-existe.pdf")).toBe(false);
    await expect(st.read("2026/no-existe.pdf")).rejects.toThrow();
  });

  it("softDelete mueve a _trash sin destruir", async () => {
    const st = await loadAdapter();
    const saved = await st.save({ bytes: Buffer.from("x"), originalName: "a.png", mimeType: "image/png" });
    await st.softDelete(saved.storagePath);
    expect(await st.exists(saved.storagePath)).toBe(false);
    expect(files.has(`crm-files/_trash/${saved.storagePath}`)).toBe(true);
  });

  it("signAccess devuelve una URL firmada temporal", async () => {
    const st = await loadAdapter();
    const url = await st.signAccess("2026/a.pdf");
    expect(url).toContain("token=");
  });

  it("rechaza rutas peligrosas", async () => {
    const st = await loadAdapter();
    await expect(st.read("../secreto")).rejects.toThrow("Ruta de archivo no permitida");
  });
});

describe("assertSafeStoragePath", () => {
  it("acepta rutas relativas normales", () => {
    expect(assertSafeStoragePath("2026/abc.pdf")).toBe("2026/abc.pdf");
    expect(assertSafeStoragePath("_trash/2026/abc.pdf")).toBe("_trash/2026/abc.pdf");
  });
  it.each(["", "/abs/x.pdf", "../x", "2026/../x", "a\\b", "a//b", "./a"])("rechaza %j", (p) => {
    expect(() => assertSafeStoragePath(p)).toThrow();
  });
});
