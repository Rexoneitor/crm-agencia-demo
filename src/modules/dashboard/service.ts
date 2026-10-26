import "server-only";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { systemClock } from "@/core/time/clock";
import {
  deriveContract,
  rulesConfigFromSettings,
  type ContractDerived,
} from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { loadContractViews } from "@/modules/contracts/view";
import { formatMoney, money } from "@/core/money/money";

export interface MoneyByCurrency {
  currency: string;
  amount: string; // minor units, string
  formatted: string;
}

export interface DashboardData {
  kpis: {
    activeContracts: number;
    newThisMonth: number;
    reservationsThisMonth: number;
    unconfirmedReservations: number;
    openDateContracts: number;
    overduePayments: number;
    dueThisWeek: number;
    expiringVigencia: number;
  };
  outstandingByCurrency: MoneyByCurrency[];
  receivedThisMonthByCurrency: MoneyByCurrency[];
  upcomingTrips: {
    contractId: string;
    number: string;
    client: string;
    date: string;
    destination: string;
    hotel: string | null;
    passengers: number;
    reservationState: string;
    paymentState: string;
  }[];
  upcomingCollections: {
    contractId: string;
    number: string;
    client: string;
    seller: string | null;
    dueDate: string;
    amount: string;
    currency: string;
    formatted: string;
    daysRemaining: number;
  }[];
}

function groupMoney(entries: { amount: bigint; currency: string }[]): MoneyByCurrency[] {
  const map = new Map<string, bigint>();
  for (const e of entries) map.set(e.currency, (map.get(e.currency) ?? 0n) + e.amount);
  return [...map.entries()]
    .filter(([, v]) => v !== 0n)
    .map(([currency, amount]) => ({
      currency,
      amount: amount.toString(),
      formatted: formatMoney(money(amount, currency), { withCode: true }),
    }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const clock = systemClock(env.APP_TIMEZONE);
  const today = clock.today();
  const monthStart = today.slice(0, 8) + "01";
  const [settings, views, contractsMeta, monthPayments] = await Promise.all([
    getSettingsMap(),
    loadContractViews(),
    prisma.contract.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        number: true,
        createdAt: true,
        modality: true,
        lifecycleState: true,
        travelDate: true,
        client: { select: { fullName: true } },
        seller: { select: { name: true } },
        destination: { select: { name: true } },
        hotel: { select: { name: true } },
        passengers: { select: { adults: true, children: true, infants: true } },
        reservation: { select: { state: true, checkIn: true } },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { kind: "pago_recibido", voided: false, valueDate: { gte: monthStart } },
      select: { receivedAmount: true, receivedCurrency: true },
    }),
  ]);

  const config = rulesConfigFromSettings(settings);
  const derivedById = new Map<string, ContractDerived>();
  for (const v of views) derivedById.set(v.id, deriveContract(v, config, clock));

  const activeMeta = contractsMeta.filter((c) => c.lifecycleState === "activo");

  const outstanding = groupMoney(
    views
      .filter((v) => v.lifecycleState === "activo")
      .map((v) => derivedById.get(v.id)!.balance)
      .filter((b) => b.amount > 0n),
  );

  const received = groupMoney(
    monthPayments.map((p) => ({ amount: p.receivedAmount, currency: p.receivedCurrency })),
  );

  // Próximos viajes
  const upcomingTrips = contractsMeta
    .filter((c) => c.reservation && c.reservation.checkIn >= today && c.lifecycleState !== "cancelado")
    .sort((a, b) => a.reservation!.checkIn.localeCompare(b.reservation!.checkIn))
    .slice(0, 8)
    .map((c) => {
      const d = derivedById.get(c.id);
      const p = c.passengers;
      return {
        contractId: c.id,
        number: c.number,
        client: c.client.fullName,
        date: c.reservation!.checkIn,
        destination: c.destination.name,
        hotel: c.hotel?.name ?? null,
        passengers: p ? p.adults + p.children + p.infants : 0,
        reservationState: c.reservation!.state,
        paymentState: d?.paymentState ?? "sin_pagos",
      };
    });

  // Próximas cuotas por cobrar
  const openInstallments = await prisma.installment.findMany({
    where: { manualState: "vigente", contract: { archivedAt: null, lifecycleState: "activo" } },
    include: { contract: { select: { id: true, number: true, client: { select: { fullName: true } }, seller: { select: { name: true } } } } },
    orderBy: { dueDate: "asc" },
  });

  const upcomingCollections = openInstallments
    .map((inst) => {
      const d = derivedById.get(inst.contractId);
      const di = d?.installments.find((x) => x.id === inst.id);
      const outstandingAmt = di?.outstanding.amount ?? inst.expectedAmount;
      return { inst, outstandingAmt };
    })
    .filter((x) => x.outstandingAmt > 0n)
    .slice(0, 8)
    .map(({ inst, outstandingAmt }) => ({
      contractId: inst.contract.id,
      number: inst.contract.number,
      client: inst.contract.client.fullName,
      seller: inst.contract.seller?.name ?? null,
      dueDate: inst.dueDate,
      amount: outstandingAmt.toString(),
      currency: inst.currency,
      formatted: formatMoney(money(outstandingAmt, inst.currency), { withCode: true }),
      daysRemaining: daysDiff(today, inst.dueDate),
    }));

  const overduePayments = openInstallments.filter((inst) => {
    const d = derivedById.get(inst.contractId);
    const di = d?.installments.find((x) => x.id === inst.id);
    return di?.state === "vencida";
  }).length;

  const dueThisWeek = openInstallments.filter((inst) => {
    const dd = daysDiff(today, inst.dueDate);
    return dd >= 0 && dd <= 7;
  }).length;

  return {
    kpis: {
      activeContracts: activeMeta.length,
      newThisMonth: contractsMeta.filter(
        (c) => c.createdAt.toISOString().slice(0, 7) === today.slice(0, 7),
      ).length,
      reservationsThisMonth: contractsMeta.filter(
        (c) => c.reservation && c.reservation.checkIn.slice(0, 7) === today.slice(0, 7),
      ).length,
      unconfirmedReservations: contractsMeta.filter(
        (c) => c.reservation?.state === "pendiente_confirmacion",
      ).length,
      openDateContracts: activeMeta.filter((c) => c.modality === "fecha_abierta").length,
      overduePayments,
      dueThisWeek,
      expiringVigencia: views.filter((v) => derivedById.get(v.id)?.vigenciaExpiring).length,
    },
    outstandingByCurrency: outstanding,
    receivedThisMonthByCurrency: received,
    upcomingTrips,
    upcomingCollections,
  };
}

function daysDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000,
  );
}
