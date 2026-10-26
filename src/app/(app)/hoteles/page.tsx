import { requireUser, can } from "@/core/auth";
import { listHotels } from "@/modules/hotels/service";
import { listDestinations } from "@/modules/destinations/service";
import { PageHeader } from "@/shared/ui/feedback";
import { HotelsManager } from "./manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoteles" };

export default async function HotelesPage() {
  const user = await requireUser();
  const [hotels, destinations] = await Promise.all([
    listHotels({ includeArchived: true }),
    listDestinations(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Hoteles" description="Catálogo de hoteles por destino." />
      <HotelsManager
        editable={can(user, "master.manage")}
        destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
        hotels={hotels.map((h) => ({
          id: h.id,
          name: h.name,
          destinationId: h.destinationId,
          destination: h.destination.name,
          color: h.destination.color,
          city: h.city,
          country: h.country,
          active: h.active,
          notes: h.notes,
          archivedAt: h.archivedAt ? h.archivedAt.toISOString() : null,
          contracts: h._count.contracts,
        }))}
      />
    </div>
  );
}
