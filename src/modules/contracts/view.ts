import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import { money } from "@/core/money/money";
import type { ContractView, LedgerEntryView } from "@/core/domain/rules";
import type {
  ContractModality,
  LedgerKind,
  ReservationState,
  TripType,
} from "@/core/domain/enums";

/** Include necesario para construir un ContractView completo. */
export const contractViewInclude = {
  ledger: true,
  installments: true,
  reservation: true,
} as const;

type Row = Prisma.ContractGetPayload<{ include: typeof contractViewInclude }>;

export function toContractView(row: Row): ContractView {
  const currency = row.currency;
  const ledger: LedgerEntryView[] = row.ledger.map((e) => ({
    id: e.id,
    kind: e.kind as LedgerKind,
    valueDate: e.valueDate,
    applied: money(e.appliedAmount, e.appliedCurrency),
    received: money(e.receivedAmount, e.receivedCurrency),
    installmentId: e.installmentId,
    reason: e.reason,
    voided: e.voided,
  }));

  return {
    id: row.id,
    number: row.number,
    modality: row.modality as ContractModality,
    tripType: row.tripType as TripType,
    lifecycleState: row.lifecycleState as ContractView["lifecycleState"],
    exceptionResolution: row.exceptionResolution,
    price: money(row.priceAmount, currency),
    liquidationLeadDays: row.liquidationLeadDays,
    saleDate: row.saleDate,
    travelDate: row.travelDate,
    vigenciaStart: row.vigenciaStart,
    vigenciaEnd: row.vigenciaEnd,
    commissionKind: row.commissionKind as "percentage" | "fixed",
    commissionValue: row.commissionValue,
    commissionCurrency: row.commissionCurrency,
    reservation: row.reservation
      ? {
          state: row.reservation.state as ReservationState,
          checkIn: row.reservation.checkIn,
          checkOut: row.reservation.checkOut,
        }
      : null,
    ledger,
    installments: row.installments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate,
      expected: money(i.expectedAmount, i.currency),
      manualState: i.manualState as "vigente" | "cancelada",
    })),
  };
}

/**
 * Carga todos los contratos "vivos" como vistas para el motor de reglas.
 * Memoizado por petición: el dashboard y el centro de alertas lo piden en
 * la misma request.
 */
export const loadContractViews = cache(async (): Promise<ContractView[]> => {
  const rows = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: { in: ["borrador", "activo"] } },
    include: contractViewInclude,
  });
  return rows.map(toContractView);
});
