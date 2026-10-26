/**
 * Configuración que gobierna el motor de reglas. Se construye a partir de la
 * tabla `Setting` (ver modules/settings). El motor NUNCA lee settings ni BD
 * directamente: recibe este objeto ya resuelto.
 */
export interface RulesConfig {
  liquidationLeadDays: { nacional: number; internacional: number };
  alerts: {
    paymentLeadDays: number[];
    vigenciaThresholdDays: number;
    tripSoonDays: number;
    unconfirmedTripDays: number;
    inventoryExpiryDays: number;
    liquidationDueSoonDays: number;
  };
  commission: {
    base: "bruto" | "neto";
    accrual: "on_sale" | "on_full_payment" | "on_travel";
  };
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  liquidationLeadDays: { nacional: 30, internacional: 90 },
  alerts: {
    paymentLeadDays: [15, 7, 3, 1],
    vigenciaThresholdDays: 45,
    tripSoonDays: 14,
    unconfirmedTripDays: 21,
    inventoryExpiryDays: 30,
    liquidationDueSoonDays: 10,
  },
  commission: { base: "bruto", accrual: "on_full_payment" },
};

/** Construye la config del motor desde el mapa de settings efectivos. */
export function rulesConfigFromSettings(
  s: Record<string, unknown>,
): RulesConfig {
  const num = (key: string, fallback: number): number => {
    const v = s[key];
    return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
  };
  const arr = (key: string, fallback: number[]): number[] => {
    const v = s[key];
    return Array.isArray(v) ? v.map(Number).filter((n) => !Number.isNaN(n)) : fallback;
  };
  return {
    liquidationLeadDays: {
      nacional: num("liquidation.leadDays.nacional", 30),
      internacional: num("liquidation.leadDays.internacional", 90),
    },
    alerts: {
      paymentLeadDays: arr("alerts.paymentLeadDays", [15, 7, 3, 1]),
      vigenciaThresholdDays: num("alerts.vigenciaThresholdDays", 45),
      tripSoonDays: num("alerts.tripSoonDays", 14),
      unconfirmedTripDays: num("alerts.unconfirmedTripDays", 21),
      inventoryExpiryDays: num("alerts.inventoryExpiryDays", 30),
      liquidationDueSoonDays: num("alerts.liquidationDueSoonDays", 10),
    },
    commission: {
      base: s["commission.base"] === "neto" ? "neto" : "bruto",
      accrual:
        s["commission.accrual"] === "on_sale" || s["commission.accrual"] === "on_travel"
          ? (s["commission.accrual"] as "on_sale" | "on_travel")
          : "on_full_payment",
    },
  };
}
