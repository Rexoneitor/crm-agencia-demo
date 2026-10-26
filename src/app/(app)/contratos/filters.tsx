"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/shared/ui/input";

export function ContractFilters({
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
    sp.delete("pagina"); // un filtro nuevo vuelve a la primera página
    router.push(`/contratos?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        defaultValue={current.q ?? ""}
        placeholder="Buscar N.º o cliente…"
        onKeyDown={(e) => {
          if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
        }}
        className="h-9 min-w-48 rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <Select className="w-auto" value={current.modalidad ?? ""} onChange={(e) => set("modalidad", e.target.value)}>
        <option value="">Toda modalidad</option>
        <option value="fecha_cerrada">Fecha cerrada</option>
        <option value="fecha_abierta">Fecha abierta</option>
      </Select>
      <Select className="w-auto" value={current.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)}>
        <option value="">Todo ámbito</option>
        <option value="nacional">Nacional</option>
        <option value="internacional">Internacional</option>
      </Select>
      <Select className="w-auto" value={current.destino ?? ""} onChange={(e) => set("destino", e.target.value)}>
        <option value="">Todo destino</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Select className="w-auto" value={current.vendedor ?? ""} onChange={(e) => set("vendedor", e.target.value)}>
        <option value="">Todo vendedor</option>
        <option value="none">Sin vendedor</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select className="w-auto" value={current.empresa ?? ""} onChange={(e) => set("empresa", e.target.value)}>
        <option value="">Toda empresa</option>
        <option value="DEMO">Solo DEMO</option>
        <option value="otra">Otras empresas</option>
      </Select>
      <Select className="w-auto" value={current.estado ?? ""} onChange={(e) => set("estado", e.target.value)}>
        <option value="">Todo estado</option>
        <option value="activo">Activo</option>
        <option value="borrador">Borrador</option>
        <option value="cancelado">Cancelado</option>
        <option value="finalizado">Finalizado</option>
      </Select>
      <Select className="w-auto" value={current.pago ?? ""} onChange={(e) => set("pago", e.target.value)}>
        <option value="">Todo pago</option>
        <option value="sin_pagos">Sin pagos</option>
        <option value="parcial">Parcial</option>
        <option value="pagado">Pagado</option>
        <option value="liquidado">Liquidado</option>
      </Select>
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={current.archivados === "1"}
          onChange={(e) => set("archivados", e.target.checked ? "1" : "")}
          className="size-4"
        />
        Ver archivados
      </label>
    </div>
  );
}
