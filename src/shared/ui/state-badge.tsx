import { Badge } from "./badge";
import { label } from "@/core/domain/enums";

const RESERVATION_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  pendiente_confirmacion: "warning",
  confirmada: "success",
  requiere_cambio_fecha: "warning",
  cancelada: "danger",
  finalizada: "neutral",
};

const PAYMENT_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  sin_pagos: "danger",
  parcial: "warning",
  pagado: "success",
  liquidado: "success",
};

const LIFECYCLE_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  borrador: "neutral",
  activo: "primary",
  cancelado: "danger",
  finalizado: "neutral",
};

export function ReservationBadge({ state }: { state: string }) {
  return <Badge tone={RESERVATION_TONE[state] ?? "neutral"}>{label(state)}</Badge>;
}

export function PaymentBadge({ state }: { state: string }) {
  return <Badge tone={PAYMENT_TONE[state] ?? "neutral"}>{label(state)}</Badge>;
}

export function LifecycleBadge({ state }: { state: string }) {
  return <Badge tone={LIFECYCLE_TONE[state] ?? "neutral"}>{label(state)}</Badge>;
}

const SEVERITY_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  baja: "neutral",
  media: "warning",
  alta: "danger",
  critica: "danger",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONE[severity] ?? "neutral"}>{label(severity)}</Badge>;
}
