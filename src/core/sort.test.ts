import { describe, expect, it } from "vitest";
import { compareEs, sortActiveThenName, sortEs } from "./sort";
import { normalizeSearch } from "./text";

describe("normalizeSearch", () => {
  it("quita tildes, mayúsculas y espacios repetidos", () => {
    expect(normalizeSearch("  José   PEÑA ")).toBe("jose pena");
    expect(normalizeSearch("Cancún")).toBe("cancun");
  });
  it("«jose pena» encuentra a «José Peña»", () => {
    expect(normalizeSearch("José Peña").includes(normalizeSearch("jose pena"))).toBe(true);
  });
});

describe("orden alfabético en español", () => {
  it("ignora mayúsculas y tildes (Postgres ordena en binario)", () => {
    const names = ["Zoe", "ana", "Álvaro", "Beatriz", "carlos", "Ñandú", "Óscar", "Omar"];
    expect(sortEs(names, (n) => n)).toEqual(["Álvaro", "ana", "Beatriz", "carlos", "Ñandú", "Omar", "Óscar", "Zoe"]);
  });
  it("es estable con empates y numérico en los números", () => {
    expect(compareEs("Hotel 2", "Hotel 10")).toBeLessThan(0);
    const rows = [{ n: "a", i: 1 }, { n: "A", i: 2 }, { n: "á", i: 3 }];
    expect(sortEs(rows, (r) => r.n).map((r) => r.i)).toEqual([1, 2, 3]);
  });
  it("activos primero y luego por nombre", () => {
    const rows = [
      { name: "Zeta", active: true },
      { name: "alfa", active: false },
      { name: "Beta", active: true },
    ];
    expect(sortActiveThenName(rows).map((r) => r.name)).toEqual(["Beta", "Zeta", "alfa"]);
  });
});
