import { requireUser, can } from "@/core/auth";
import { listGroups } from "@/modules/groups/service";
import { PageHeader } from "@/shared/ui/feedback";
import { GroupsManager } from "./manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grupos" };

export default async function GruposPage() {
  const user = await requireUser();
  const groups = await listGroups({ includeArchived: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos de viaje"
        description="Varias personas, un mismo viaje: cada quien con su propio contrato, organizados juntos. Desde aquí puedes registrar un pago repartido entre los contratos del grupo."
      />
      <GroupsManager
        editable={can(user, "master.manage")}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          notes: g.notes,
          archivedAt: g.archivedAt ? g.archivedAt.toISOString() : null,
          contracts: g._count.contracts,
        }))}
      />
    </div>
  );
}
