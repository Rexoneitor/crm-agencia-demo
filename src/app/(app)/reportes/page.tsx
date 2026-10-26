import Link from "next/link";
import { requireUser } from "@/core/auth";
import {
  financialReport,
  operationalReport,
  projectedCashReport,
  reservationsReport,
  salesReport,
} from "@/modules/reports/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { ReportTabs } from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes" };

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requireUser();
  const { desde, hasta } = await searchParams;
  const range = { from: desde, to: hasta };

  const [sales, reservations, financial, operational, projected] = await Promise.all([
    salesReport(range),
    reservationsReport(range),
    financialReport(range),
    operationalReport(),
    projectedCashReport(12),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Vistas simples de ventas, reservas, finanzas y operación. El período aplica a ventas, reservas y caja recibida."
      />

      <ReportTabs
        range={{ desde: desde ?? "", hasta: hasta ?? "" }}
        ventas={
          <div className="grid gap-4 lg:grid-cols-3">
            <ListCard title={`Ventas por mes · ${sales.count} contratos`} rows={sales.byMonth} />
            <ListCard title="Ventas por vendedor" rows={sales.bySeller} />
            <ListCard title="Ventas por destino" rows={sales.byDestination} />
          </div>
        }
        reservas={
          <div className="grid gap-4 lg:grid-cols-3">
            <ListCard title={`Reservas por mes · ${reservations.count}`} rows={reservations.byMonth} />
            <ListCard title="Reservas por estado" rows={reservations.byState} />
            <ListCard title="Reservas por destino" rows={reservations.byDestination} />
          </div>
        }
        financiero={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Vendido (contratos vivos)", financial.sold],
              ["Cobrado en el período (caja real)", financial.cashReceived],
              ["Pendiente por cobrar", financial.outstanding],
              ["Comisiones esperadas", financial.expectedCommission],
              ["Comisiones retenidas (período)", financial.commissionRetained],
              ["Cuotas vencidas con saldo", financial.overduePayments],
            ].map(([k, v]) => (
              <Card key={k}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardHeader>
                <CardTitle>Caja proyectada — próximas 12 semanas</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR><TH>Semana desde</TH><TH>Ingreso esperado (cuotas)</TH></TR>
                  </THead>
                  <TBody>
                    {projected.map((w) => (
                      <TR key={w.weekStart}>
                        <TD>{w.weekStart}</TD>
                        <TD className="tabular-nums">{w.expected}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        }
        operativo={
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Próximos viajes ({operational.upcomingTrips.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {operational.upcomingTrips.length === 0 ? (
                  <EmptyState title="Sin viajes próximos" className="m-4 border-0" />
                ) : (
                  <Table>
                    <THead><TR><TH>Contrato</TH><TH>Cliente</TH><TH>Fecha</TH><TH>Destino</TH><TH>En</TH></TR></THead>
                    <TBody>
                      {operational.upcomingTrips.map((t) => (
                        <TR key={t.number}>
                          <TD><Link href={`/contratos`} className="hover:underline">{t.number}</Link></TD>
                          <TD>{t.client}</TD>
                          <TD>{t.date}</TD>
                          <TD>{t.destination}</TD>
                          <TD className="tabular-nums">{t.days} d</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <ListCard
                title={`Reservas sin confirmar (${operational.unconfirmed.length})`}
                rows={operational.unconfirmed.map((u) => ({ key: `${u.number} · ${u.client}`, value: u.date }))}
              />
              <ListCard
                title={`Fecha abierta por vencer (${operational.openExpiring.length})`}
                rows={operational.openExpiring.map((o) => ({ key: `${o.number} · ${o.client}`, value: `${o.vigenciaEnd} (${o.days} d)` }))}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}

function ListCard({ title, rows }: { title: string; rows: { key: string; value: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate text-muted-foreground">{r.key}</span>
                <span className="shrink-0 tabular-nums font-medium">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
