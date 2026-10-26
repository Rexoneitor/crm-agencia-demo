import { requireUser, can } from "@/core/auth";
import { listSellers, displayCommissionValue } from "@/modules/sellers/service";
import { PageHeader } from "@/shared/ui/feedback";
import { SellersManager } from "./manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendedores" };

export default async function VendedoresPage() {
  const user = await requireUser();
  const sellers = await listSellers({ includeArchived: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="La comisión por defecto se copia y congela en cada contrato al momento de la venta (RN-09)."
      />
      <SellersManager
        editable={can(user, "master.manage")}
        sellers={sellers.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          email: s.email,
          active: s.active,
          retainsCommission: s.retainsCommission,
          commissionKind: s.commissionKind,
          commissionValue: s.commissionValue,
          commissionValueDisplay: displayCommissionValue(s),
          commissionCurrency: s.commissionCurrency,
          notes: s.notes,
          archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
          contracts: s._count.contracts,
        }))}
      />
    </div>
  );
}
