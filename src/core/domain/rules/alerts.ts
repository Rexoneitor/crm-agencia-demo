import { daysBetween, isAfter, type Clock, type PlainDate } from "@/core/time/clock";
import type { AlertSeverity, AlertType } from "@/core/domain/enums";
import type { RulesConfig } from "./config";
import { deriveContract } from "./contract";
import type { ContractView } from "./types";

export interface DerivedAlert {
  type: AlertType;
  severity: AlertSeverity;
  entityType: "contract" | "reservation" | "installment" | "pending_inventory";
  entityId: string;
  /** Contrato/entidad al que pertenece, para agrupar y enlazar. */
  contractId?: string;
  title: string;
  detail: string;
  /** Identifica la instancia de alerta (para el estado de interacción). */
  referenceDate: PlainDate;
  dueDate?: PlainDate;
  daysRemaining?: number;
}

export interface InventoryAlertView {
  id: string;
  state: string;
  travelDate?: PlainDate | null;
  label: string;
}

/**
 * §13 — Las alertas se DERIVAN, no se generan. Esta función produce la lista
 * activa a partir de los hechos y la configuración vigente. Lo único que se
 * persiste aparte es el estado de interacción del usuario con cada alerta.
 */
export function deriveAlerts(
  input: {
    contracts: ContractView[];
    inventory?: InventoryAlertView[];
  },
  config: RulesConfig,
  clock: Clock,
): DerivedAlert[] {
  const today = clock.today();
  const out: DerivedAlert[] = [];
  const maxLead = Math.max(0, ...config.alerts.paymentLeadDays);

  for (const contract of input.contracts) {
    if (contract.lifecycleState === "cancelado" || contract.lifecycleState === "finalizado") {
      continue;
    }
    const d = deriveContract(contract, config, clock);
    const label = contract.number;

    // Cuotas: próximas a vencer y vencidas
    for (const inst of d.installments) {
      if (inst.state === "cancelada" || inst.state === "pagada") continue;
      if (inst.outstanding.amount <= 0n) continue;
      const days = daysBetween(today, inst.dueDate);
      if (isAfter(today, inst.dueDate)) {
        out.push({
          type: "pago_vencido",
          severity: "alta",
          entityType: "installment",
          entityId: inst.id,
          contractId: contract.id,
          title: `Pago vencido — ${label}`,
          detail: `La cuota ${inst.sequence} venció el ${inst.dueDate}.`,
          referenceDate: inst.dueDate,
          dueDate: inst.dueDate,
          daysRemaining: days,
        });
      } else if (days <= maxLead) {
        out.push({
          type: "pago_por_vencer",
          severity: days <= 1 ? "alta" : days <= 3 ? "media" : "baja",
          entityType: "installment",
          entityId: inst.id,
          contractId: contract.id,
          title: `Pago próximo — ${label}`,
          detail: `La cuota ${inst.sequence} vence el ${inst.dueDate} (${days} día${days === 1 ? "" : "s"}).`,
          referenceDate: inst.dueDate,
          dueDate: inst.dueDate,
          daysRemaining: days,
        });
      }
    }

    // Contrato fuera de plazo con saldo (RN-07)
    if (d.isOverdueForLiquidation && d.liquidationDueDate) {
      out.push({
        type: "contrato_fuera_de_plazo",
        severity: "critica",
        entityType: "contract",
        entityId: contract.id,
        contractId: contract.id,
        title: `Fuera de plazo — ${label}`,
        detail: `Se alcanzó la fecha límite de liquidación (${d.liquidationDueDate}) con saldo pendiente. Requiere decisión de un administrador.`,
        referenceDate: d.liquidationDueDate,
        dueDate: d.liquidationDueDate,
        daysRemaining: d.daysToLiquidationDue ?? undefined,
      });
    } else if (
      d.liquidationDueDate &&
      d.daysToLiquidationDue !== null &&
      d.daysToLiquidationDue >= 0 &&
      d.daysToLiquidationDue <= config.alerts.liquidationDueSoonDays &&
      d.balance.amount > 0n
    ) {
      out.push({
        type: "contrato_proximo_a_limite",
        severity: d.daysToLiquidationDue <= 3 ? "alta" : "media",
        entityType: "contract",
        entityId: contract.id,
        contractId: contract.id,
        title: `Próximo a fecha límite — ${label}`,
        detail: `La liquidación total vence el ${d.liquidationDueDate} (${d.daysToLiquidationDue} días) y aún hay saldo.`,
        referenceDate: d.liquidationDueDate,
        dueDate: d.liquidationDueDate,
        daysRemaining: d.daysToLiquidationDue,
      });
    }

    // Viaje próximo / reserva sin confirmar
    if (contract.reservation && contract.travelDate && d.daysToTravel !== null) {
      const dt = d.daysToTravel;
      if (
        contract.reservation.state === "pendiente_confirmacion" &&
        dt >= 0 &&
        dt <= config.alerts.unconfirmedTripDays
      ) {
        out.push({
          type: "reserva_sin_confirmar",
          severity: dt <= 7 ? "alta" : "media",
          entityType: "reservation",
          entityId: contract.id,
          contractId: contract.id,
          title: `Reserva sin confirmar — ${label}`,
          detail: `El viaje es el ${contract.travelDate} (${dt} días) y la reserva sigue pendiente de confirmación.`,
          referenceDate: contract.travelDate,
          dueDate: contract.travelDate,
          daysRemaining: dt,
        });
      }
      if (dt >= 0 && dt <= config.alerts.tripSoonDays) {
        out.push({
          type: "viaje_proximo",
          severity: dt <= 3 ? "media" : "baja",
          entityType: "reservation",
          entityId: contract.id,
          contractId: contract.id,
          title: `Viaje próximo — ${label}`,
          detail: `Salida el ${contract.travelDate} (${dt} día${dt === 1 ? "" : "s"}).`,
          referenceDate: contract.travelDate,
          dueDate: contract.travelDate,
          daysRemaining: dt,
        });
      }
    }

    // Vigencia de fecha abierta (RN-06)
    if (d.vigenciaExpired && contract.vigenciaEnd) {
      out.push({
        type: "vigencia_por_expirar",
        severity: "alta",
        entityType: "contract",
        entityId: contract.id,
        contractId: contract.id,
        title: `Vigencia expirada — ${label}`,
        detail: `La ventana de fecha abierta terminó el ${contract.vigenciaEnd} sin viaje programado. Requiere revisión.`,
        referenceDate: contract.vigenciaEnd,
        dueDate: contract.vigenciaEnd,
      });
    } else if (d.vigenciaExpiring && contract.vigenciaEnd) {
      const days = daysBetween(today, contract.vigenciaEnd);
      out.push({
        type: "vigencia_por_expirar",
        severity: days <= 15 ? "media" : "baja",
        entityType: "contract",
        entityId: contract.id,
        contractId: contract.id,
        title: `Vigencia por expirar — ${label}`,
        detail: `La ventana de fecha abierta termina el ${contract.vigenciaEnd} (${days} días) y no hay fecha de viaje.`,
        referenceDate: contract.vigenciaEnd,
        dueDate: contract.vigenciaEnd,
        daysRemaining: days,
      });
    }
  }

  // Cupos próximos a vencer sin asignar
  for (const inv of input.inventory ?? []) {
    if (!inv.travelDate) continue;
    if (!["disponible", "parcialmente_asignado"].includes(inv.state)) continue;
    const days = daysBetween(today, inv.travelDate);
    if (days >= 0 && days <= config.alerts.inventoryExpiryDays) {
      out.push({
        type: "cupo_por_vencer",
        severity: days <= 7 ? "alta" : "media",
        entityType: "pending_inventory",
        entityId: inv.id,
        title: `Cupo por vencer — ${inv.label}`,
        detail: `El cupo viaja el ${inv.travelDate} (${days} días) y aún tiene plazas sin asignar.`,
        referenceDate: inv.travelDate,
        dueDate: inv.travelDate,
        daysRemaining: days,
      });
    }
  }

  const order: Record<AlertSeverity, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return out.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
  });
}
