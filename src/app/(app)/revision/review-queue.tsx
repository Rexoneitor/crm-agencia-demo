"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Keyboard, Plane, SkipForward, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { Input, Select, Textarea } from "@/shared/ui/input";
import { cn } from "@/lib/utils";
import type { ReviewFlag, ReviewItem } from "@/modules/review/service";
import { fmt, PaymentPanel, paymentsOf, ReceiptDrop, type SellerOpt } from "../comprobantes/payment-panel";
import {
  reviewConfirmAction,
  reviewDatesAction,
  reviewNoteAction,
  reviewRefundAction,
  reviewSellerAction,
  reviewTraveledAction,
  reviewVoidAction,
} from "./actions";

const SKIP_KEY = "revision-saltados";

function loadSkipped(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ReviewQueue({
  items,
  initial,
  flagLabels,
  sellers,
}: {
  items: ReviewItem[];
  /** Posición guardada en la dirección (?c=contrato&i=posición&f=filtro) para que F5 no vuelva al inicio. */
  initial: { id: string | null; index: number; filter: string };
  flagLabels: Record<ReviewFlag, string>;
  sellers: SellerOpt[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewFlag | "todo">(
    initial.filter in flagLabels ? (initial.filter as ReviewFlag) : "todo",
  );
  const [skipped, setSkipped] = useState<string[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [index, setIndex] = useState(initial.index);
  const [currentId, setCurrentId] = useState<string | null>(initial.id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setSkipped(loadSkipped()), []);

  const list = useMemo(
    () =>
      items.filter(
        (i) => (filter === "todo" || i.flags.includes(filter)) && (showSkipped || !skipped.includes(i.id)),
      ),
    [items, filter, skipped, showSkipped],
  );

  // Tras guardar, si el contrato sigue en la lista se queda en él; si salió, pasa al que ocupa su lugar.
  const pos = currentId ? list.findIndex((i) => i.id === currentId) : -1;
  const i = pos >= 0 ? pos : Math.min(index, Math.max(0, list.length - 1));
  const item = list[i] ?? null;

  // Guarda dónde vas en la dirección (sin recargar): F5 te deja en el mismo contrato.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (item) url.searchParams.set("c", item.id);
    else url.searchParams.delete("c");
    url.searchParams.set("i", String(i));
    url.searchParams.set("f", filter);
    window.history.replaceState(null, "", url);
  }, [item, i, filter]);

  // Al volver a esta pestaña (por ejemplo después de corregir algo en el contrato) se actualiza sola.
  // «focus» y «visibilitychange» llegan juntos: se agrupan para no recargar dos veces.
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 3000) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(list.length - 1, n));
    setIndex(next);
    setCurrentId(list[next]?.id ?? null);
    setMsg(null);
  };

  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc sale de la casilla para poder usar los atajos.
      if (e.key === "Escape" && e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        e.target.blur();
        return;
      }
      if (isTyping(e)) return;
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key.toLowerCase() === "s") skip();
      else if (e.key === "?") setHelp((h) => !h);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function run(text: string, fn: () => Promise<{ ok: boolean; error?: string }>, leave = false) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text });
        if (leave) {
          setIndex(i);
          setCurrentId(null);
        }
        // No hace falta router.refresh(): la acción llama a revalidatePath y Next devuelve la
        // página ya actualizada en la misma respuesta (antes se recalculaba todo dos veces).
      } else setMsg({ ok: false, text: (res as { error?: string }).error ?? "No se pudo guardar" });
    });
  }

  function skip() {
    if (!item) return;
    const next = [...skipped, item.id];
    setSkipped(next);
    try {
      localStorage.setItem(SKIP_KEY, JSON.stringify(next));
    } catch {}
    setIndex(i);
    setCurrentId(null);
    setMsg(null);
  }

  const counts = (f: ReviewFlag) => items.filter((x) => x.flags.includes(f) && (showSkipped || !skipped.includes(x.id))).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "todo"} onClick={() => { setFilter("todo"); go(0); }}>
          Todo ({items.filter((x) => showSkipped || !skipped.includes(x.id)).length})
        </FilterChip>
        {(Object.keys(flagLabels) as ReviewFlag[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => { setFilter(f); setIndex(0); setCurrentId(null); }}>
            {flagLabels[f]} ({counts(f)})
          </FilterChip>
        ))}
        <button
          type="button"
          onClick={() => setHelp((h) => !h)}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={help}
        >
          <Keyboard className="size-3.5" /> Atajos
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} />
          Ver saltados ({skipped.length})
        </label>
      </div>

      {help && <ShortcutHelp onClose={() => setHelp(false)} />}

      {list.length > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((i + 1) / list.length) * 100}%` }} />
        </div>
      )}

      {!item ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm">
            <CheckCircle2 className="size-5 text-success" /> No queda nada pendiente en este filtro.
          </CardContent>
        </Card>
      ) : (
        <ReviewCard
          key={item.id}
          item={item}
          flagLabels={flagLabels}
          sellers={sellers}
          pending={pending}
          msg={msg}
          run={run}
          saved={(text) => setMsg({ ok: true, text })}
          failed={(text) => setMsg({ ok: false, text })}
        />
      )}

      {item && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => go(i - 1)} disabled={i === 0}>
            <ArrowLeft /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {i + 1} de {list.length}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={skip}>
              <SkipForward /> Saltar <Kbd>S</Kbd>
            </Button>
            <Button onClick={() => go(i + 1)} disabled={i >= list.length - 1}>
              Siguiente <ArrowRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

function ReviewCard({
  item,
  flagLabels,
  sellers,
  pending,
  msg,
  run,
  saved,
  failed,
}: {
  item: ReviewItem;
  flagLabels: Record<ReviewFlag, string>;
  sellers: SellerOpt[];
  saved: (text: string) => void;
  failed: (text: string) => void;
  pending: boolean;
  msg: { ok: boolean; text: string } | null;
  run: (text: string, fn: () => Promise<{ ok: boolean; error?: string }>, leave?: boolean) => void;
}) {
  const r = item.reservation;
  const [checkIn, setCheckIn] = useState(r?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(r?.checkOut ?? "");
  const [note, setNote] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [channel, setChannel] = useState("whatsapp");
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const confirmed = r?.state === "confirmada";
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Atajos de la tarjeta: V = ya viajó · C = confirmada · N = nota · P = pago.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || pending) return;
      const k = e.key.toLowerCase();
      if (k === "v") {
        e.preventDefault();
        run("Marcado como «ya viajó».", () => reviewTraveledAction(item.id), true);
      } else if (k === "c" && r && !confirmed) {
        e.preventDefault();
        run("Reserva confirmada.", () => reviewConfirmAction(item.id));
      } else if (k === "n") {
        e.preventDefault();
        noteRef.current?.focus();
      } else if (k === "p") {
        e.preventDefault();
        cardRef.current?.querySelector<HTMLInputElement>("#atsMajor")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item.id, r, confirmed, pending, run]);

  return (
    <Card ref={cardRef}>
      <CardContent className="space-y-5 p-4 sm:p-6">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold tracking-tight">{item.client}</p>
            <p className="text-sm text-muted-foreground">
              <Link href={`/contratos/${item.id}`} target="_blank" className="inline-flex items-center gap-1 hover:underline">
                {item.number} <ExternalLink className="size-3" />
              </Link>{" "}
              · {item.destination}
              {item.hotel ? ` · ${item.hotel}` : ""} · {item.modality}
              {item.group ? ` · Grupo: ${item.group}` : ""}
            </p>
            {(item.phone || item.email) && (
              <p className="text-xs text-muted-foreground">{[item.phone, item.email].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {item.issuer !== "DEMO" && <Badge tone="warning">{item.issuer}</Badge>}
            {item.flags.map((f) => (
              <Badge key={f} tone={f === "viaje_pasado" || f === "sin_pagos" ? "danger" : "warning"}>
                {flagLabels[f]}
              </Badge>
            ))}
          </div>
        </div>

        {msg && (
          <p className={cn("rounded-md px-3 py-2 text-sm", msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
            {msg.text}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Viaje */}
          <Section title="Viaje">
            <p className="text-sm">
              {r ? (
                <>
                  {r.checkIn} → {r.checkOut ?? "?"} · <b>{r.stateLabel}</b>
                </>
              ) : (
                <>Sin fecha agendada{item.vigencia ? ` · vigencia ${item.vigencia}` : ""}</>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => run("Marcado como «ya viajó».", () => reviewTraveledAction(item.id), true)}>
                <Plane /> Ya viajó <Kbd>V</Kbd>
              </Button>
              {r && !confirmed && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("Reserva confirmada.", () => reviewConfirmAction(item.id))}>
                  <CheckCircle2 /> Está confirmada <Kbd>C</Kbd>
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Entrada
                <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-40" />
              </label>
              <label className="text-xs text-muted-foreground">
                Salida
                <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-40" />
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || !checkIn || !checkOut || (checkIn === r?.checkIn && checkOut === r?.checkOut)}
                onClick={() => run(r ? "Fecha cambiada." : "Fecha agendada.", () => reviewDatesAction(item.id, checkIn, checkOut))}
              >
                {r ? "Cambiar fecha" : "Agendar fecha"}
              </Button>
            </div>
          </Section>

          {/* Vendedor */}
          <Section title="Vendedor">
            <Select
              value={item.seller?.id ?? ""}
              disabled={pending}
              onChange={(e) => run("Vendedor guardado.", () => reviewSellerAction(item.id, e.target.value))}
            >
              <option value="">— Sin vendedor —</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Section>

          {/* Reembolso y notas */}
          <Section title="Reembolso y notas">
            {item.refunds.length > 0 ? (
              <p className="text-sm">
                Tiene {item.refunds.length} solicitud(es) de reembolso ·{" "}
                <Link href={`/reembolsos/${item.refunds[0].id}`} target="_blank" className="text-primary hover:underline">
                  ver
                </Link>
              </p>
            ) : refundOpen ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-40">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="correo">Correo</option>
                    <option value="telefono">Teléfono</option>
                    <option value="presencial">Presencial</option>
                    <option value="otro">Otro</option>
                  </Select>
                  <Input placeholder="Monto que pide" type="number" min={0} value={requested} onChange={(e) => setRequested(e.target.value)} />
                </div>
                <Input placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending || reason.trim().length < 5}
                    onClick={() =>
                      run("Solicitud de reembolso registrada.", () =>
                        reviewRefundAction(item.id, { clientName: item.client, channel, reason, requestedMajor: requested }),
                      )
                    }
                  >
                    Registrar reembolso
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRefundOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setRefundOpen(true)}>
                Pidió reembolso
              </Button>
            )}
            {item.notes && <p className="whitespace-pre-line rounded-md bg-surface-muted p-2 text-xs text-muted-foreground">{item.notes}</p>}
            <Textarea ref={noteRef} rows={2} placeholder="Agregar una nota… (tecla N)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !note.trim()}
              onClick={() => run("Nota guardada.", async () => { const res = await reviewNoteAction(item.id, note); if (res.ok) setNote(""); return res; })}
            >
              Guardar nota
            </Button>
          </Section>
        </div>

        {/* Pagos y comprobante: se carga aquí mismo, sin cambiar de página */}
        <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comprobante</p>
            <ReceiptDrop file={file} onFile={setFile} />
            {paymentsOf(item.pay).some((p) => p.hasReceipt) && (
              <p className="text-xs text-success">
                {paymentsOf(item.pay).filter((p) => p.hasReceipt).length} pago(s) ya tienen comprobante.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagos</p>
            {item.pay.entries.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {item.pay.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="tabular-nums">
                      {e.valueDate} · {e.kind === "comision_retenida" ? "vendedor" : "agencia"} {fmt(e.amount)}
                      {e.kind === "pago_recibido" && (
                        <span className={cn("ml-2 text-xs", e.hasReceipt ? "text-success" : "text-warning")}>
                          {e.hasReceipt ? "con comprobante" : "sin comprobante"}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        const why = window.prompt(`¿Por qué anulas este asiento de ${fmt(e.amount)}? (queda en el historial)`, "Pago cargado por error");
                        if (why && why.trim().length >= 5) run("Asiento anulado.", () => reviewVoidAction(item.id, e.id, why.trim()));
                      }}
                    >
                      Anular
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <PaymentPanel
              bare
              c={item.pay}
              file={file}
              sellers={sellers}
              onDone={(text) => {
                setFile(null);
                saved(`Listo: ${text}.`);
              }}
              onError={failed}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}


/** ¿Está escribiendo en un campo, o es una combinación (Ctrl+V para pegar, etc.)? */
function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 hidden rounded border border-current/30 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">{children}</kbd>
  );
}

const SHORTCUTS: [string, string][] = [
  ["← →", "Contrato anterior / siguiente"],
  ["V", "Ya viajó"],
  ["C", "Está confirmada"],
  ["S", "Saltar"],
  ["P", "Escribir el pago (¿cuánto entró?)"],
  ["N", "Escribir una nota"],
  ["Ctrl + V", "Pegar la captura del comprobante"],
  ["?", "Mostrar u ocultar esta ayuda"],
];

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative rounded-xl border border-border bg-surface p-4 shadow-card">
      <button type="button" onClick={onClose} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" aria-label="Cerrar ayuda">
        <X className="size-4" />
      </button>
      <p className="mb-2 text-sm font-semibold">Atajos de teclado</p>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="flex items-center gap-3">
            <dt className="w-20 shrink-0">
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-xs font-medium">{k}</kbd>
            </dt>
            <dd className="text-muted-foreground">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">No funcionan mientras escribes en una casilla (haz clic fuera o pulsa Esc).</p>
    </div>
  );
}
