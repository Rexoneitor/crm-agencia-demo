import { describe, expect, it } from "vitest";
import { LoginLimiter } from "./rate-limit";

describe("LoginLimiter", () => {
  it("bloquea 15 minutos tras 5 fallos y se levanta solo", () => {
    let t = 1_000;
    const l = new LoginLimiter({ maxFailures: 5, lockMs: 15 * 60_000, now: () => t });
    for (let i = 0; i < 4; i++) l.recordFailure("email:a");
    expect(l.lockedForMs("email:a")).toBe(0);
    l.recordFailure("email:a");
    expect(l.lockedForMs("email:a")).toBe(15 * 60_000);
    t += 14 * 60_000;
    expect(l.lockedForMs("email:a")).toBe(60_000);
    t += 61_000;
    expect(l.lockedForMs("email:a")).toBe(0);
    // tras vencer, vuelve a empezar de cero
    l.recordFailure("email:a");
    expect(l.lockedForMs("email:a")).toBe(0);
  });

  it("un acierto limpia el contador y las claves son independientes", () => {
    const l = new LoginLimiter({ maxFailures: 3, lockMs: 1000, now: () => 0 });
    l.recordFailure("email:a", "ip:1");
    l.recordFailure("email:a", "ip:1");
    l.recordSuccess("email:a");
    l.recordFailure("email:a");
    expect(l.lockedForMs("email:a")).toBe(0);
    l.recordFailure("ip:1");
    expect(l.lockedForMs("ip:1")).toBe(1000);
    expect(l.lockedForMs("email:b")).toBe(0);
  });
});
