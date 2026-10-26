import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser, can } from "@/core/auth";
import { listContracts } from "@/modules/contracts/list";
import { listDestinations } from "@/modules/destinations/service";
import { listSellers } from "@/modules/sellers/service";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { LifecycleBadge, PaymentBadge, ReservationBadge } from "@/shared/ui/state-badge";
import { label } from "@/core/domain/enums";
import { Pagination } from "@/shared/ui/pagination";
import { ContractFilters } from "./filters";

export const metadata = { title: "Contratos" };

export const dynamic = "force-dynamic";

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ rows: contracts, total, page, pageSize }, destinations, sellers] = await Promise.all([
    listContracts({
      q: sp.q,
      modality: sp.modalidad,
      tripType: sp.tipo,
      destinationId: sp.destino,
      sellerId: sp.vendedor,
      lifecycleState: sp.estado,
      paymentState: sp.pago,
      issuer: sp.empresa,
      archived: sp.archivados === "1",
    }, { page: Number(sp.pagina) || 1 }),
    listDestinations(),
    listSellers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        description="El contrato es el centro del sistema: de él cuelgan la reserva, los pagos, las cuotas y los documentos."
        actions={
          can(user, "contract.create") ? (
            <Link href="/contratos/nuevo">
              <Button>
                <Plus /> Nuevo contrato
              </Button>
            </Link>
          ) : undefined
        }
      />

      <ContractFilters
        destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
        sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
        current={sp}
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="Sin contratos que coincidan"
          description="Ajusta los filtros o crea un contrato nuevo."
          action={
            can(user, "contract.create") ? (
              <Link href="/contratos/nuevo">
                <Button>Nuevo contrato</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
        <Pagination basePath="/contratos" params={sp} page={page} pageSize={pageSize} total={total} noun="contratos" />
        <Table>
          <THead>
            <TR>
              <TH>Contrato</TH>
              <TH>Cliente</TH>
              <TH>Destino</TH>
              <TH>Viaje / Vigencia</TH>
              <TH>Precio</TH>
              <TH>Saldo</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {contracts.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/contratos/${c.id}`} className="font-medium hover:underline">
                    {c.number}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {label(c.modality)} · {label(c.tripType)}
                  </span>
                </TD>
                <TD>
                  {c.client}
                  {c.issuer !== "DEMO" && (
                    <Badge tone="warning" className="ml-1">
                      {c.issuer}
                    </Badge>
                  )}
                  {c.group && (
                    <Link
                      href={`/grupos/${c.group.id}`}
                      className="ml-1.5 inline-block rounded-full border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:underline"
                    >
                      {c.group.name}
                    </Link>
                  )}
                </TD>
                <TD>
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.destination}
                  </span>
                </TD>
                <TD className="text-muted-foreground">
                  {c.modality === "fecha_abierta"
                    ? `vence ${c.vigenciaEnd ?? "—"}`
                    : c.travelDate ?? "—"}
                  {c.isOverdue && (
                    <Badge tone="danger" className="ml-1">
                      Fuera de plazo
                    </Badge>
                  )}
                  {c.vigenciaExpiring && (
                    <Badge tone="warning" className="ml-1">
                      Por expirar
                    </Badge>
                  )}
                </TD>
                <TD className="tabular-nums">{c.price}</TD>
                <TD className="tabular-nums">{c.balance}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <LifecycleBadge state={c.lifecycleState} />
                    {c.reservationState && <ReservationBadge state={c.reservationState} />}
                    <PaymentBadge state={c.paymentState} />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {total > pageSize && <Pagination basePath="/contratos" params={sp} page={page} pageSize={pageSize} total={total} noun="contratos" />}
        </>
      )}
    </div>
  );
}
