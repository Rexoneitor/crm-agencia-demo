import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/core/auth";
import { NotFoundError } from "@/core/errors";
import { prisma } from "@/core/db/prisma";
import { getInventoryDetail } from "@/modules/inventory/service";
import { listSellers } from "@/modules/sellers/service";
import { listDestinations } from "@/modules/destinations/service";
import { listHotels } from "@/modules/hotels/service";
import { formatMoney, money, toMajorNumber } from "@/core/money/money";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { label } from "@/core/domain/enums";
import {
  AddInventoryPaymentButton,
  AssignInventoryButton,
  EditInventoryButton,
  ReverseAssignmentButton,
} from "../manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cupo" };

export default async function CupoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  let inv;
  try {
    inv = await getInventoryDetail(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const paid: Record<string, bigint> = {};
  for (const p of inv.payments) if (!p.voided) paid[p.currency] = (paid[p.currency] ?? 0n) + p.amount;
  const appliedInv: Record<string, bigint> = {};
  for (const a of inv.assignments)
    if (!a.reversed) appliedInv[a.appliedCurrency] = (appliedInv[a.appliedCurrency] ?? 0n) + a.appliedAmount;
  const available: Record<string, bigint> = { ...paid };
  for (const [c, v] of Object.entries(appliedInv)) available[c] = (available[c] ?? 0n) - v;
  const seatsAssigned = inv.assignments.filter((a) => !a.reversed).reduce((s, a) => s + a.seats, 0);
  const seatsLeft = inv.seats - seatsAssigned;

  const assignableContracts = await prisma.contract.findMany({
    where: { archivedAt: null, lifecycleState: "activo", destinationId: inv.destinationId },
    select: { id: true, number: true, currency: true, client: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const canManage = can(user, "inventory.manage");
  const canAssign = can(user, "inventory.assign");

  const [sellers, destinations, hotels] = canManage
    ? await Promise.all([listSellers(), listDestinations(), listHotels()])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title={inv.reference ?? `Cupo ${inv.id.slice(0, 8)}`}
        description={`${inv.seller.name} · ${inv.destination.name}${inv.hotel ? ` · ${inv.hotel.name}` : ""} · compra ${inv.purchaseDate}`}
        actions={<Badge tone="neutral">{label(inv.state)}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-muted-foreground">Valor del bloque</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(money(inv.amount, inv.currency), { withCode: true })}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Plazas</p>
            <p className="tabular-nums">{seatsLeft} disponibles de {inv.seats}</p>
            <p className="mt-2 text-xs text-muted-foreground">Viaje</p>
            <p>{inv.travelDate ?? "sin fecha"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-muted-foreground">Pagado por el vendedor</p>
            <p className="text-lg font-semibold tabular-nums">
              {Object.entries(paid).map(([c, v]) => formatMoney(money(v, c), { withCode: true })).join(" · ") || "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Saldo disponible del cupo</p>
            <p className="tabular-nums">
              {Object.entries(available).map(([c, v]) => formatMoney(money(v, c), { withCode: true })).join(" · ") || "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            {canManage && (
              <EditInventoryButton
                inventory={{
                  id: inv.id,
                  sellerId: inv.sellerId,
                  purchaseDate: inv.purchaseDate,
                  destinationId: inv.destinationId,
                  hotelId: inv.hotelId,
                  travelDate: inv.travelDate,
                  seats: inv.seats,
                  amountMajor: toMajorNumber(money(inv.amount, inv.currency)),
                  currency: inv.currency,
                  reference: inv.reference,
                  notes: inv.notes,
                }}
                sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
                destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
                hotels={hotels.map((h) => ({ id: h.id, name: h.name, destinationId: h.destinationId }))}
              />
            )}
            {canManage && <AddInventoryPaymentButton inventoryId={inv.id} currency={inv.currency} />}
            {canAssign && (
              <AssignInventoryButton
                inventoryId={inv.id}
                inventoryCurrency={inv.currency}
                seatsLeft={seatsLeft}
                contracts={assignableContracts.map((c) => ({
                  id: c.id,
                  number: c.number,
                  client: c.client.fullName,
                  currency: c.currency,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Pagos del cupo</h2>
        {inv.payments.length === 0 ? (
          <EmptyState title="Sin pagos" description="Registra lo que el vendedor pagó por este bloque." />
        ) : (
          <Table>
            <THead>
              <TR><TH>Fecha</TH><TH>Monto</TH><TH>Método</TH><TH>Ref.</TH></TR>
            </THead>
            <TBody>
              {inv.payments.map((p) => (
                <TR key={p.id} className={p.voided ? "opacity-50 line-through" : ""}>
                  <TD>{p.valueDate}</TD>
                  <TD className="tabular-nums">{formatMoney(money(p.amount, p.currency), { withCode: true })}</TD>
                  <TD>{label(p.method ?? "otro")}</TD>
                  <TD className="text-muted-foreground">{p.reference ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Asignaciones a contratos</h2>
        {inv.assignments.length === 0 ? (
          <EmptyState title="Sin asignar" description="Cuando aparezca un cliente, asigna plazas de este cupo a su contrato." />
        ) : (
          <Table>
            <THead>
              <TR><TH>Fecha</TH><TH>Contrato</TH><TH>Plazas</TH><TH>Aplicado</TH><TH>Estado</TH></TR>
            </THead>
            <TBody>
              {inv.assignments.map((a) => (
                <TR key={a.id} className={a.reversed ? "opacity-50" : ""}>
                  <TD>{a.valueDate}</TD>
                  <TD>
                    <Link href={`/contratos/${a.contractId}`} className="hover:underline">
                      {a.contract.number}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{a.contract.client.fullName}</span>
                  </TD>
                  <TD className="tabular-nums">{a.seats}</TD>
                  <TD className="tabular-nums">{formatMoney(money(a.appliedAmount, a.appliedCurrency), { withCode: true })}</TD>
                  <TD>
                    {a.reversed ? (
                      <Badge tone="danger">revertida</Badge>
                    ) : canAssign ? (
                      <ReverseAssignmentButton inventoryId={inv.id} assignmentId={a.id} />
                    ) : (
                      <Badge tone="success">activa</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
