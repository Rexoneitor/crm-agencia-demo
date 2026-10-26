import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://x:x@localhost:5432/x");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import("./env");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("env en producción", () => {
  it("no arranca si AUTH_SECRET es corto o de ejemplo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadEnv({ NODE_ENV: "production", AUTH_SECRET: "x".repeat(20) })).rejects.toThrow();
    await expect(loadEnv({ NODE_ENV: "production", AUTH_SECRET: "cambia-esto-por-un-secreto-largo-1234567890" })).rejects.toThrow();
  });
  it("arranca con un secreto largo y aleatorio", async () => {
    const { env } = await loadEnv({ NODE_ENV: "production", AUTH_SECRET: "k9Xr2LmQ7vTz4NpWb8YcHs3JdFg6UaEo1RiBxVnM5tZq" });
    expect(env.STORAGE_DRIVER).toBe("local");
  });
  it("con STORAGE_DRIVER=supabase exige URL y clave", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadEnv({ NODE_ENV: "test", AUTH_SECRET: "a".repeat(20), STORAGE_DRIVER: "supabase" })).rejects.toThrow();
  });
});
