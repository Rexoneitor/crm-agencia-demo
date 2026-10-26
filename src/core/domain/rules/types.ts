import type { Money } from "@/core/money/money";
import type { PlainDate } from "@/core/time/clock";
import type {
  ContractLifecycle,
  ContractModality,
  LedgerKind,
  PaymentState,
  ReservationState,
  TripType,
} from "@/core/domain/enums";

/**
 * Vistas planas del dominio para el motor de reglas. Deliberadamente sin
 * tipos de Prisma: el motor es puro y se prueba con objetos literales.
 */

export interface LedgerEntryView {
  id: string;
  kind: LedgerKind;
  valueDate: PlainDate;
  /** Importe aplicado, SIEMPRE en la moneda del contrato. */
  applied: Money;
  /** Importe realmente recibido (puede ser otra moneda). */
  received: Money;
  installmentId?: string | null;
  reason?: string | null;
  voided: boolean;
}

export interface InstallmentView {
  id: string;
  sequence: number;
  dueDate: PlainDate;
  expected: Money;
  manualState: "vigente" | "cancelada";
}

export interface ReservationView {
  state: ReservationState;
  checkIn: PlainDate;
  checkOut: PlainDate;
}

export interface ContractView {
  id: string;
  number: string;
  modality: ContractModality;
  tripType: TripType;
  lifecycleState: ContractLifecycle;
  exceptionResolution: string;
  price: Money;
  /** Días de anticipación CONGELADOS en el contrato (RN-02). */
  liquidationLeadDays: number;
  saleDate?: PlainDate | null;
  travelDate?: PlainDate | null;
  vigenciaStart?: PlainDate | null;
  vigenciaEnd?: PlainDate | null;
  commissionKind: "percentage" | "fixed";
  commissionValue: string;
  commissionCurrency: string;
  reservation?: ReservationView | null;
  ledger: LedgerEntryView[];
  installments: InstallmentView[];
}

export type InstallmentDerivedState =
  | "pendiente"
  | "proxima"
  | "parcial"
  | "pagada"
  | "vencida"
  | "cancelada";

export interface InstallmentDerived {
  id: string;
  sequence: number;
  dueDate: PlainDate;
  expected: Money;
  paid: Money;
  outstanding: Money;
  state: InstallmentDerivedState;
}

export interface ContractDerived {
  contractId: string;
  currency: string;
  /** Σ(asientos aplicados que liquidan, no anulados). */
  settled: Money;
  /** precio − settled (RN-03). Nunca negativo salvo sobrepago real. */
  balance: Money;
  paidRatio: number; // 0..1 sobre el precio bruto
  paymentState: PaymentState;
  /** Caja real recibida, agrupada por moneda (RN-13). */
  cashReceivedByCurrency: Record<string, string>;
  liquidationDueDate: PlainDate | null;
  daysToTravel: number | null;
  daysToLiquidationDue: number | null;
  isOverdueForLiquidation: boolean;
  vigenciaExpiring: boolean;
  vigenciaExpired: boolean;
  needsExceptionResolution: boolean;
  expectedCommission: Money | null;
  installments: InstallmentDerived[];
}
