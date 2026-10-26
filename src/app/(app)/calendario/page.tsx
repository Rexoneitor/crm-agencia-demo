import { requireUser } from "@/core/auth";
import { getCalendarReservations } from "@/modules/reservations/service";
import { listDestinations } from "@/modules/destinations/service";
import { listSellers } from "@/modules/sellers/service";
import { listHotels } from "@/modules/hotels/service";
import { PageHeader } from "@/shared/ui/feedback";
import { ExportButtons } from "@/shared/ui/export-buttons";
import { CalendarView } from "./calendar";
import { CalendarDownload } from "./download";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendario" };

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireUser();
  const sp = await searchParams;

  const [reservations, destinations, sellers, hotels] = await Promise.all([
    getCalendarReservations({
      destinationId: sp.destino || undefined,
      hotelId: sp.hotel || undefined,
      scope: sp.ambito || undefined,
      sellerId: sp.vendedor || undefined,
      confirmation:
        sp.confirmacion === "confirmada" || sp.confirmacion === "pendiente"
          ? (sp.confirmacion as "confirmada" | "pendiente")
          : undefined,
      paymentState: sp.pago || undefined,
    }),
    listDestinations(),
    listSellers(),
    listHotels(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendario"
        description="Vista mensual con todas las reservas del mes. Usa las flechas para ir a otro mes."
        actions={
          <>
            <CalendarDownload query={new URLSearchParams(sp).toString()} />
            <ExportButtons kind="reservas" label="Lista" />
          </>
        }
      />
      <CalendarView
        reservations={reservations}
        destinations={destinations.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
        hotels={hotels.map((h) => ({ id: h.id, name: h.name }))}
        sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
        filters={sp}
      />
    </div>
  );
}
