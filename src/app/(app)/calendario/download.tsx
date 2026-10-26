import { CalendarDays } from "lucide-react";

/**
 * Descarga del calendario en Excel (un mes por hoja, como el almanaque de la
 * pantalla). Respeta los filtros que estén puestos en la pantalla.
 */
export function CalendarDownload({ query }: { query: string }) {
  return (
    <a
      href={`/api/export/calendario${query ? `?${query}` : ""}`}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <CalendarDays className="size-4" /> Descargar calendario (Excel)
    </a>
  );
}
