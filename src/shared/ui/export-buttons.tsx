import { Download } from "lucide-react";

/**
 * Enlaces de descarga a la exportación (XLSX / CSV) de una entidad.
 * Formatos abiertos y editables: se abren en Excel, LibreOffice o Google Sheets.
 * Son `<a>` normales: la descarga la sirve `/api/export/[kind]`.
 */
export function ExportButtons({
  kind,
  label = "Exportar",
}: {
  kind: "contratos" | "clientes" | "reservas" | "pagos" | "vendedores" | "cupos" | "reembolsos" | "grupos";
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1 text-sm">
      <span className="flex items-center gap-1 pl-2 pr-1 text-muted-foreground">
        <Download className="size-4" /> {label}
      </span>
      <a
        href={`/api/export/${kind}?format=xlsx`}
        className="rounded px-2 py-1 font-medium hover:bg-surface-muted"
      >
        Excel
      </a>
      <a
        href={`/api/export/${kind}?format=csv`}
        className="rounded px-2 py-1 font-medium hover:bg-surface-muted"
      >
        CSV
      </a>
    </div>
  );
}
