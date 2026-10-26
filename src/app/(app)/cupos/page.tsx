import Link from "next/link";
import { requireUser, can } from "@/core/auth";
import { prisma } from "@/core/db/prisma";
import { listInventory } from "@/modules/inventory/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Badge } from "@/shared/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { label } from "@/core/domain/enums";
import { NewInventoryButton } from "./manager";
import { sortedEs } from "@/core/sort";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cupos" };

const STATE_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  disponible: "success",
  parcialmente_asignado: "warning",
  asignado: "primary",
  cancelado: "danger",
  vencido: "danger",
};

export default async function CuposPage() {
  const user = await requireUser();
  const [items, sellers, destinations, hotels] = await Promise.all([
    listInventory(),
    sortedEs(prisma.seller.findMany({ where: { archivedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (r) => r.name),
    sortedEs(prisma.destination.findMany({ where: { archivedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (r) => r.name),
    sortedEs(prisma.hotel.findMany({ where: { archivedAt: null, active: true }, select: { id: true, name: true, destinationId: true }, orderBy: { name: "asc" } }), (r) => r.name),
  ]);
  const editable = can(user, "inventory.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cupos"
        description="Bloques de paquetes que los vendedores compran por anticipado. Existe dinero, comprobante y proveedor comprometido antes de que exista cliente o contrato."
        actions={
          editable ? (
            <NewInventoryButton sellers={sellers} destinations={destinations} hotels={hotels} />
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Sin cupos registrados"
          description="Cuando un vendedor compre un bloque de paquetes por anticipado, regístralo aquí."
          action={editable ? <NewInventoryButton sellers={sellers} destinations={destinations} hotels={hotels} /> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Cupo</TH>
              <TH>Vendedor</TH>
              <TH>Destino</TH>
              <TH>Viaje</TH>
              <TH>Plazas</TH>
              <TH>Pagado / Disponible</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((it) => (
              <TR key={it.id}>
                <TD>
                  <Link href={`/cupos/${it.id}`} className="font-medium hover:underline">
                    {it.reference ?? it.id.slice(0, 8)}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{it.amount}</span>
                </TD>
                <TD>{it.seller}</TD>
                <TD>
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: it.color }} />
                    {it.destination}
                  </span>
                </TD>
                <TD className="text-muted-foreground">
                  {it.travelDate ?? "—"}
                  {it.expiringSoon && <Badge tone="warning" className="ml-1">próximo</Badge>}
                </TD>
                <TD className="tabular-nums">
                  {it.seatsLeft}/{it.seats}
                </TD>
                <TD className="tabular-nums text-xs">
                  {it.paidFormatted}
                  <span className="block text-muted-foreground">disp. {it.availableFormatted}</span>
                </TD>
                <TD>
                  <Badge tone={STATE_TONE[it.state] ?? "neutral"}>{label(it.state)}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
