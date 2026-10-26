import { describe, expect, it } from "vitest";
import { money } from "@/core/money/money";
import { fixedClock } from "@/core/time/clock";
import { DEFAULT_RULES_CONFIG } from "./config";
import { deriveAlerts } from "./alerts";
import type { ContractView } from "./types";

const clock = fixedClock("2026-09-06T12:00:00-05:00");

function contract(over: Partial<ContractView> = {}): ContractView {
  return {
    id: "c1",
    number: "CTR-2026-000001",
    modality: "fecha_cerrada",
    tripType: "internacional",
    lifecycleState: "activo",
    exceptionResolution: "ninguna",
    price: money(2_000_000n, "COP"),
    liquidationLeadDays: 90,
    saleDate: "2026-06-01",
    travelDate: "2026-12-20",
    vigenciaStart: null,
    vigenciaEnd: null,
    commissionKind: "percentage",
    commissionValue: "10",
    commissionCurrency: "COP",
    reservation: { state: "pendiente_confirmacion", checkIn: "2026-12-20", checkOut: "2026-12-27" },
    ledger: [],
    installments: [],
    ...over,
  };
}

describe("§13 — alertas derivadas", () => {
  it("caso 5: contrato internacional calcula límite y emite alerta al acercarse", () => {
    // viaje 2026-12-12 − 90 = límite 2026-09-13 (7 días desde hoy, dentro del umbral)
    const c = contract({ travelDate: "2026-12-12", ledger: [] });
    const alerts = deriveAlerts({ contracts: [c] }, DEFAULT_RULES_CONFIG, clock);
    const near = alerts.find((a) => a.type === "contrato_proximo_a_limite");
    expect(near).toBeDefined();
    expect(near?.dueDate).toBe("2026-09-13");
  });

  it("desaparece sola cuando el contrato queda sin saldo", () => {
    const paid = contract({ ledger: [
      { id: "p", kind: "pago_recibido", valueDate: "2026-09-01", applied: money(2_000_000n, "COP"), received: money(2_000_000n, "COP"), voided: false },
    ] });
    const alerts = deriveAlerts({ contracts: [paid] }, DEFAULT_RULES_CONFIG, clock);
    expect(alerts.find((a) => a.type === "contrato_proximo_a_limite")).toBeUndefined();
  });

  it("cuota vencida genera alerta de severidad alta", () => {
    const c = contract({
      installments: [
        { id: "i1", sequence: 1, dueDate: "2026-08-20", expected: money(500_000n, "COP"), manualState: "vigente" },
      ],
    });
    const alerts = deriveAlerts({ contracts: [c] }, DEFAULT_RULES_CONFIG, clock);
    const vencida = alerts.find((a) => a.type === "pago_vencido");
    expect(vencida?.severity).toBe("alta");
    expect(vencida?.referenceDate).toBe("2026-08-20");
  });

  it("reserva sin confirmar con viaje cercano", () => {
    const c = contract({ travelDate: "2026-09-18", reservation: { state: "pendiente_confirmacion", checkIn: "2026-09-18", checkOut: "2026-09-21" }, liquidationLeadDays: 5 });
    const alerts = deriveAlerts({ contracts: [c] }, DEFAULT_RULES_CONFIG, clock);
    expect(alerts.some((a) => a.type === "reserva_sin_confirmar")).toBe(true);
  });

  it("contratos cancelados no generan alertas", () => {
    const c = contract({ lifecycleState: "cancelado" });
    expect(deriveAlerts({ contracts: [c] }, DEFAULT_RULES_CONFIG, clock)).toHaveLength(0);
  });

  it("cupo próximo a vencer sin asignar", () => {
    const alerts = deriveAlerts(
      { contracts: [], inventory: [{ id: "inv1", state: "disponible", travelDate: "2026-09-25", label: "San Andrés x4" }] },
      DEFAULT_RULES_CONFIG,
      clock,
    );
    expect(alerts.some((a) => a.type === "cupo_por_vencer")).toBe(true);
  });

  it("ordena por severidad (crítica primero)", () => {
    const overdue = contract({
      travelDate: "2026-09-10",
      liquidationLeadDays: 90, // límite ya pasó
      ledger: [{ id: "p", kind: "pago_recibido", valueDate: "2026-06-01", applied: money(100_000n, "COP"), received: money(100_000n, "COP"), voided: false }],
    });
    const alerts = deriveAlerts({ contracts: [overdue] }, DEFAULT_RULES_CONFIG, clock);
    expect(alerts[0].severity).toBe("critica");
  });
});
