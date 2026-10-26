import Link from "next/link";
import { getActiveAlerts } from "@/modules/alerts/service";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState, PageHeader } from "@/shared/ui/feedback";
import { SeverityBadge } from "@/shared/ui/state-badge";
import { label } from "@/core/domain/enums";
import { AlertActions } from "./alert-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaciones" };

export default async function NotificacionesPage() {
  const alerts = await getActiveAlerts();

  const groups = new Map<string, typeof alerts>();
  for (const a of alerts) {
    const arr = groups.get(a.severity) ?? [];
    arr.push(a);
    groups.set(a.severity, arr);
  }
  const order = ["critica", "alta", "media", "baja"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de notificaciones"
        description="Las alertas se derivan de los datos: desaparecen solas cuando su causa se resuelve."
      />

      {alerts.length === 0 ? (
        <EmptyState title="Sin alertas activas" description="Todo está al día." />
      ) : (
        order
          .filter((sev) => groups.has(sev))
          .map((sev) => (
            <section key={sev} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <SeverityBadge severity={sev} />
                <span className="text-muted-foreground">{groups.get(sev)!.length}</span>
              </h2>
              <div className="space-y-2">
                {groups.get(sev)!.map((a, i) => (
                  <Card key={i}>
                    <CardContent className="flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {a.contractId ? (
                            <Link href={`/contratos/${a.contractId}`} className="hover:underline">
                              {a.title}
                            </Link>
                          ) : (
                            a.title
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{a.detail}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {label(a.type)}
                          {a.dueDate ? ` · ${a.dueDate}` : ""}
                        </p>
                      </div>
                      <AlertActions
                        alert={{
                          alertType: a.type,
                          entityType: a.entityType,
                          entityId: a.entityId,
                          referenceDate: a.referenceDate,
                        }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
