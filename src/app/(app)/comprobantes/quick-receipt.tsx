"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, ImagePlus, SkipForward, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { cn } from "@/lib/utils";
import type { QuickContract } from "@/modules/payments/quick";
import { searchReceiptContractsAction } from "./actions";
import { readReceipt } from "@/shared/ocr/use-receipt-ocr";
import { fmt, PaymentPanel, paymentsWithoutReceipt, type SellerOpt } from "./payment-panel";

type Queued = { key: string; file: File; url: string };
type Done = { contractId: string; number: string; client: string; text: string };


export function QuickReceipt({ sellers, initialQuery = "" }: { sellers: SellerOpt[]; initialQuery?: string }) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<QuickContract[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<QuickContract | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = queue[0] ?? null;

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!list.length) return;
    setQueue((prev) => [
      ...prev,
      ...list.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) })),
    ]);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  // Pegar una captura con Ctrl+V en cualquier parte de la página.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // Empieza a leer la captura en cuanto llega (mientras se busca al cliente).
  useEffect(() => {
    if (current) readReceipt(current.file).catch(() => {});
  }, [current]);

  // Búsqueda mientras se escribe.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchReceiptContractsAction(term);
      setSearching(false);
      if (res.ok) setResults(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function dropCurrent() {
    setQueue((prev) => {
      if (prev[0]) URL.revokeObjectURL(prev[0].url);
      return prev.slice(1);
    });
  }

  function skipCurrent() {
    setQueue((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
  }

  function finish(c: QuickContract, text: string) {
    setDone((prev) => [{ contractId: c.id, number: c.number, client: c.client, text }, ...prev]);
    setMsg({ ok: true, text: `Listo: ${text} en ${c.number} (${c.client}).` });
    dropCurrent();
    setSelected(null);
    setResults([]);
    setQ("");
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* Columna izquierda: la captura */}
      <div className="space-y-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => !current && fileRef.current?.click()}
          className={cn(
            "flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input bg-surface",
            !current && "cursor-pointer hover:bg-surface-muted",
          )}
        >
          {current ? (
            current.file.type === "application/pdf" ? (
              <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                <FileText className="size-10" />
                {current.file.name}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url} alt="Comprobante" className="max-h-[560px] w-full object-contain" />
            )
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <ImagePlus className="size-10" />
              <p className="font-medium text-foreground">Adjuntar comprobante</p>
              <p>Haz clic, arrastra las imágenes aquí o pega una captura con Ctrl+V.</p>
              <p className="text-xs">Puedes elegir varias a la vez: se cargan una tras otra.</p>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> Agregar imágenes
          </Button>
          {current && (
            <>
              <Button variant="ghost" size="sm" onClick={skipCurrent} disabled={queue.length < 2}>
                <SkipForward /> Dejar para después
              </Button>
              <Button variant="ghost" size="sm" onClick={dropCurrent}>
                <Trash2 /> Quitar
              </Button>
            </>
          )}
          {queue.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {queue.length} en cola{current ? ` · ${current.file.name}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Columna derecha: buscar y cargar */}
      <div className="space-y-4">
        {msg && (
          <p className={cn("rounded-md px-3 py-2 text-sm", msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
            {msg.text}
          </p>
        )}

        <Field label="¿De quién es el pago?" htmlFor="q" hint="Escribe el nombre del cliente o el número de contrato">
          <Input
            id="q"
            ref={searchRef}
            value={q}
            autoComplete="off"
            placeholder="Ej.: Karen Chila"
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(null);
            }}
          />
        </Field>

        {!selected && q.trim().length >= 2 && (
          <div className="space-y-1">
            {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}
            {!searching && results.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay contratos con ese nombre.</p>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelected(c);
                  setMsg(null);
                }}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span>
                  <span className="font-medium">{c.client}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.number} · {c.destination}
                    {c.travelDate ? ` · viaja ${c.travelDate}` : ""} · {c.seller?.name ?? "sin vendedor"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block tabular-nums">Debe {fmt(c.balance)}</span>
                  {paymentsWithoutReceipt(c).length > 0 && (
                    <Badge tone="warning">{paymentsWithoutReceipt(c).length} pago(s) sin comprobante</Badge>
                  )}
                  {c.balance <= 0 && c.price > 0 && <Badge tone="success">Pagado completo</Badge>}
                  {c.lifecycleState === "cancelado" && <Badge tone="danger">Cancelado</Badge>}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <PaymentPanel
            key={selected.id}
            c={selected}
            file={current?.file ?? null}
            sellers={sellers}
            onBack={() => setSelected(null)}
            onDone={(text) => finish(selected, text)}
            onError={(text) => setMsg({ ok: false, text })}
          />
        )}

        {done.length > 0 && (
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">Cargados en esta sesión ({done.length})</p>
              {done.map((d, i) => (
                <p key={i} className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" />
                  <Link href={`/contratos/${d.contractId}`} className="text-foreground hover:underline">
                    {d.number}
                  </Link>
                  {d.client} · {d.text}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
