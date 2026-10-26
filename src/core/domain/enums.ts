/**
 * Vocabulario de estados y tipos del dominio.
 *
 * SQLite no tiene enums nativos: se guardan como texto y se validan aquí.
 * Esto además permite que la configuración amplíe/renombre estados sin migrar.
 * Los ESTADOS DERIVADOS (pago, mora, vigencia) NO están aquí — los calcula
 * el motor de reglas (src/core/domain/rules).
 */

export const CONTRACT_MODALITY = ["fecha_abierta", "fecha_cerrada"] as const;
export type ContractModality = (typeof CONTRACT_MODALITY)[number];

export const TRIP_TYPE = ["nacional", "internacional"] as const;
export type TripType = (typeof TRIP_TYPE)[number];

export const DESTINATION_SCOPE = ["nacional", "internacional"] as const;
export type DestinationScope = (typeof DESTINATION_SCOPE)[number];

export const CONTRACT_LIFECYCLE = [
  "borrador",
  "activo",
  "cancelado",
  "finalizado",
] as const;
export type ContractLifecycle = (typeof CONTRACT_LIFECYCLE)[number];

export const EXCEPTION_RESOLUTION = [
  "ninguna",
  "mantener_activo",
  "fecha_extendida",
  "incumplido",
  "excepcion_autorizada",
] as const;
export type ExceptionResolution = (typeof EXCEPTION_RESOLUTION)[number];

export const RESERVATION_STATE = [
  "pendiente_confirmacion",
  "confirmada",
  "requiere_cambio_fecha",
  "cancelada",
  "finalizada",
] as const;
export type ReservationState = (typeof RESERVATION_STATE)[number];

export const INSTALLMENT_MANUAL_STATE = ["vigente", "cancelada"] as const;
export type InstallmentManualState = (typeof INSTALLMENT_MANUAL_STATE)[number];

export const INVENTORY_STATE = [
  "disponible",
  "parcialmente_asignado",
  "asignado",
  "cancelado",
  "vencido",
] as const;
export type InventoryState = (typeof INVENTORY_STATE)[number];

/** Tipos de asiento del libro contable del contrato. */
export const LEDGER_KIND = [
  "pago_recibido",
  "aplicacion_de_anticipo",
  "comision_retenida",
  "descuento",
  "castigo",
  "reembolso",
] as const;
export type LedgerKind = (typeof LEDGER_KIND)[number];

/** Asientos que exigen `reason` (motivo) obligatorio. */
export const LEDGER_KINDS_REQUIRING_REASON: LedgerKind[] = [
  "comision_retenida",
  "descuento",
  "castigo",
  "reembolso",
];

export const PAYMENT_METHOD = [
  "transferencia",
  "efectivo",
  "tarjeta",
  "otro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export const COMMISSION_KIND = ["percentage", "fixed"] as const;
export type CommissionKind = (typeof COMMISSION_KIND)[number];

export const COMMISSION_ACCRUAL = [
  "on_sale",
  "on_full_payment",
  "on_travel",
] as const;
export type CommissionAccrual = (typeof COMMISSION_ACCRUAL)[number];

export const CANCELLATION_CODE = [
  "desistimiento_cliente",
  "no_pago",
  "fuerza_mayor",
  "error_agencia",
  "otro",
] as const;
export type CancellationCode = (typeof CANCELLATION_CODE)[number];

/** Reembolsos: seguimiento de la devolución de dinero a un cliente. */
export const REFUND_STATE = [
  "solicitado",
  "en_tramite",
  "aprobado",
  "pagado",
  "rechazado",
  "desistido",
] as const;
export type RefundState = (typeof REFUND_STATE)[number];

/** Estados en los que el reembolso sigue pendiente (cuenta por pagar). */
export const REFUND_OPEN_STATES: RefundState[] = ["solicitado", "en_tramite", "aprobado"];

export const REFUND_CHANNEL = [
  "correo",
  "derecho_peticion",
  "tutela",
  "superintendencia",
  "whatsapp",
  "telefono",
  "presencial",
  "otro",
] as const;
export type RefundChannel = (typeof REFUND_CHANNEL)[number];

export const REFUND_REASON = [
  "cancelacion_agencia",
  "desistimiento_cliente",
  "incumplimiento",
  "cambio_no_aceptado",
  "otro",
] as const;
export type RefundReason = (typeof REFUND_REASON)[number];

export const USER_ROLE = ["admin", "standard"] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const DOCUMENT_KIND = [
  "contrato",
  "contrato_firmado",
  "comprobante",
  "voucher",
  "confirmacion_hotel",
  "otro",
] as const;
export type DocumentKind = (typeof DOCUMENT_KIND)[number];

/** Estado DERIVADO de pago de un contrato (no se almacena). */
export const PAYMENT_STATE = [
  "sin_pagos",
  "parcial",
  "pagado",
  "liquidado",
] as const;
export type PaymentState = (typeof PAYMENT_STATE)[number];

/** Tipos de alerta que produce el motor de reglas. */
export const ALERT_TYPE = [
  "pago_por_vencer",
  "pago_vencido",
  "contrato_proximo_a_limite",
  "contrato_fuera_de_plazo",
  "viaje_proximo",
  "reserva_sin_confirmar",
  "vigencia_por_expirar",
  "cupo_por_vencer",
] as const;
export type AlertType = (typeof ALERT_TYPE)[number];

export const ALERT_SEVERITY = ["baja", "media", "alta", "critica"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITY)[number];

export const ALERT_INTERACTION = [
  "nueva",
  "leida",
  "pospuesta",
  "descartada",
] as const;
export type AlertInteraction = (typeof ALERT_INTERACTION)[number];

// ── Etiquetas legibles (español) para la UI ───────────────────────────────

export const LABELS: Record<string, string> = {
  // modalidad
  fecha_abierta: "Fecha abierta",
  fecha_cerrada: "Fecha cerrada",
  // tipo de viaje / ámbito
  nacional: "Nacional",
  internacional: "Internacional",
  // ciclo de contrato
  borrador: "Borrador",
  activo: "Activo",
  cancelado: "Cancelado",
  finalizado: "Finalizado",
  // excepción
  ninguna: "Ninguna",
  mantener_activo: "Mantener activo",
  fecha_extendida: "Fecha extendida",
  incumplido: "Incumplido",
  excepcion_autorizada: "Excepción autorizada",
  // reserva
  pendiente_confirmacion: "Pendiente de confirmación",
  confirmada: "Confirmada",
  requiere_cambio_fecha: "Requiere cambio de fecha",
  cancelada: "Cancelada",
  finalizada: "Finalizada",
  // cuota
  vigente: "Vigente",
  // inventario
  disponible: "Disponible",
  parcialmente_asignado: "Parcialmente asignado",
  asignado: "Asignado",
  vencido: "Vencido",
  // asientos
  pago_recibido: "Pago recibido",
  aplicacion_de_anticipo: "Aplicación de anticipo",
  comision_retenida: "Comisión retenida",
  descuento: "Descuento",
  castigo: "Castigo",
  reembolso: "Reembolso",
  // método
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  otro: "Otro",
  // comisión
  percentage: "Porcentaje",
  fixed: "Valor fijo",
  on_sale: "Al vender",
  on_full_payment: "Al completar el pago",
  on_travel: "Al viajar",
  // cancelación
  desistimiento_cliente: "Desistimiento del cliente",
  no_pago: "No pago",
  fuerza_mayor: "Fuerza mayor",
  error_agencia: "Error de la agencia",
  // reembolsos — estado
  solicitado: "Solicitado",
  en_tramite: "En trámite",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  desistido: "Desistido",
  // reembolsos — canal
  correo: "Correo",
  derecho_peticion: "Derecho de petición",
  tutela: "Tutela",
  superintendencia: "Superintendencia (SIC)",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  presencial: "Presencial",
  // reembolsos — motivo
  cancelacion_agencia: "La agencia canceló / no pudo operar",
  incumplimiento: "Incumplimiento del servicio",
  cambio_no_aceptado: "No aceptó el cambio propuesto",
  // rol
  admin: "Administrador",
  standard: "Usuario estándar",
  // estado de pago derivado
  sin_pagos: "Sin pagos",
  parcial: "Pago parcial",
  pagado: "Pagado",
  liquidado: "Pagado (comisión retenida)",
  // alertas
  pago_por_vencer: "Pago próximo a vencer",
  pago_vencido: "Pago vencido",
  contrato_proximo_a_limite: "Contrato próximo a su fecha límite",
  contrato_fuera_de_plazo: "Contrato fuera de plazo con saldo",
  viaje_proximo: "Viaje próximo",
  reserva_sin_confirmar: "Reserva sin confirmar",
  vigencia_por_expirar: "Vigencia de fecha abierta por expirar",
  cupo_por_vencer: "Cupo próximo a vencer sin asignar",
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
  // documentos
  contrato: "Contrato",
  contrato_firmado: "Contrato firmado",
  comprobante: "Comprobante",
  voucher: "Voucher",
  confirmacion_hotel: "Confirmación de hotel",
  // acciones de la bitácora de auditoría
  create: "Creación",
  update: "Modificación",
  archive: "Archivado",
  restore: "Restaurado",
  cancel: "Cancelación",
  delete: "Borrado definitivo",
  payment: "Pago",
  void: "Anulación",
  confirm: "Confirmación",
  unconfirm: "Reversión de confirmación",
  reschedule: "Reprogramación",
  resolve_exception: "Resolución de excepción",
  state_change: "Cambio de estado",
  assign: "Asignación de cupo",
  reverse_assignment: "Reversión de asignación",
  settle_commission: "Liquidación de comisión",
  mark_liquidated: "Marcado como pagado",
  schedule_trip: "Viaje programado",
  transfer: "Cambio de titular",
  note_added: "Nota añadida",
  note_updated: "Nota editada",
  note_archived: "Nota archivada",
  document_added: "Documento adjuntado",
};

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? value;
}
