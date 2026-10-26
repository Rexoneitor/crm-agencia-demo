import { redirect } from "next/navigation";
import { requireUser, can } from "@/core/auth";
import { prisma } from "@/core/db/prisma";
import { listGroups } from "@/modules/groups/service";
import { PageHeader } from "@/shared/ui/feedback";
import { NewContractForm } from "./form";
import { sortedEs } from "@/core/sort";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo contrato" };

export default async function NuevoContratoPage() {
  const user = await requireUser();
  if (!can(user, "contract.create")) redirect("/contratos");

  const [clients, sellers, destinations, hotels, groups] = await Promise.all([
    sortedEs(prisma.client.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }), (r) => r.fullName),
    sortedEs(prisma.seller.findMany({ where: { archivedAt: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), (r) => r.name),
    sortedEs(prisma.destination.findMany({ where: { archivedAt: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, scope: true } }), (r) => r.name),
    sortedEs(prisma.hotel.findMany({ where: { archivedAt: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, destinationId: true } }), (r) => r.name),
    listGroups(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo contrato"
        description="Al guardar, si es de fecha cerrada se crea la reserva (pendiente de confirmación) y se calcula la fecha límite de liquidación."
      />
      <NewContractForm
        clients={clients}
        sellers={sellers}
        destinations={destinations}
        hotels={hotels}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />
    </div>
  );
}
