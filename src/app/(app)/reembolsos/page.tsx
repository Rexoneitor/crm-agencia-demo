import Link from "next/link";
import { requireUser, can } from "@/core/auth";
import { prisma } from "@/core/db/prisma";
import { listRefunds, refundSummary } from "@/modules/refunds/service";
import { label } from "@/core/domain/enums";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent } from "@/shared/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { ExportButtons } from "@/shared/ui/export-buttons";
import { RefundStateBadge, RefundFilters, NewRefundButton } from "./components";
import { sortedEs } from "@/core/sort";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reembolsos" };

export default async function ReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.ver || "abiertos";

  const [rows, summary, contracts, groups, destinations, sellers] = await Promise.all([
    listRefunds({ view, q: sp.q }),
    refundSummary(),
    prisma.contract.findMany({
      where: { archivedAt: null },
      select: { id: true, number: true, client: { select: { fullName: true } } },
      orderBy: { number: "desc" },
    }),
    sortedEs(prisma.contractGroup.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (r) => r.name),
    sortedEs(prisma.destination.findMany({ where: { archivedAt: null }, select: { id: true, name: true, scope: true }, orderBy: { name: "asc" } }), (r) => r.name),
    sortedEs(prisma.seller.findMany({ where: { archivedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (r) => r.name),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reembolsos"
        description="Devoluciones de dinero a clientes: quién lo pidió, por qué medio, cuánto, el plazo y lo que ya se le pagó."
        actions={
          <>
            <ExportButtons kind="reembolsos" />
            {can(user, "payment.register") && (
              <NewRefundButton
                contracts={contracts.map((c) => ({ id: c.id, label: `${c.number} — ${c.client.fullName}` }))}
                groups={groups.map((g) => ({ id: g.id, label: g.name }))}
                destinations={destinations.map((d) => ({ id: d.id, label: d.name, hint: d.scope }))}
                sellers={sellers.map((x) => ({ id: x.id, label: x.name }))}
              />
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{summary.openCount}</p>
            <p className="text-xs text-muted-foreground">Pendientes (solicitado, en trámite o aprobado)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className={`text-2xl font-semibold tabular-nums ${summary.overdueCount ? "text-danger" : ""}`}>
              {summary.overdueCount}
            </p>
            <p className="text-xs text-muted-foreground">
              Con plazo vencido · {summary.legalCount} por vía legal (petición, tutela, SIC)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            {summary.totals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin montos registrados.</p>
            ) : (
              summary.totals.map((t) => (
                <div key={t.currency}>
                  <p className="text-sm">
                    <span className="font-semibold tabular-nums">{t.pending}</span>{" "}
                    <span className="text-muted-foreground">por devolver</span>
                    {t.withoutAmount > 0 && (
                      <span className="text-xs text-warning"> (+{t.withoutAmount} sin monto definido)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Ya devuelto: {t.paid}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <RefundFilters current={sp} />

      {rows.length === 0 ? (
        <EmptyState
          title={view === "abiertos" ? "No hay reembolsos pendientes" : "Sin resultados"}
          description="Registra aquí cada solicitud de devolución apenas llegue (correo, derecho de petición, tutela…)."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>N.º</TH>
              <TH>Cliente</TH>
              <TH>Contrato / grupo</TH>
              <TH>Solicitado</TH>
              <TH>Canal</TH>
              <TH>Plazo</TH>
              <TH>Pide</TH>
              <TH>Acordado</TH>
              <TH>Pagado</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/reembolsos/${r.id}`} className="font-medium hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD>
                  {r.clientName}
                  {r.people ? <span className="text-xs text-muted-foreground"> · {r.people} pers.</span> : null}
                </TD>
                <TD className="text-xs">
                  {r.contract ? (
                    <Link href={`/contratos/${r.contract.id}`} className="hover:underline">
                      {r.contract.number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">sin contrato</span>
                  )}
                  {r.group && (
                    <Link href={`/grupos/${r.group.id}`} className="block text-muted-foreground hover:underline">
                      {r.group.name}
                    </Link>
                  )}
                </TD>
                <TD className="whitespace-nowrap">{r.requestedAt}</TD>
                <TD className="text-xs">{label(r.channel)}</TD>
                <TD className={`whitespace-nowrap ${r.overdue ? "font-semibold text-danger" : ""}`}>
                  {r.dueDate ?? "—"}
                </TD>
                <TD className="tabular-nums">{r.requested}</TD>
                <TD className="tabular-nums">{r.agreed}</TD>
                <TD className="tabular-nums">{r.paid}</TD>
                <TD>
                  <RefundStateBadge state={r.state} overdue={r.overdue} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
