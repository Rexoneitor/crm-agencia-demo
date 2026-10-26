import { requireUser } from "@/core/auth";
import { listSellers } from "@/modules/sellers/service";
import { buildReviewQueue, REVIEW_FLAGS } from "@/modules/review/service";
import { PageHeader } from "@/shared/ui/feedback";
import { ReviewQueue } from "./review-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisión rápida" };

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const [items, sellers] = await Promise.all([buildReviewQueue(), listSellers()]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisión rápida"
        description="Un contrato a la vez con lo que le falta. Resuélvelo con los botones o el teclado (pulsa ? para ver los atajos) y pasa al siguiente con las flechas ← →."
      />
      <ReviewQueue
        items={items}
        initial={{ id: sp.c ?? null, index: Number(sp.i) || 0, filter: sp.f ?? "todo" }}
        flagLabels={REVIEW_FLAGS}
        sellers={sellers.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, retainsCommission: s.retainsCommission }))}
      />
    </div>
  );
}
