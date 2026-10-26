import { Hammer } from "lucide-react";
import { EmptyState, PageHeader } from "./feedback";

export function PhasePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<Hammer />}
        title={`Módulo en construcción — ${phase}`}
        description="Esta sección se implementa en una fase posterior del roadmap. El núcleo del sistema (contratos, clientes, reservas, pagos) tiene prioridad."
      />
    </div>
  );
}
