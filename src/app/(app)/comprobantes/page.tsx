import { requireUser } from "@/core/auth";
import { listSellers } from "@/modules/sellers/service";
import { PageHeader } from "@/shared/ui/feedback";
import { QuickReceipt } from "./quick-receipt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subir comprobante" };

export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const sellers = await listSellers();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Subir comprobante"
        description="Sube o pega (Ctrl+V) las capturas, busca al cliente y carga el pago. Puedes cargar varias seguidas."
      />
      <QuickReceipt
        initialQuery={sp.q ?? ""}
        sellers={sellers
          .filter((s) => s.active)
          .map((s) => ({ id: s.id, name: s.name, retainsCommission: s.retainsCommission }))}
      />
    </div>
  );
}
