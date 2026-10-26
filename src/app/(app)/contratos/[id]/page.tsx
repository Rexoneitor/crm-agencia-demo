import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/core/auth";
import { NotFoundError } from "@/core/errors";
import { getContractDetail } from "@/modules/contracts/service";
import { toContractDetailVM } from "@/modules/contracts/detail-vm";
import { listSellers } from "@/modules/sellers/service";
import { listDestinations } from "@/modules/destinations/service";
import { listHotels } from "@/modules/hotels/service";
import { listClientOptions } from "@/modules/clients/service";
import { listGroups } from "@/modules/groups/service";
import { refundsForContract } from "@/modules/refunds/service";
import { label } from "@/core/domain/enums";
import { PageHeader } from "@/shared/ui/feedback";
import { Badge } from "@/shared/ui/badge";
import { LifecycleBadge, PaymentBadge, ReservationBadge } from "@/shared/ui/state-badge";
import { ContractTabs } from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrato" };

export default async function ContratoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  let vm;
  try {
    vm = toContractDetailVM(await getContractDetail(id));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [sellers, destinations, hotels, clients, groups, refunds] = await Promise.all([
    listSellers(),
    listDestinations(),
    listHotels(),
    listClientOptions(),
    listGroups(),
    refundsForContract(id),
  ]);
  const catalogs = {
    sellers: sellers.map((s) => ({ id: s.id, label: s.name })),
    destinations: destinations.map((d) => ({ id: d.id, label: d.name, hint: d.scope })),
    hotels: hotels.map((h) => ({ id: h.id, label: h.name, destinationId: h.destinationId })),
    clients: clients.map((c) => ({ id: c.id, label: c.fullName })),
    groups: groups.map((g) => ({ id: g.id, label: g.name })),
  };

  const perms = {
    edit: can(user, "contract.edit"),
    confirm: can(user, "reservation.confirm"),
    reschedule: can(user, "reservation.reschedule"),
    cancel: can(user, "contract.cancel"),
    delete: can(user, "contract.delete"),
    resolveException: can(user, "contract.resolve_exception"),
    registerPayment: can(user, "payment.register"),
    deletePayment: can(user, "payment.delete"),
    editPayment: can(user, "payment.edit"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={vm.number}
        description={
          <>
            <Link href={`/clientes/${vm.client.id}`} className="hover:underline">
              {vm.client.name}
            </Link>{" "}
            · {vm.destination.name}
            {vm.hotel ? ` · ${vm.hotel}` : ""} · {vm.modalityLabel} · {vm.tripTypeLabel}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {vm.issuer !== "DEMO" && <Badge tone="warning">No es de DEMO · {vm.issuer}</Badge>}
            <LifecycleBadge state={vm.lifecycleState} />
            {vm.reservation && <ReservationBadge state={vm.reservation.state} />}
            <PaymentBadge state={vm.paymentState} />
            {vm.isOverdueForLiquidation && <Badge tone="danger">Fuera de plazo</Badge>}
            {vm.vigenciaExpiring && <Badge tone="warning">Vigencia por expirar</Badge>}
            {vm.vigenciaExpired && <Badge tone="danger">Vigencia expirada</Badge>}
          </div>
        }
      />

      {refunds.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm">
          {refunds.map((r) => (
            <p key={r.id}>
              <Link href={`/reembolsos/${r.id}`} className="font-semibold hover:underline">
                Reembolso {r.number}
              </Link>{" "}
              · {label(r.state)} · pide {r.requested} · pagado {r.paid}
              {r.pendingAmount != null && r.pendingAmount > 0n ? ` · pendiente ${r.pending}` : ""}
              {r.overdue && <span className="font-semibold text-danger"> · plazo vencido ({r.dueDate})</span>}
            </p>
          ))}
        </div>
      )}

      <ContractTabs vm={vm} perms={perms} catalogs={catalogs} />
    </div>
  );
}
