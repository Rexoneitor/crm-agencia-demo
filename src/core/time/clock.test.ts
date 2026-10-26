import { describe, expect, it } from "vitest";
import {
  addPlainDays,
  assertPlainDate,
  daysBetween,
  fixedClock,
  isAfter,
  isBefore,
  isPlainDate,
} from "./clock";

describe("PlainDate", () => {
  it("valida formato YYYY-MM-DD", () => {
    expect(isPlainDate("2026-10-10")).toBe(true);
    expect(isPlainDate("2026-13-10")).toBe(false);
    expect(isPlainDate("10/10/2026")).toBe(false);
    expect(() => assertPlainDate("nope")).toThrow();
  });

  it("suma y resta días sin desplazamiento de zona horaria", () => {
    expect(addPlainDays("2026-10-10", -30)).toBe("2026-09-10");
    expect(addPlainDays("2026-12-20", -90)).toBe("2026-09-21");
    expect(addPlainDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("cuenta días de calendario entre fechas", () => {
    expect(daysBetween("2026-09-06", "2026-10-10")).toBe(34);
    expect(daysBetween("2026-10-10", "2026-09-06")).toBe(-34);
  });

  it("compara fechas", () => {
    expect(isBefore("2026-01-01", "2026-01-02")).toBe(true);
    expect(isAfter("2026-01-02", "2026-01-01")).toBe(true);
  });
});

describe("fixedClock", () => {
  it("hoy es determinista en la zona de la agencia", () => {
    const clock = fixedClock("2026-09-06T23:30:00-05:00", "America/Bogota");
    expect(clock.today()).toBe("2026-09-06");
  });

  it("respeta el cambio de día en UTC vs Bogotá", () => {
    // 2026-09-07 03:00 UTC = 2026-09-06 22:00 en Bogotá (UTC-5)
    const clock = fixedClock("2026-09-07T03:00:00Z", "America/Bogota");
    expect(clock.today()).toBe("2026-09-06");
  });
});
