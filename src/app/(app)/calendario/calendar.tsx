"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleDashed, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/input";
import { EmptyState } from "@/shared/ui/feedback";
import { ReservationBadge } from "@/shared/ui/state-badge";
import { label } from "@/core/domain/enums";
import type { CalendarReservation } from "@/modules/reservations/service";

type View = "mes" | "semana" | "lista" | "destino";

const FILTER_KEYS = ["destino", "hotel", "ambito", "vendedor", "confirmacion", "pago"] as const;
const VIEW_LABEL: Record<View, string> = { mes: "Mes", semana: "Semana", lista: "Lista", destino: "Por destino" };

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}
function monthLabel(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", timeZone: "UTC" });
}
function weekdayShort(iso: string) {
  return new Date(iso + "T00:00:00Z")
    .toLocaleDateString("es-CO", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
}

const PAY_DOT: Record<string, string> = {
  sin_pagos: "bg-danger",
  parcial: "bg-warning",
  pagado: "bg-success",
  liquidado: "bg-primary",
};

function StateIcon({ state }: { state: string }) {
  if (state === "confirmada") return <CheckCircle2 className="size-3.5 text-success" />;
  if (state === "cancelada") return <XCircle className="size-3.5 text-danger" />;
  if (state === "requiere_cambio_fecha") return <CalendarClock className="size-3.5 text-warning" />;
  return <CircleDashed className="size-3.5 text-warning" />;
}

export function CalendarView({
  reservations,
  destinations,
  hotels,
  sellers,
  filters,
}: {
  reservations: CalendarReservation[];
  destinations: { id: string; name: string; color: string }[];
  hotels: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  filters: Record<string, string>;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("mes");
  const todayIso = ymd(new Date());
  const [anchor, setAnchor] = useState(todayIso.slice(0, 8) + "01");
  const [selected, setSelected] = useState<CalendarReservation | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("cal.view");
      if (v === "mes" || v === "semana" || v === "lista" || v === "destino") setView(v);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("cal.view", view);
    } catch {}
  }, [view]);

  const setFilter = (key: string, value: string) => {
    const sp = new URLSearchParams(filters);
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/calendario?${sp.toString()}`);
  };

  const monthPrefix = anchor.slice(0, 7);
  const monthReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.checkIn.startsWith(monthPrefix))
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.destination.localeCompare(b.destination)),
    [reservations, monthPrefix],
  );

  const activeFilters = FILTER_KEYS.filter((k) => filters[k]);

  return (
    <div className="space-y-4">
      {/* Barra superior: vistas + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["mes", "semana", "lista", "destino"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1 text-sm",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        <Select className="w-auto" value={filters.destino ?? ""} onChange={(e) => setFilter("destino", e.target.value)}>
          <option value="">Todo destino</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select className="w-auto" value={filters.ambito ?? ""} onChange={(e) => setFilter("ambito", e.target.value)}>
          <option value="">Nac./Int.</option>
          <option value="nacional">Nacional</option>
          <option value="internacional">Internacional</option>
        </Select>
        <Select className="w-auto" value={filters.vendedor ?? ""} onChange={(e) => setFilter("vendedor", e.target.value)}>
          <option value="">Todo vendedor</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Select className="w-auto" value={filters.hotel ?? ""} onChange={(e) => setFilter("hotel", e.target.value)}>
          <option value="">Todo hotel</option>
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </Select>
        <Select className="w-auto" value={filters.confirmacion ?? ""} onChange={(e) => setFilter("confirmacion", e.target.value)}>
          <option value="">Confirmación</option>
          <option value="confirmada">Confirmadas</option>
          <option value="pendiente">Pendientes</option>
        </Select>
        <Select className="w-auto" value={filters.pago ?? ""} onChange={(e) => setFilter("pago", e.target.value)}>
          <option value="">Estado de pago</option>
          <option value="sin_pagos">Sin pagos</option>
          <option value="parcial">Parcial</option>
          <option value="pagado">Pagado</option>
          <option value="liquidado">Liquidado</option>
        </Select>
        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/calendario")}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Navegación de mes (solo en vista Mes) */}
      {view === "mes" && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => setAnchor(addMonths(anchor, -1))} aria-label="Mes anterior">
            <ChevronLeft />
          </Button>
          <span className="min-w-44 text-center text-base font-semibold capitalize">{monthLabel(anchor)}</span>
          <Button variant="secondary" size="icon" onClick={() => setAnchor(addMonths(anchor, 1))} aria-label="Mes siguiente">
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayIso.slice(0, 8) + "01")}>
            Este mes
          </Button>
          <span className="ml-auto text-sm font-medium">
            {monthReservations.length} reserva{monthReservations.length === 1 ? "" : "s"} este mes
          </span>
        </div>
      )}

      {view === "mes" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <MonthGrid
            byDay={groupByDay(monthReservations)}
            anchor={anchor}
            today={todayIso}
            selectedId={selected?.contractId}
            onSelect={setSelected}
          />
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            {selected ? (
              <SidePanel reservation={selected} onBack={() => setSelected(null)} />
            ) : (
              <MonthAgenda
                reservations={monthReservations}
                anchor={anchor}
                today={todayIso}
                onSelect={setSelected}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            {reservations.length === 0 ? (
              <EmptyState title="Sin reservas" description="Ninguna reserva coincide con los filtros." />
            ) : view === "lista" ? (
              <ListView items={reservations} today={todayIso} onSelect={setSelected} selected={selected} />
            ) : view === "destino" ? (
              <ByDestinationView items={reservations} onSelect={setSelected} />
            ) : (
              <WeekView items={reservations} anchor={anchor} setAnchor={setAnchor} today={todayIso} onSelect={setSelected} />
            )}
          </div>
          <div>
            {selected ? (
              <SidePanel reservation={selected} onBack={() => setSelected(null)} />
            ) : (
              <div className="hidden rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground lg:block">
                Selecciona una reserva para ver el detalle.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agrupación por día ───────────────────────────────────────────────────

function groupByDay(items: CalendarReservation[]) {
  const map = new Map<string, CalendarReservation[]>();
  for (const r of items) {
    const arr = map.get(r.checkIn);
    if (arr) arr.push(r);
    else map.set(r.checkIn, [r]);
  }
  return map;
}

// ── Cuadrícula del mes ───────────────────────────────────────────────────

function MonthGrid({
  byDay,
  anchor,
  today,
  selectedId,
  onSelect,
}: {
  byDay: Map<string, CalendarReservation[]>;
  anchor: string;
  today: string;
  selectedId?: string;
  onSelect: (r: CalendarReservation) => void;
}) {
  const first = new Date(anchor + "T00:00:00Z");
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
        <div key={d} className="bg-surface-muted p-2 text-center font-medium text-muted-foreground">{d}</div>
      ))}
      {cells.map((iso, i) => {
        const dayRes = iso ? byDay.get(iso) ?? [] : [];
        return (
          <div
            key={i}
            className={cn(
              "min-h-28 space-y-1 bg-surface p-1",
              iso === today && "bg-primary/5 ring-1 ring-inset ring-primary",
              !iso && "bg-surface-muted/40",
            )}
          >
            {iso && (
              <div className={cn("px-1 text-right text-[11px]", iso === today ? "font-bold text-primary" : "text-muted-foreground")}>
                {Number(iso.slice(-2))}
              </div>
            )}
            {dayRes.slice(0, 4).map((r) => (
              <button
                key={r.contractId}
                onClick={() => onSelect(r)}
                title={`${r.client} · ${r.destination} · ${label(r.state)}`}
                className={cn(
                  "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-all",
                  r.state === "cancelada" ? "opacity-60 line-through" : "hover:brightness-110",
                  selectedId === r.contractId && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
                )}
                style={{
                  backgroundColor: r.state === "cancelada" ? "transparent" : `${r.color}22`,
                  border: `1px solid ${r.color}${r.state === "cancelada" ? "55" : "99"}`,
                  borderStyle: r.state === "pendiente_confirmacion" ? "dashed" : "solid",
                }}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{r.clientShort}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{r.passengers}</span>
                <span className={cn("size-1.5 shrink-0 rounded-full", PAY_DOT[r.paymentState] ?? "bg-muted-foreground")} />
              </button>
            ))}
            {dayRes.length > 4 && (
              <p className="px-1 text-[10px] text-muted-foreground">+{dayRes.length - 4} más →</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Agenda del mes (panel derecho, siempre visible) ─────────────────────

function MonthAgenda({
  reservations,
  anchor,
  today,
  onSelect,
}: {
  reservations: CalendarReservation[];
  anchor: string;
  today: string;
  onSelect: (r: CalendarReservation) => void;
}) {
  const byDay = groupByDay(reservations);
  const days = [...byDay.keys()].sort();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-muted/50 px-3 py-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Reservas de {monthLabel(anchor)}</p>
        <p className="text-[11px] text-muted-foreground">
          Todas, en orden. Toca una para ver el detalle.
        </p>
      </div>

      {reservations.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No hay reservas este mes.
          <br />
          Usa las flechas de arriba para ver otro mes.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {days.map((day) => (
            <div key={day}>
              <p
                className={cn(
                  "sticky top-0 bg-surface px-3 py-1.5 text-xs font-semibold capitalize",
                  day === today ? "text-primary" : "text-foreground",
                )}
              >
                {dayLabel(day)}
                {day === today && <span className="ml-1 text-[10px] font-normal">· hoy</span>}
              </p>
              {byDay.get(day)!.map((r) => (
                <button
                  key={r.contractId}
                  onClick={() => onSelect(r)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-muted/60",
                    r.state === "cancelada" && "opacity-60",
                  )}
                >
                  <span className="mt-0.5 inline-block h-9 w-1.5 shrink-0 rounded" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <StateIcon state={r.state} />
                      <span className={cn("truncate font-medium", r.state === "cancelada" && "line-through")}>
                        {r.client}
                      </span>
                      {r.group && (
                        <span className="shrink-0 rounded-full border border-border bg-surface-muted px-1.5 py-px text-[10px] text-muted-foreground">
                          {r.group}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.destination}
                      {r.hotel ? ` · ${r.hotel}` : ""}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{r.passengers} pax</span>
                      <span className={cn("size-1.5 rounded-full", PAY_DOT[r.paymentState] ?? "bg-muted-foreground")} />
                      <span>{label(r.paymentState)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Otras vistas ────────────────────────────────────────────────────────

function Nav({
  anchor,
  setAnchor,
  step,
  labelText,
}: {
  anchor: string;
  setAnchor: (s: string) => void;
  step: number;
  labelText: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Button variant="secondary" size="icon" onClick={() => setAnchor(addDays(anchor, -step))}>
        <ChevronLeft />
      </Button>
      <span className="min-w-40 text-center text-sm font-medium">{labelText}</span>
      <Button variant="secondary" size="icon" onClick={() => setAnchor(addDays(anchor, step))}>
        <ChevronRight />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAnchor(ymd(new Date()))}>
        Hoy
      </Button>
    </div>
  );
}

function Pill({ r, onSelect }: { r: CalendarReservation; onSelect: (r: CalendarReservation) => void }) {
  return (
    <button
      onClick={() => onSelect(r)}
      title={`${r.client} · ${r.destination} · ${label(r.state)}`}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs",
        r.state === "cancelada" ? "opacity-60 line-through" : "hover:brightness-110",
      )}
      style={{
        backgroundColor: r.state === "cancelada" ? "transparent" : `${r.color}22`,
        border: `1px solid ${r.color}99`,
        borderStyle: r.state === "pendiente_confirmacion" ? "dashed" : "solid",
      }}
    >
      <span className="inline-block h-3 w-1 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
      <span className="min-w-0 flex-1 truncate">{r.clientShort}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{r.passengers}p</span>
      <span className={cn("size-1.5 shrink-0 rounded-full", PAY_DOT[r.paymentState] ?? "bg-muted-foreground")} />
    </button>
  );
}

function WeekView({
  items,
  anchor,
  setAnchor,
  today,
  onSelect,
}: {
  items: CalendarReservation[];
  anchor: string;
  setAnchor: (s: string) => void;
  today: string;
  onSelect: (r: CalendarReservation) => void;
}) {
  const d = new Date(anchor + "T00:00:00Z");
  const weekday = (d.getUTCDay() + 6) % 7;
  const monday = addDays(anchor, -weekday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <div>
      <Nav anchor={anchor} setAnchor={setAnchor} step={7} labelText={`Semana del ${monday}`} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((iso) => {
          const dayRes = items.filter((r) => r.checkIn === iso);
          return (
            <div key={iso} className={cn("rounded-lg border border-border bg-surface p-2", iso === today && "ring-1 ring-primary")}>
              <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">
                {weekdayShort(iso)} {Number(iso.slice(-2))}
              </p>
              <div className="space-y-1">
                {dayRes.map((r) => <Pill key={r.contractId} r={r} onSelect={onSelect} />)}
                {dayRes.length === 0 && <p className="text-[11px] text-muted-foreground">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  items,
  today,
  onSelect,
  selected,
}: {
  items: CalendarReservation[];
  today: string;
  onSelect: (r: CalendarReservation) => void;
  selected: CalendarReservation | null;
}) {
  const sorted = [...items].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const upcoming = sorted.filter((r) => r.checkIn >= today);
  const past = sorted.filter((r) => r.checkIn < today).reverse();

  const rowFor = (r: CalendarReservation) => (
    <button
      key={r.contractId}
      onClick={() => onSelect(r)}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left text-sm last:border-0 hover:bg-surface-muted/50",
        selected?.contractId === r.contractId && "bg-surface-muted",
      )}
    >
      <span className="inline-block h-8 w-1 shrink-0 rounded" style={{ backgroundColor: r.color }} />
      <div className="w-24 shrink-0 tabular-nums text-muted-foreground">{r.checkIn}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.client}</p>
        <p className="truncate text-xs text-muted-foreground">
          {r.destination}
          {r.hotel ? ` · ${r.hotel}` : ""} · {r.passengers} pax
        </p>
      </div>
      <ReservationBadge state={r.state} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <p className="border-b border-border bg-surface-muted/50 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
          Próximas ({upcoming.length})
        </p>
        {upcoming.length ? upcoming.map(rowFor) : <p className="px-3 py-4 text-sm text-muted-foreground">Sin reservas próximas.</p>}
      </div>
      {past.length > 0 && (
        <details className="overflow-hidden rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            Pasadas ({past.length})
          </summary>
          {past.map(rowFor)}
        </details>
      )}
    </div>
  );
}

function ByDestinationView({
  items,
  onSelect,
}: {
  items: CalendarReservation[];
  onSelect: (r: CalendarReservation) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { color: string; rows: CalendarReservation[] }>();
    for (const r of items) {
      const g = map.get(r.destination) ?? { color: r.color, rows: [] };
      g.rows.push(r);
      map.set(r.destination, g);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div className="space-y-4">
      {groups.map(([name, g]) => (
        <div key={name} className="overflow-hidden rounded-lg border border-border bg-surface">
          <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
            <span className="inline-block size-3 rounded-full" style={{ backgroundColor: g.color }} />
            {name} <span className="text-muted-foreground">({g.rows.length})</span>
          </p>
          {g.rows.map((r) => (
            <button
              key={r.contractId}
              onClick={() => onSelect(r)}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-muted/50"
            >
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{r.checkIn}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.client}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{r.passengers} pax</span>
              <ReservationBadge state={r.state} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SidePanel({
  reservation: r,
  onBack,
}: {
  reservation: CalendarReservation;
  onBack: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface text-sm">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <ChevronLeft className="size-3.5" /> volver a la agenda
        </button>
        <span className="inline-block h-4 w-8 rounded" style={{ backgroundColor: r.color }} />
      </div>
      <div className="p-4">
        <p className="text-base font-semibold">{r.client}</p>
        <p className="text-muted-foreground">{r.number}</p>
        <dl className="mt-3 space-y-1.5">
          {[
            ["Destino", r.destination],
            ["Hotel", r.hotel ?? "—"],
            ["Entrada", r.checkIn],
            ["Salida", r.checkOut],
            ["Pasajeros", `${r.passengers}`],
            ["Vendedor", r.seller ?? "—"],
            ["Precio", r.priceFormatted],
            ["Saldo", r.balanceFormatted],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1 last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <ReservationBadge state={r.state} />
        </div>
        <Link
          href={`/contratos/${r.contractId}`}
          className="mt-4 block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Abrir contrato
        </Link>
      </div>
    </div>
  );
}
