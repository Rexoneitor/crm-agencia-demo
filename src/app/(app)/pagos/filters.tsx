"use client";

import { useRouter } from "next/navigation";
import { Input, Select } from "@/shared/ui/input";

export function PaymentFilters({
  destinations,
  sellers,
  current,
}: {
  destinations: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  current: Record<string, string>;
}) {
  const router = useRouter();
  const set = (key: string, value: string) => {
    const sp = new URLSearchParams(current);
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/pagos?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-muted-foreground">
        Desde
        <Input type="date" value={current.desde ?? ""} onChange={(e) => set("desde", e.target.value)} className="mt-0.5" />
      </label>
      <label className="text-xs text-muted-foreground">
        Hasta
        <Input type="date" value={current.hasta ?? ""} onChange={(e) => set("hasta", e.target.value)} className="mt-0.5" />
      </label>
      <Select className="w-auto" value={current.destino ?? ""} onChange={(e) => set("destino", e.target.value)}>
        <option value="">Todo destino</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </Select>
      <Select className="w-auto" value={current.vendedor ?? ""} onChange={(e) => set("vendedor", e.target.value)}>
        <option value="">Todo vendedor</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </Select>
      <Select className="w-auto" value={current.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)}>
        <option value="">Todo tipo</option>
        <option value="pago_recibido">Pago recibido</option>
        <option value="aplicacion_de_anticipo">Aplicación de anticipo</option>
        <option value="comision_retenida">Comisión retenida</option>
        <option value="descuento">Descuento</option>
        <option value="castigo">Castigo</option>
        <option value="reembolso">Reembolso</option>
      </Select>
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={current.anulados === "1"}
          onChange={(e) => set("anulados", e.target.checked ? "1" : "")}
          className="size-4"
        />
        Ver anulados
      </label>
    </div>
  );
}
