import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Paginación por enlaces (funciona sin JavaScript y conserva los filtros de la dirección).
 * `params` son los parámetros actuales; se cambia solo `pagina`.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
  noun = "resultados",
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") sp.set(k, v);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium shadow-sm";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} de {total} {noun}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cn(btn, "hover:bg-surface-muted")}>
              <ChevronLeft className="size-3.5" /> Anterior
            </Link>
          ) : (
            <span className={cn(btn, "opacity-40")}>
              <ChevronLeft className="size-3.5" /> Anterior
            </span>
          )}
          <span className="px-1 text-xs tabular-nums">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className={cn(btn, "hover:bg-surface-muted")}>
              Siguiente <ChevronRight className="size-3.5" />
            </Link>
          ) : (
            <span className={cn(btn, "opacity-40")}>
              Siguiente <ChevronRight className="size-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
