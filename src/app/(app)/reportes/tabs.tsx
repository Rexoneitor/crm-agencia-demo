"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/shared/ui/tabs";
import { Input } from "@/shared/ui/input";

export function ReportTabs({
  range,
  ventas,
  reservas,
  financiero,
  operativo,
}: {
  range: { desde: string; hasta: string };
  ventas: React.ReactNode;
  reservas: React.ReactNode;
  financiero: React.ReactNode;
  operativo: React.ReactNode;
}) {
  const router = useRouter();
  const set = (key: string, value: string) => {
    const sp = new URLSearchParams();
    if (key === "desde") {
      if (value) sp.set("desde", value);
      if (range.hasta) sp.set("hasta", range.hasta);
    } else {
      if (range.desde) sp.set("desde", range.desde);
      if (value) sp.set("hasta", value);
    }
    router.push(`/reportes?${sp.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Desde
          <Input type="date" defaultValue={range.desde} onChange={(e) => set("desde", e.target.value)} className="mt-0.5" />
        </label>
        <label className="text-xs text-muted-foreground">
          Hasta
          <Input type="date" defaultValue={range.hasta} onChange={(e) => set("hasta", e.target.value)} className="mt-0.5" />
        </label>
      </div>
      <Tabs
        tabs={[
          { key: "ventas", label: "Ventas" },
          { key: "reservas", label: "Reservas" },
          { key: "financiero", label: "Financiero" },
          { key: "operativo", label: "Operativo" },
        ]}
      >
        {(active) => (
          <>
            {active === "ventas" && ventas}
            {active === "reservas" && reservas}
            {active === "financiero" && financiero}
            {active === "operativo" && operativo}
          </>
        )}
      </Tabs>
    </div>
  );
}
