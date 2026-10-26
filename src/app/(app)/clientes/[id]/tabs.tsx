"use client";

import { Tabs } from "@/shared/ui/tabs";

export function ClientDetailTabs({
  counts,
  resumen,
  contratos,
  documentos,
  notas,
  historial,
}: {
  counts: { contratos: number; documentos: number; notas: number; historial: number };
  resumen: React.ReactNode;
  contratos: React.ReactNode;
  documentos: React.ReactNode;
  notas: React.ReactNode;
  historial: React.ReactNode;
}) {
  return (
    <Tabs
      tabs={[
        { key: "resumen", label: "Resumen" },
        { key: "contratos", label: "Contratos", count: counts.contratos },
        { key: "documentos", label: "Documentos", count: counts.documentos },
        { key: "notas", label: "Notas", count: counts.notas },
        { key: "historial", label: "Historial", count: counts.historial },
      ]}
    >
      {(active) => (
        <>
          {active === "resumen" && resumen}
          {active === "contratos" && contratos}
          {active === "documentos" && documentos}
          {active === "notas" && notas}
          {active === "historial" && historial}
        </>
      )}
    </Tabs>
  );
}
