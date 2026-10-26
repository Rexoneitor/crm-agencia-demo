import Link from "next/link";
import { requireUser } from "@/core/auth";
import { globalSearch } from "@/modules/search/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Badge } from "@/shared/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Búsqueda" };

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const hits = q ? await globalSearch(q) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Búsqueda" description={q ? `Resultados para "${q}"` : undefined} />

      <form className="max-w-md">
        <input
          name="q"
          defaultValue={q ?? ""}
          autoFocus
          placeholder="Cliente, contrato, referencia, vendedor, destino…"
          className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </form>

      {!q ? null : hits.length === 0 ? (
        <EmptyState title="Sin resultados" description="Prueba con otro término." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {hits.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <Link href={h.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <Badge tone="outline">{h.type}</Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{h.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{h.subtitle}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
