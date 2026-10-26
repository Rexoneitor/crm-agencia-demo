/**
 * Semillas de configuración. Ningún valor de negocio está hardcodeado en la
 * lógica: todo vive aquí como default y en la tabla `Setting` como valor
 * efectivo, editable desde Configuración (RN: "todas las reglas configurables").
 */
export interface SettingDef {
  key: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "json";
  group: string;
  label: string;
}

export const SETTING_DEFS: SettingDef[] = [
  // Agencia
  { key: "agency.name", value: "Mi Agencia de Viajes", type: "string", group: "agency", label: "Nombre de la agencia" },
  { key: "agency.phone", value: "", type: "string", group: "agency", label: "Teléfono" },
  { key: "agency.email", value: "", type: "string", group: "agency", label: "Email" },
  { key: "agency.timezone", value: "America/Bogota", type: "string", group: "agency", label: "Zona horaria" },

  // Moneda
  { key: "currency.default", value: "COP", type: "string", group: "currency", label: "Moneda por defecto" },
  { key: "currency.presentationRateUsdCop", value: "4000", type: "string", group: "currency", label: "Tasa de presentación USD→COP (solo estimación)" },

  // RN-01 / RN-02 — días de anticipación para liquidación total
  { key: "liquidation.leadDays.nacional", value: 30, type: "number", group: "liquidation", label: "Días de anticipación — Nacional" },
  { key: "liquidation.leadDays.internacional", value: 90, type: "number", group: "liquidation", label: "Días de anticipación — Internacional" },

  // RN-08 — escala de alertas de pago (días antes del vencimiento)
  { key: "alerts.paymentLeadDays", value: [15, 7, 3, 1], type: "json", group: "alerts", label: "Avisos de pago (días antes)" },
  // RN-06 — umbral de vigencia por expirar
  { key: "alerts.vigenciaThresholdDays", value: 45, type: "number", group: "alerts", label: "Umbral vigencia por expirar (días)" },
  // Viaje próximo
  { key: "alerts.tripSoonDays", value: 14, type: "number", group: "alerts", label: "Umbral viaje próximo (días)" },
  // Reserva sin confirmar con viaje cercano
  { key: "alerts.unconfirmedTripDays", value: 21, type: "number", group: "alerts", label: "Reserva sin confirmar — umbral (días)" },
  // Cupo por vencer
  { key: "alerts.inventoryExpiryDays", value: 30, type: "number", group: "alerts", label: "Cupo próximo a vencer (días)" },
  // Contrato próximo a su fecha límite de liquidación
  { key: "alerts.liquidationDueSoonDays", value: 10, type: "number", group: "alerts", label: "Contrato próximo a fecha límite (días)" },

  // RN-09 / RN-15 — comisión
  { key: "commission.base", value: "bruto", type: "string", group: "commission", label: "Base de la comisión (bruto | neto)" },
  { key: "commission.accrual", value: "on_full_payment", type: "string", group: "commission", label: "Devengo de comisión" },

  // RN-02 — comportamiento del importador y numeración
  { key: "contract.numberPrefix", value: "CTR", type: "string", group: "contract", label: "Prefijo del número de contrato" },

  // Documentos
  { key: "documents.maxSizeMb", value: 15, type: "number", group: "documents", label: "Tamaño máximo de archivo (MB)" },
];

export const SETTING_DEFS_BY_KEY = Object.fromEntries(
  SETTING_DEFS.map((d) => [d.key, d]),
) as Record<string, SettingDef>;
