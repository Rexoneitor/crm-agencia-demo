import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  FilePlus2,
  ListChecks,
  Plane,
  Upload,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/core/auth";
import { getDashboardData } from "@/modules/dashboard/service";
import { getActiveAlerts } from "@/modules/alerts/service";
import { refundSummary } from "@/modules/refunds/service";
import { REVIEW_FLAGS, reviewCounts, type ReviewFlag } from "@/modules/review/service";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/feedback";
import { PaymentBadge, ReservationBadge, SeverityBadge } from "@/shared/ui/state-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio" };

const FLAG_ICON: Record<ReviewFlag, LucideIcon> = {
  viaje_pasado: Plane,
  por_confirmar: CalendarCheck2,
  sin_pagos: Wallet,
  sin_vendedor: UserX,
  sin_comprobante: Upload,
};

const TONE = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
} as const;

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Bogota" }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function DashboardPage() {
  const [user, data, alerts, refunds, review] = await Promise.all([
    requireUser(),
    getDashboardData(),
    getActiveAlerts(),
    refundSummary(),
    reviewCounts(),
  ]);
  const k = data.kpis;
  const firstName = user.name.trim().split(/\s+/)[0] ?? "";

  const kpiCards: { label: string; value: number; href: string; icon: LucideIcon; tone: keyof typeof TONE }[] = [
    { label: "Pagos vencidos", value: k.overduePayments, href: "/pagos?estado=vencida", icon: AlertTriangle, tone: "danger" },
    { label: "Vencen esta semana", value: k.dueThisWeek, href: "/pagos", icon: Clock3, tone: "warning" },
    { label: "Reservas sin confirmar", value: k.unconfirmedReservations, href: "/calendario?confirmacion=pendiente", icon: CalendarCheck2, tone: "warning" },
    { label: "Fecha abierta por expirar", value: k.expiringVigencia, href: "/contratos?modalidad=fecha_abierta", icon: CalendarClock, tone: "info" },
  ];

  return (
    <div className="space-y-6">
      {/* Bienvenida + accesos directos */}
      <section className="bg-brand-gradient relative overflow-hidden rounded-2xl p-5 text-white shadow-raised sm:p-6">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-sidebar-foreground/80">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">¿Qué exige mi atención hoy?</h1>
            <p className="mt-1 text-sm text-sidebar-foreground/80">
              {review.total > 0
                ? `${review.total} contrato${review.total === 1 ? "" : "s"} con algo pendiente en la revisión rápida.`
                : "No hay pendientes en la revisión rápida."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/revision" icon={ListChecks} label="Revisión rápida" primary />
            <QuickLink href="/comprobantes" icon={Upload} label="Subir comprobante" />
            <QuickLink href="/contratos/nuevo" icon={FilePlus2} label="Nuevo contrato" />
          </div>
        </div>
        <svg aria-hidden viewBox="0 0 400 200" className="pointer-events-none absolute -bottom-16 -right-10 w-[420px] opacity-20">
          <circle cx="260" cy="150" r="90" fill="#f2a516" />
          <path d="M0 150h400v60H0z" fill="#061a33" />
        </svg>
      </section>

      {/* Pendientes de la revisión rápida, por tipo: un clic abre la cola ya filtrada */}
      {review.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(REVIEW_FLAGS) as ReviewFlag[]).map((f) => {
            const Icon = FLAG_ICON[f];
            const n = review.byFlag[f];
            return (
              <Link
                key={f}
                href={`/revision?f=${f}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-colors hover:border-primary/40",
                  n === 0 && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    n > 0 ? "bg-brand-50 text-primary dark:bg-surface-muted" : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-tight tabular-nums">{n}</span>
                  <span className="block truncate text-xs text-muted-foreground group-hover:text-foreground">{REVIEW_FLAGS[f]}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {refunds.openCount > 0 && (
        <Link
          href="/reembolsos"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm transition-colors hover:border-primary/40 ${
            refunds.overdueCount > 0 ? "border-danger/40 bg-danger-bg" : "border-warning/40 bg-warning-bg"
          }`}
        >
          <Wallet className="size-4 shrink-0" />
          <span className="font-semibold">
            {refunds.openCount} reembolso{refunds.openCount === 1 ? "" : "s"} pendiente{refunds.openCount === 1 ? "" : "s"}
          </span>
          {refunds.overdueCount > 0 && (
            <span className="font-semibold text-danger">{refunds.overdueCount} con plazo vencido</span>
          )}
          {refunds.legalCount > 0 && <span>{refunds.legalCount} por vía legal</span>}
          {refunds.totals.map((t) => (
            <span key={t.currency} className="tabular-nums text-muted-foreground">
              {t.pending} por devolver
            </span>
          ))}
          <span className="ml-auto text-primary">Ver reembolsos →</span>
        </Link>
      )}

      {/* Banda 1 — indicadores accionables */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="col-span-2 sm:col-span-3 lg:col-span-1">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Saldo pendiente por cobrar
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data.outstandingByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin saldos pendientes</p>
            ) : (
              <ul className="space-y-0.5">
                {data.outstandingByCurrency.map((m) => (
                  <li key={m.currency} className="text-lg font-semibold tabular-nums">
                    {m.formatted}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/pagos" className="mt-1 inline-block text-xs text-primary hover:underline">
              Ver pagos →
            </Link>
          </CardContent>
        </Card>

        {kpiCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex items-start justify-between gap-2 p-4">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
                  </div>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      c.value > 0 ? TONE[c.tone] : "bg-surface-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Banda 2 — próximos viajes / próximos cobros */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Próximos viajes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.upcomingTrips.length === 0 ? (
              <EmptyState
                className="m-4 border-0 py-8"
                title="Sin viajes próximos"
                description="Cuando crees contratos con fecha, aparecerán aquí."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingTrips.map((t) => (
                  <li key={t.contractId} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/contratos/${t.contractId}`} className="font-medium hover:underline">
                        {t.client}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t.date} · {t.destination}
                        {t.hotel ? ` · ${t.hotel}` : ""} · {t.passengers} pax
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ReservationBadge state={t.reservationState} />
                      <PaymentBadge state={t.paymentState} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4" /> Próximos cobros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.upcomingCollections.length === 0 ? (
              <EmptyState
                className="m-4 border-0 py-8"
                title="Sin cobros programados"
                description="Los planes de cuotas de los contratos aparecerán aquí."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingCollections.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/contratos/${c.contractId}`} className="font-medium hover:underline">
                        {c.client}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.number}
                        {c.seller ? ` · ${c.seller}` : ""} · {c.dueDate}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">{c.formatted}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.daysRemaining < 0
                          ? `hace ${Math.abs(c.daysRemaining)} días`
                          : `en ${c.daysRemaining} días`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Banda 3 — bandeja de alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> Alertas activas
            <span className="text-muted-foreground">({alerts.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <EmptyState
              className="m-4 border-0 py-8"
              title="Todo en orden"
              description="No hay alertas activas en este momento."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Alerta</TH>
                  <TH>Detalle</TH>
                  <TH>Severidad</TH>
                </TR>
              </THead>
              <TBody>
                {alerts.slice(0, 12).map((a, i) => (
                  <TR key={i}>
                    <TD className="font-medium">
                      {a.contractId ? (
                        <Link href={`/contratos/${a.contractId}`} className="hover:underline">
                          {a.title}
                        </Link>
                      ) : (
                        a.title
                      )}
                    </TD>
                    <TD className="text-muted-foreground">{a.detail}</TD>
                    <TD>
                      <SeverityBadge severity={a.severity} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Banda 4 — métricas de contexto */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Contratos activos", value: k.activeContracts },
          { label: "Nuevos este mes", value: k.newThisMonth },
          { label: "Reservas del mes", value: k.reservationsThisMonth },
          { label: "Contratos fecha abierta", value: k.openDateContracts },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xl font-semibold tabular-nums">{m.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.receivedThisMonthByCurrency.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Pagos recibidos este mes:{" "}
          {data.receivedThisMonthByCurrency.map((m) => m.formatted).join(" · ")}
        </p>
      )}
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, primary }: { href: string; icon: LucideIcon; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
        primary ? "bg-gold-400 text-brand-950 hover:bg-gold-500" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20",
      )}
    >
      <Icon className="size-4" />
      {label}
      {primary && <ArrowRight className="size-4" />}
    </Link>
  );
}
