"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ImagePlus, Info, Loader2, Paperclip, ScanText, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { cn } from "@/lib/utils";
import { useReceiptOcr, type OcrState } from "@/shared/ocr/use-receipt-ocr";
import type { QuickContract } from "@/modules/payments/quick";
import { quickAttachAction, quickPayAction } from "./actions";

export type SellerOpt = { id: string; name: string; retainsCommission: boolean };

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const today = () => new Date().toLocaleDateString("en-CA");
/** Dos montos iguales al peso (los pagos se guardan sin centavos en la práctica). */
const near = (a: number, b: number) => Math.abs(a - b) < 1;
/**
 * Regla de la agencia: el vendedor que retiene comisión se queda el 30 % y a DEMO entra el 70 %.
 * Si entró X a la agencia, el vendedor se quedó X × 30/70.
 */
const SELLER_PER_ATS = 3 / 7;

export interface QuickPayment {
  id: string;
  valueDate: string;
  /** Lo que entró a la agencia. */
  amount: number;
  /** Comisión retenida por el vendedor ese mismo día (el cliente pagó ambas partes juntas). */
  retained: number;
  hasReceipt: boolean;
}

/** Pagos recibidos vigentes del contrato, con la comisión retenida del mismo día. */
export function paymentsOf(c: QuickContract): QuickPayment[] {
  return c.entries
    .filter((e) => e.kind === "pago_recibido")
    .map((e) => ({
      id: e.id,
      valueDate: e.valueDate,
      amount: e.amount,
      hasReceipt: e.hasReceipt,
      retained: c.entries
        .filter((x) => x.kind === "comision_retenida" && x.valueDate === e.valueDate)
        .reduce((a, x) => a + x.amount, 0),
    }));
}

/** Pagos que todavía no tienen comprobante. */
export function paymentsWithoutReceipt(c: QuickContract): QuickPayment[] {
  return paymentsOf(c).filter((p) => !p.hasReceipt);
}

/**
 * Panel para cargar un pago con su captura: adjuntarla a un pago que no tenía comprobante
 * o registrar uno nuevo (con la parte que retuvo el vendedor). Lo usan «Subir comprobante»
 * y «Revisión rápida».
 *
 * Para que no se repitan los errores de carga:
 *  - se escribe lo que ENTRÓ a la agencia (lo que dice la captura) y aparte lo del vendedor;
 *  - siempre se ve el resumen «Agencia + Vendedor = Cliente pagó» y cómo queda el saldo;
 *  - si el monto coincide con un pago ya cargado sin comprobante, se ofrece «Adjuntar aquí»
 *    y para registrar otro hay que confirmarlo; lo mismo si quedaría pagando de más.
 */
export function PaymentPanel({
  c,
  file,
  sellers,
  onBack,
  onDone,
  onError,
  bare = false,
}: {
  c: QuickContract;
  file: File | null;
  sellers: SellerOpt[];
  /** Sin tarjeta ni cabecera (cuando va dentro de otra pantalla). */
  bare?: boolean;
  onBack?: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [sellerId, setSellerId] = useState(c.seller?.id ?? "");
  const seller = c.seller ?? sellers.find((s) => s.id === sellerId) ?? null;
  const [ats, setAts] = useState("");
  const [sellerPart, setSellerPart] = useState("");
  const [touchedSeller, setTouchedSeller] = useState(false);
  const [valueDate, setValueDate] = useState(today);
  const [reference, setReference] = useState("");
  const [fromOcr, setFromOcr] = useState<{ amount?: boolean; date?: boolean; reference?: boolean }>({});
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  // Lectura automática de la captura: propone monto, fecha y referencia (solo si el campo está vacío).
  const ocr = useReceiptOcr(file);
  const appliedFor = useRef<File | null>(null);
  useEffect(() => {
    if (ocr.status !== "done" || !ocr.guess || !file || appliedFor.current === file) return;
    appliedFor.current = file;
    const g = ocr.guess;
    const marks: typeof fromOcr = {};
    if (g.amount && !ats) {
      setAts(String(g.amount));
      marks.amount = true;
    }
    if (g.date && !fromOcr.date && valueDate === today()) {
      setValueDate(g.date);
      marks.date = true;
    }
    if (g.reference && !reference) {
      setReference(g.reference);
      marks.reference = true;
    }
    setFromOcr(marks);
    // Solo al terminar de leer una captura nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocr, file]);

  const pays = useMemo(() => paymentsOf(c), [c]);
  const without = pays.filter((p) => !p.hasReceipt);

  // Si el vendedor retiene comisión, se sugiere el 30 % de lo que pagó el cliente.
  const atsN = Number(ats) || 0;
  const suggested = seller?.retainsCommission ? Math.round(atsN * SELLER_PER_ATS) : 0;
  const sellerValue = touchedSeller ? sellerPart : suggested ? String(suggested) : "";
  const sellerN = Number(sellerValue) || 0;
  /** Lo que pagó el cliente en total = lo de la agencia + lo del vendedor. */
  const total = atsN + sellerN;
  const balanceAfter = c.balance - total;

  const matches = (p: QuickPayment) => total > 0 && (near(p.amount, atsN) || near(p.amount + p.retained, total));
  const noReceiptMatch = without.find(matches);
  const dupWithReceipt = !noReceiptMatch ? pays.find((p) => p.hasReceipt && matches(p)) : undefined;
  const overpay = total > 0 && c.balance >= 0 && balanceAfter < -0.5;
  const paidInFull = c.price > 0 && c.balance <= 0;
  const needsConfirm = !!noReceiptMatch || !!dupWithReceipt || overpay;
  const confirmKey = `${atsN}|${sellerN}`;
  const confirmed = confirmedFor === confirmKey;

  const notOther = seller?.retainsCommission && sellerN > 0 && Math.abs(sellerN - suggested) > Math.max(1, suggested * 0.02);

  async function attach(entryId: string, amount: number) {
    if (!file) return onError("Primero adjunta la captura.");
    setPending(true);
    const fd = new FormData();
    fd.set("contractId", c.id);
    fd.set("entryId", entryId);
    fd.set("receipt", file);
    const res = await quickAttachAction(fd);
    setPending(false);
    if (res.ok) onDone(`comprobante adjuntado al pago de ${fmt(amount)}`);
    else onError(res.error);
  }

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (needsConfirm && !confirmed) return;
    const form = e.currentTarget;
    setPending(true);
    const fd = new FormData(form);
    fd.set("contractId", c.id);
    fd.set("sellerMajor", sellerValue || "0");
    if (file) fd.set("receipt", file);
    const res = await quickPayAction(fd);
    setPending(false);
    if (res.ok) {
      const text = `pago de ${fmt(total)}: agencia ${fmt(atsN)}${sellerN ? ` + vendedor ${fmt(sellerN)}` : ""}`;
      setAts("");
      setSellerPart("");
      setTouchedSeller(false);
      setReference("");
      setValueDate(today());
      setFromOcr({});
      setConfirmedFor(null);
      form.reset();
      onDone(text);
    } else onError(res.error);
  }

  const body = (
    <>
      {!bare && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href={`/contratos/${c.id}`} target="_blank" className="font-semibold hover:underline">
              {c.client}
            </Link>
            <p className="text-xs text-muted-foreground">
              {c.number} · {c.destination}
              {c.travelDate ? ` · viaja ${c.travelDate}` : ""}
              {c.issuer !== "DEMO" ? ` · ${c.issuer}` : ""}
            </p>
          </div>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              Cambiar
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Precio" value={fmt(c.price)} />
        <Stat label="Entró a DEMO" value={fmt(c.received)} />
        <Stat label="Retuvo vendedor" value={fmt(c.retained)} />
        <Stat label="Le queda" value={fmt(c.balance)} strong tone={c.balance <= 0 && c.price > 0 ? "success" : undefined} />
      </div>

      {paidInFull && (
        <p className="flex items-start gap-2 rounded-lg bg-success-bg px-3 py-2 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Este contrato ya está pagado completo. Si la captura es de un pago que ya estaba cargado, usa «Adjuntar aquí».
        </p>
      )}

      <OcrNotice ocr={ocr} hasFile={!!file} />

      {without.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-bg/60 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Paperclip className="size-4" /> ¿La captura es de un pago que ya está cargado?
          </p>
          {without.map((p) => {
            const hit = noReceiptMatch?.id === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm",
                  hit && "bg-surface ring-2 ring-warning",
                )}
              >
                <span className="tabular-nums">
                  {fmt(p.amount)}
                  {p.retained ? ` + vendedor ${fmt(p.retained)}` : ""} · {p.valueDate}
                  {hit && <span className="ml-2 text-xs font-semibold text-warning">← coincide con el monto</span>}
                </span>
                <Button size="sm" variant={hit ? "primary" : "secondary"} disabled={pending || !file} onClick={() => attach(p.id, p.amount)}>
                  Adjuntar aquí
                </Button>
              </div>
            );
          })}
          {!file && <p className="text-xs text-muted-foreground">Adjunta la captura para poder usar «Adjuntar aquí».</p>}
        </div>
      )}

      <form onSubmit={pay} className="space-y-3">
        <p className="text-sm font-semibold">{without.length > 0 ? "O registrar un pago NUEVO" : "Registrar el pago"}</p>
        {!c.seller && (
          <Field label="Vendedor" htmlFor="sellerId" hint="El contrato no tiene vendedor: elígelo y queda asignado">
            <Select id="sellerId" name="sellerId" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              <option value="">— Sin vendedor —</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="¿Cuánto entró a la agencia?"
            htmlFor="atsMajor"
            required
            hint={fromOcr.amount ? "Leído de la captura: revísalo" : "Lo que dice la captura (sin puntos)"}
          >
            <Input
              id="atsMajor"
              name="atsMajor"
              type="number"
              inputMode="numeric"
              min={1}
              step="1"
              required
              autoFocus={!bare}
              value={ats}
              className={cn(fromOcr.amount && "border-info bg-info-bg/40")}
              onChange={(e) => {
                setAts(e.target.value);
                setFromOcr((f) => ({ ...f, amount: false }));
              }}
            />
          </Field>
          <Field
            label={`Para el vendedor${seller ? ` (${seller.name})` : ""}`}
            htmlFor="sellerPart"
            hint={
              seller?.retainsCommission
                ? "Lo que se quedó aparte. Se sugiere su 30 % (agencia 70 %); cámbialo si fue otro"
                : "Déjalo en blanco si no se quedó nada"
            }
          >
            <Input
              id="sellerPart"
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={sellerValue}
              onChange={(e) => {
                setTouchedSeller(true);
                setSellerPart(e.target.value);
              }}
            />
          </Field>
          <Field label="Fecha del pago" htmlFor="valueDate" required hint={fromOcr.date ? "Leída de la captura: revísala" : undefined}>
            <Input
              id="valueDate"
              name="valueDate"
              type="date"
              required
              value={valueDate}
              max={today()}
              className={cn(fromOcr.date && "border-info bg-info-bg/40")}
              onChange={(e) => {
                setValueDate(e.target.value);
                setFromOcr((f) => ({ ...f, date: false }));
              }}
            />
          </Field>
          <Field label="Método" htmlFor="method">
            <Select id="method" name="method" defaultValue="transferencia">
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </Select>
          </Field>
        </div>
        <Field label="Referencia (opcional)" htmlFor="reference" hint={fromOcr.reference ? "Leída de la captura: revísala" : undefined}>
          <Input
            id="reference"
            name="reference"
            value={reference}
            className={cn(fromOcr.reference && "border-info bg-info-bg/40")}
            onChange={(e) => {
              setReference(e.target.value);
              setFromOcr((f) => ({ ...f, reference: false }));
            }}
          />
        </Field>

        {/* Avisos suaves sobre la parte del vendedor */}
        {atsN > 0 && seller?.retainsCommission && sellerN === 0 && (
          <Hint>{seller.name} suele quedarse su 30 %. Si esta vez no se quedó nada, deja la casilla del vendedor en 0.</Hint>
        )}
        {atsN > 0 && seller && !seller.retainsCommission && sellerN > 0 && (
          <Hint>{seller.name} normalmente NO se queda comisión. Revisa la casilla «Para el vendedor».</Hint>
        )}
        {notOther && <Hint>Lo del vendedor no es el 30 % (sería {fmt(suggested)}). Está bien si así fue.</Hint>}

        {/* Resumen que se confirma antes de guardar */}
        {atsN > 0 && (
          <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vas a guardar</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm tabular-nums">
              <span>
                Agencia <b className="text-base">{fmt(atsN)}</b>
              </span>
              <span className="text-muted-foreground">+</span>
              <span>
                Vendedor <b className="text-base">{fmt(sellerN)}</b>
              </span>
              <span className="text-muted-foreground">=</span>
              <span>
                Cliente pagó <b className="text-base text-primary">{fmt(total)}</b>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Saldo: le quedaba {fmt(c.balance)} →{" "}
              {balanceAfter > 0.5 ? (
                <>le queda {fmt(balanceAfter)}</>
              ) : balanceAfter >= -0.5 ? (
                <b className="text-success">queda pagado completo</b>
              ) : (
                <b className="text-danger">pagaría {fmt(-balanceAfter)} de más</b>
              )}
              {!file && <span className="text-warning"> · sin captura adjunta</span>}
            </p>
          </div>
        )}

        {/* Avisos fuertes: hay que confirmarlos para poder guardar */}
        {noReceiptMatch && (
          <Alert>
            Ya hay un pago de <b>{fmt(noReceiptMatch.amount)}</b> del {noReceiptMatch.valueDate} <b>sin comprobante</b>. Si la captura es de
            ese pago, NO lo registres otra vez:{" "}
            <button
              type="button"
              disabled={pending || !file}
              onClick={() => attach(noReceiptMatch.id, noReceiptMatch.amount)}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              adjúntalo a ese pago
            </button>
            .
          </Alert>
        )}
        {dupWithReceipt && (
          <Alert>
            Ya hay un pago de <b>{fmt(dupWithReceipt.amount + dupWithReceipt.retained)}</b> del {dupWithReceipt.valueDate} que ya tiene
            comprobante. ¿Seguro que es otro pago distinto?
          </Alert>
        )}
        {overpay && (
          <Alert>
            Con este pago el cliente quedaría pagando <b>{fmt(-balanceAfter)} de más</b> (le quedaba {fmt(c.balance)}). Revisa el monto.
          </Alert>
        )}
        {needsConfirm && atsN > 0 && (
          <label className="flex items-start gap-2 rounded-lg border border-danger/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--danger)]"
              checked={confirmed}
              onChange={(e) => setConfirmedFor(e.target.checked ? confirmKey : null)}
            />
            Revisé el aviso: es un pago nuevo y el monto es correcto.
          </label>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="submit" disabled={pending || !(atsN > 0) || (needsConfirm && !confirmed)}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? "Guardando…" : atsN > 0 ? `Guardar pago de ${fmt(total)}` : "Guardar pago"}
          </Button>
        </div>
      </form>
    </>
  );
  if (bare) return <div className="space-y-4">{body}</div>;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">{body}</CardContent>
    </Card>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-info-bg px-3 py-2 text-xs text-info">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function OcrNotice({ ocr, hasFile }: { ocr: OcrState; hasFile: boolean }) {
  if (!hasFile) return null;
  if (ocr.status === "reading")
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Leyendo la captura… (puedes escribir mientras tanto)
      </p>
    );
  if (ocr.status === "done" && ocr.guess)
    return (
      <p className="flex items-center gap-2 text-xs text-info">
        <ScanText className="size-3.5" /> Datos leídos de la captura: los campos marcados en azul se llenaron solos. Revísalos antes de guardar.
      </p>
    );
  return null;
}

export function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" }) {
  return (
    <div className="rounded-lg bg-surface-muted px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong && "font-semibold", tone === "success" && "text-success")}>{value}</p>
    </div>
  );
}

/**
 * Recuadro para una captura: clic para elegir, arrastrar o pegar con Ctrl+V (en cualquier
 * parte de la página mientras está visible).
 */
export function ReceiptDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const url = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find(
        (x) => x.type.startsWith("image/") || x.type === "application/pdf",
      );
      if (f) {
        e.preventDefault();
        onFile(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex min-h-[220px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-surface transition-colors hover:border-primary/50 hover:bg-brand-50/50 dark:hover:bg-surface-muted",
          over && "border-primary bg-brand-50 dark:bg-surface-muted",
        )}
      >
        {file ? (
          url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Comprobante" className="max-h-[420px] w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
              <FileText className="size-8" />
              {file.name}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <ImagePlus className="size-8 text-primary" />
            <p className="font-medium text-foreground">Adjuntar comprobante</p>
            <p className="text-xs">Clic, arrastra la imagen o pega con Ctrl+V</p>
            <p className="text-xs">Se lee sola: propone el monto y la fecha</p>
          </div>
        )}
      </div>
      {file && (
        <button type="button" onClick={() => onFile(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <X className="size-3" /> Quitar captura
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
