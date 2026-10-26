import { requireUser, can } from "@/core/auth";
import { listDestinations } from "@/modules/destinations/service";
import { PageHeader } from "@/shared/ui/feedback";
import { DestinationsManager } from "./manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Destinos" };

export default async function DestinosPage() {
  const user = await requireUser();
  const destinations = await listDestinations({ includeArchived: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinos"
        description="Cada destino tiene su color, que se usa de forma consistente en el calendario, etiquetas y filtros."
      />
      <DestinationsManager
        editable={can(user, "master.manage")}
        destinations={destinations.map((d) => ({
          id: d.id,
          name: d.name,
          country: d.country,
          scope: d.scope,
          color: d.color,
          active: d.active,
          notes: d.notes,
          archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
          hotels: d._count.hotels,
          contracts: d._count.contracts,
        }))}
      />
    </div>
  );
}
