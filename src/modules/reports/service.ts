import "server-only";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { systemClock, addPlainDays, daysBetween } from "@/core/time/clock";
import { formatMoney, money } from "@/core/money/money";
import { deriveContract, rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { label } from "@/core/domain/enums";

interface MoneyBucket {
  [currency: string]: bigint;
}
function bump(b: MoneyBucket, currency: string, amount: bigint) {
  b[currency] = (b[currency] ?? 0n) + amount;
}
function fmtBucket(b: MoneyBucket): string {
  const parts = Object.entries(b).filter(([, v]) => v !== 0n);
  return parts.length ? parts.map(([c, v]) => formatMoney(money(v, c), { withCode: true })).join(" · ") : "—";
}

export interface DateRange {
  from?: string;
  to?: string;
}

// ── Ventas ──────────────────────────────────────────────────────────────

export async function salesReport(range: DateRange) {
  const contracts = await prisma.contract.findMany({
    where: {
      archivedAt: null,
      lifecycleState: { in: ["activo", "finalizado"] },
      ...(range.from ? { saleDate: { gte: range.from } } : {}),
      ...(range.to ? { saleDate: { lte: range.to } } : {}),
    },
    select: {
      saleDate: true, priceAmount: true, currency: true,
      seller: { select: { name: true } },
      destination: { select: { name: true } },
    },
  });

  const byMonth: Record<string, MoneyBucket> = {};
  const bySeller: Record<string, MoneyBucket> = {};
  const byDestination: Record<string, MoneyBucket> = {};
  let count = 0;
  for (const c of contracts) {
    count++;
    const m = c.saleDate?.slice(0, 7) ?? "sin fecha";
    bump((byMonth[m] ??= {}), c.currency, c.priceAmount);
    bump((bySeller[c.seller?.name ?? "sin vendedor"] ??= {}), c.currency, c.priceAmount);
    bump((byDestination[c.destination.name] ??= {}), c.currency, c.priceAmount);
  }
  const rowsOf = (r: Record<string, MoneyBucket>) =>
    Object.entries(r).sort().map(([k, v]) => ({ key: k, value: fmtBucket(v) }));

  return {
    count,
    byMonth: rowsOf(byMonth),
    bySeller: rowsOf(bySeller),
    byDestination: rowsOf(byDestination),
  };
}

// ── Reservas ────────────────────────────────────────────────────────────

export async function reservationsReport(range: DateRange) {
  const rows = await prisma.reservation.findMany({
    where: {
      ...(range.from ? { checkIn: { gte: range.from } } : {}),
      ...(range.to ? { checkIn: { lte: range.to } } : {}),
    },
    select: { checkIn: true, state: true, contract: { select: { destination: { select: { name: true } } } } },
  });
  const byMonth: Record<string, number> = {};
  const byState: Record<string, number> = {};
  const byDestination: Record<string, number> = {};
  for (const r of rows) {
    byMonth[r.checkIn.slice(0, 7)] = (byMonth[r.checkIn.slice(0, 7)] ?? 0) + 1;
    byState[label(r.state)] = (byState[label(r.state)] ?? 0) + 1;
    byDestination[r.contract.destination.name] = (byDestination[r.contract.destination.name] ?? 0) + 1;
  }
  const rowsOf = (r: Record<string, number>) =>
    Object.entries(r).sort().map(([k, v]) => ({ key: k, value: String(v) }));
  return {
    count: rows.length,
    byMonth: rowsOf(byMonth),
    byState: rowsOf(byState),
    byDestination: rowsOf(byDestination),
  };
}

// ── Financiero ──────────────────────────────────────────────────────────

export async function financialReport(range: DateRange) {
  const clock = systemClock(env.APP_TIMEZONE);
  const config = rulesConfigFromSettings(await getSettingsMap());

  const contracts = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: { in: ["activo", "finalizado"] } },
    include: contractViewInclude,
  });

  const sold: MoneyBucket = {};
  const outstanding: MoneyBucket = {};
  const expectedCommission: MoneyBucket = {};
  for (const c of contracts) {
    const view = toContractView(c);
    const d = deriveContract(view, config, clock);
    bump(sold, c.currency, c.priceAmount);
    if (d.balance.amount > 0n) bump(outstanding, c.currency, d.balance.amount);
    if (d.expectedCommission) bump(expectedCommission, d.expectedCommission.currency, d.expectedCommission.amount);
  }

  // Caja recibida (por moneda de recepción) en el rango
  const received = await prisma.ledgerEntry.findMany({
    where: {
      kind: "pago_recibido",
      voided: false,
      ...(range.from ? { valueDate: { gte: range.from } } : {}),
      ...(range.to ? { valueDate: { lte: range.to } } : {}),
    },
    select: { receivedAmount: true, receivedCurrency: true },
  });
  const cash: MoneyBucket = {};
  for (const e of received) bump(cash, e.receivedCurrency, e.receivedAmount);

  // Comisiones retenidas (asientos) en el rango
  const retained = await prisma.ledgerEntry.findMany({
    where: {
      kind: "comision_retenida",
      voided: false,
      ...(range.from ? { valueDate: { gte: range.from } } : {}),
      ...(range.to ? { valueDate: { lte: range.to } } : {}),
    },
    select: { appliedAmount: true, appliedCurrency: true },
  });
  const commissionRetained: MoneyBucket = {};
  for (const e of retained) bump(commissionRetained, e.appliedCurrency, e.appliedAmount);

  // Cuotas vencidas con saldo
  const openInstallments = await prisma.installment.findMany({
    where: { manualState: "vigente", contract: { archivedAt: null, lifecycleState: "activo" } },
    include: { contract: { include: contractViewInclude } },
  });
  const overdue: MoneyBucket = {};
  const today = clock.today();
  for (const inst of openInstallments) {
    const d = deriveContract(toContractView(inst.contract), config, clock);
    const di = d.installments.find((x) => x.id === inst.id);
    if (di && di.state === "vencida") bump(overdue, di.outstanding.currency, di.outstanding.amount);
  }

  return {
    sold: fmtBucket(sold),
    cashReceived: fmtBucket(cash),
    outstanding: fmtBucket(outstanding),
    expectedCommission: fmtBucket(expectedCommission),
    commissionRetained: fmtBucket(commissionRetained),
    overduePayments: fmtBucket(overdue),
    asOf: today,
  };
}

// ── Operativo ───────────────────────────────────────────────────────────

export async function operationalReport() {
  const clock = systemClock(env.APP_TIMEZONE);
  const config = rulesConfigFromSettings(await getSettingsMap());
  const today = clock.today();

  const contracts = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: "activo" },
    include: {
      ...contractViewInclude,
      client: { select: { fullName: true } },
      destination: { select: { name: true } },
    },
  });

  const upcomingTrips: { number: string; client: string; date: string; destination: string; days: number }[] = [];
  const unconfirmed: { number: string; client: string; date: string }[] = [];
  const openExpiring: { number: string; client: string; vigenciaEnd: string; days: number }[] = [];

  for (const c of contracts) {
    const view = toContractView(c);
    const d = deriveContract(view, config, clock);
    if (c.reservation && c.travelDate && c.travelDate >= today) {
      upcomingTrips.push({
        number: c.number, client: c.client.fullName, date: c.travelDate,
        destination: c.destination.name, days: daysBetween(today, c.travelDate),
      });
      if (c.reservation.state === "pendiente_confirmacion") {
        unconfirmed.push({ number: c.number, client: c.client.fullName, date: c.travelDate });
      }
    }
    if (d.vigenciaExpiring && c.vigenciaEnd) {
      openExpiring.push({
        number: c.number, client: c.client.fullName, vigenciaEnd: c.vigenciaEnd,
        days: daysBetween(today, c.vigenciaEnd),
      });
    }
  }
  upcomingTrips.sort((a, b) => a.date.localeCompare(b.date));
  openExpiring.sort((a, b) => a.days - b.days);

  return { upcomingTrips: upcomingTrips.slice(0, 40), unconfirmed, openExpiring };
}

// ── Caja proyectada (§22) ───────────────────────────────────────────────

export async function projectedCashReport(weeks = 12) {
  const clock = systemClock(env.APP_TIMEZONE);
  const config = rulesConfigFromSettings(await getSettingsMap());
  const today = clock.today();

  const openInstallments = await prisma.installment.findMany({
    where: {
      manualState: "vigente",
      dueDate: { gte: today },
      contract: { archivedAt: null, lifecycleState: "activo" },
    },
    include: { contract: { include: contractViewInclude } },
  });

  const buckets: { weekStart: string; bucket: MoneyBucket }[] = [];
  for (let w = 0; w < weeks; w++) {
    buckets.push({ weekStart: addPlainDays(today, w * 7), bucket: {} });
  }
  for (const inst of openInstallments) {
    const d = deriveContract(toContractView(inst.contract), config, clock);
    const di = d.installments.find((x) => x.id === inst.id);
    const outstanding = di?.outstanding ?? money(inst.expectedAmount, inst.currency);
    if (outstanding.amount <= 0n) continue;
    const idx = Math.floor(daysBetween(today, inst.dueDate) / 7);
    if (idx >= 0 && idx < weeks) bump(buckets[idx].bucket, outstanding.currency, outstanding.amount);
  }
  return buckets.map((b) => ({ weekStart: b.weekStart, expected: fmtBucket(b.bucket) }));
}
