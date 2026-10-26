import Link from "next/link";
import { requireUser } from "@/core/auth";
import { cashTotals, listPayments } from "@/modules/payments/service";
import { listDestinations } from "@/modules/destinations/service";
import { listSellers } from "@/modules/sellers/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { label } from "@/core/domain/enums";
import { ExportButtons } from "@/shared/ui/export-buttons";
import { PaymentFilters } from "./filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos" };

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const filters = {
    from: sp.desde || undefined,
    to: sp.hasta || undefined,
    sellerId: sp.vendedor || undefined,
    destinationId: sp.destino || undefined,
    kind: sp.tipo || undefined,
    includeVoided: sp.anulados === "1",
  };

  const [rows, totals, destinations, sellers] = await Promise.all([
    listPayments(filters),
    cashTotals(filters),
    listDestinations(),
    listSellers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Vista transversal del libro de asientos. La caja real recibida se agrupa por moneda y nunca se consolida."
        actions={<ExportButtons kind="pagos" />}
      />

      <div className="flex flex-wrap gap-3">
        {totals.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Sin pagos en el período.</CardContent></Card>
        ) : (
          totals.map((t) => (
            <Card key={t.currency}>
              <CardContent className="p-4">
                <p className="text-lg font-semibold tabular-nums">{t.formatted}</p>
                <p className="text-xs text-muted-foreground">Caja recibida ({t.currency})</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <PaymentFilters
        destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
        sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
        current={sp}
      />

      {rows.length === 0 ? (
        <EmptyState title="Sin movimientos" description="Ajusta los filtros o registra pagos desde un contrato." />
      ) : (
        <>
        {rows.length >= 500 && (
          <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
            Se muestran los 500 movimientos más recientes. Usa «desde / hasta» u otro filtro para ver los anteriores.
          </p>
        )}
        <Table>
          <THead>
            <TR>
              <TH>Fecha</TH>
              <TH>Contrato</TH>
              <TH>Cliente</TH>
              <TH>Tipo</TH>
              <TH>Recibido</TH>
              <TH>Aplicado</TH>
              <TH>Vendedor</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.entryId} className={r.voided ? "opacity-50" : ""}>
                <TD>{r.valueDate}</TD>
                <TD>
                  <Link href={`/contratos/${r.contractId}`} className="hover:underline">
                    {r.contractNumber}
                  </Link>
                </TD>
                <TD>{r.client}</TD>
                <TD>
                  {label(r.kind)}
                  {r.voided && <Badge tone="danger" className="ml-1">anulado</Badge>}
                </TD>
                <TD className="tabular-nums">{r.received}</TD>
                <TD className="tabular-nums">{r.applied}</TD>
                <TD className="text-muted-foreground">{r.seller ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        </>
      )}
    </div>
  );
}
