"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createRefundAction, updateRefundAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { ComboBox, type ComboOption } from "@/shared/ui/combobox";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { REFUND_CHANNEL, REFUND_REASON, label } from "@/core/domain/enums";

export interface DestinationOption extends ComboOption {
  scope?: string;
}

const TONE: Record<string, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  solicitado: "warning",
  en_tramite: "primary",
  aprobado: "primary",
  pagado: "success",
  rechazado: "neutral",
  desistido: "neutral",
};

export function RefundStateBadge({ state, overdue }: { state: string; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={TONE[state] ?? "neutral"}>{label(state)}</Badge>
      {overdue && <Badge tone="danger">Plazo vencido</Badge>}
    </span>
  );
}

export function RefundFilters({ current }: { current: Record<string, string> }) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const set = (key: string, value: string) => {
    const sp = new URLSearchParams(current);
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/reembolsos?${sp.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select className="w-auto" value={current.ver ?? "abiertos"} onChange={(e) => set("ver", e.target.value)}>
        <option value="abiertos">Pendientes</option>
        <option value="todos">Todos</option>
        <option value="solicitado">Solicitados</option>
        <option value="en_tramite">En trámite</option>
        <option value="aprobado">Aprobados</option>
        <option value="pagado">Pagados</option>
        <option value="rechazado">Rechazados</option>
        <option value="desistido">Desistidos</option>
        <option value="archivados">Archivados</option>
      </Select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q);
        }}
      >
        <Input placeholder="Buscar cliente, número o motivo…" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
      </form>
    </div>
  );
}

export interface RefundFormValues {
  id?: string;
  contractId?: string | null;
  groupId?: string | null;
  clientName?: string;
  clientDoc?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  people?: number | null;
  requestedAt?: string;
  channel?: string;
  reasonCode?: string;
  reason?: string;
  dueDate?: string | null;
  currency?: string;
  requestedMajor?: string;
  agreedMajor?: string;
  emailThread?: string | null;
  notes?: string | null;
}

export function RefundForm({
  initial,
  contracts,
  groups,
  destinations = [],
  sellers = [],
  onDone,
}: {
  initial?: RefundFormValues;
  contracts: ComboOption[];
  groups: ComboOption[];
  destinations?: DestinationOption[];
  sellers?: ComboOption[];
  onDone: (id?: string) => void;
}) {
  const editing = !!initial?.id;
  // Contrato que todavía no está cargado: se crea desde aquí (solo al crear).
  const [isNew, setIsNew] = useState(false);
  const [modality, setModality] = useState("fecha_abierta");
  const [cancel, setCancel] = useState(false);
  const [state, action, pending] = useActionState(editing ? updateRefundAction : createRefundAction, null);
  useEffect(() => {
    if (state?.ok) onDone((state.data as { id?: string } | undefined)?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fe = (state && !state.ok && state.fieldErrors) || {};
  const today = new Date().toISOString().slice(0, 10);
  const v = initial ?? {};

  return (
    <form action={action} className="space-y-3">
      {editing && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {!isNew && (
          <Field label="Contrato (si existe)" htmlFor="contract" hint="Al pagar, se asienta en su libro">
            <ComboBox name="contract" options={contracts} defaultId={v.contractId ?? ""} allowCreate={false} placeholder="CTR-… o nombre" />
          </Field>
        )}
        <Field label="Grupo de viaje (opcional)" htmlFor="group">
          <ComboBox name="group" options={groups} defaultId={v.groupId ?? ""} allowCreate={false} placeholder="Si lo pide un grupo" />
        </Field>
        <Field label="Quién pide la devolución" htmlFor="clientName" required error={fe.clientName?.[0]}>
          <Input id="clientName" name="clientName" defaultValue={v.clientName ?? ""} required />
        </Field>
        <Field label="Documento" htmlFor="clientDoc">
          <Input id="clientDoc" name="clientDoc" defaultValue={v.clientDoc ?? ""} />
        </Field>
        <Field label="Correo" htmlFor="contactEmail">
          <Input id="contactEmail" name="contactEmail" type="email" defaultValue={v.contactEmail ?? ""} />
        </Field>
        <Field label="Teléfono" htmlFor="contactPhone">
          <Input id="contactPhone" name="contactPhone" defaultValue={v.contactPhone ?? ""} />
        </Field>
        <Field label="Fecha de la solicitud" htmlFor="requestedAt" required error={fe.requestedAt?.[0]}>
          <Input id="requestedAt" name="requestedAt" type="date" defaultValue={v.requestedAt ?? today} required />
        </Field>
        <Field label="Personas que cubre" htmlFor="people">
          <Input id="people" name="people" type="number" min={1} defaultValue={v.people ?? ""} />
        </Field>
        <Field label="Canal" htmlFor="channel" required>
          <Select id="channel" name="channel" defaultValue={v.channel ?? "correo"}>
            {REFUND_CHANNEL.map((c) => (
              <option key={c} value={c}>{label(c)}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Plazo para responder/pagar"
          htmlFor="dueDate"
          hint={editing ? undefined : "Vacío + derecho de petición = 15 días hábiles automáticos"}
          error={fe.dueDate?.[0]}
        >
          <Input id="dueDate" name="dueDate" type="date" defaultValue={v.dueDate ?? ""} />
        </Field>
        <Field label="Motivo" htmlFor="reasonCode" required>
          <Select id="reasonCode" name="reasonCode" defaultValue={v.reasonCode ?? "cancelacion_agencia"}>
            {REFUND_REASON.map((c) => (
              <option key={c} value={c}>{label(c)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda" htmlFor="currency" hint="Si eliges contrato, se usa la suya">
          <Select id="currency" name="currency" defaultValue={v.currency ?? "COP"}>
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        <Field label="Monto que pide el cliente" htmlFor="requestedMajor" error={fe.requestedMajor?.[0]}>
          <Input id="requestedMajor" name="requestedMajor" type="number" min={0} step="0.01" defaultValue={v.requestedMajor ?? ""} />
        </Field>
        <Field label="Monto acordado a devolver" htmlFor="agreedMajor" error={fe.agreedMajor?.[0]}>
          <Input id="agreedMajor" name="agreedMajor" type="number" min={0} step="0.01" defaultValue={v.agreedMajor ?? ""} />
        </Field>
      </div>
      {!editing && (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="newContract"
              checked={isNew}
              onChange={(e) => {
                setIsNew(e.target.checked);
                if (e.target.checked) setCancel(true);
              }}
              className="mt-1"
            />
            <span>
              <strong>Este contrato todavía no está cargado</strong> — crearlo ahora con los datos básicos
              <span className="block text-xs text-muted-foreground">
                Queda registrado en Contratos (con su abono) y ligado a este reembolso. El nombre de quien pide la devolución será el titular.
              </span>
            </span>
          </label>
          {isNew && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Destino" htmlFor="ncDestination" required error={fe.ncDestination?.[0]}>
                <ComboBox name="ncDestination" options={destinations} placeholder="Escribe o elige el destino…" />
              </Field>
              <Field label="Tipo de viaje" htmlFor="ncTripType">
                <Select id="ncTripType" name="ncTripType" defaultValue="nacional">
                  <option value="nacional">Nacional</option>
                  <option value="internacional">Internacional</option>
                </Select>
              </Field>
              <Field label="Modalidad" htmlFor="ncModality">
                <Select id="ncModality" name="ncModality" value={modality} onChange={(e) => setModality(e.target.value)}>
                  <option value="fecha_abierta">Fecha abierta (con vigencia)</option>
                  <option value="fecha_cerrada">Fecha cerrada (viaje fijo)</option>
                </Select>
              </Field>
              <Field label="Vendedor (opcional)" htmlFor="ncSeller">
                <ComboBox name="ncSeller" options={sellers} placeholder="Si lo sabes…" />
              </Field>
              {modality === "fecha_abierta" ? (
                <>
                  <Field label="Vigencia desde" htmlFor="ncVigenciaStart" required error={fe.ncVigenciaEnd?.[0]}>
                    <Input id="ncVigenciaStart" name="ncVigenciaStart" type="date" />
                  </Field>
                  <Field label="Vigencia hasta" htmlFor="ncVigenciaEnd" required>
                    <Input id="ncVigenciaEnd" name="ncVigenciaEnd" type="date" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Fecha de viaje" htmlFor="ncTravelDate" required error={fe.ncTravelDate?.[0]}>
                    <Input id="ncTravelDate" name="ncTravelDate" type="date" />
                  </Field>
                  <Field label="Fecha de regreso" htmlFor="ncReturnDate">
                    <Input id="ncReturnDate" name="ncReturnDate" type="date" />
                  </Field>
                </>
              )}
              <Field label="Precio del contrato" htmlFor="ncPriceMajor" required error={fe.ncPriceMajor?.[0]} hint="Si no lo sabes, pon lo abonado">
                <Input id="ncPriceMajor" name="ncPriceMajor" type="number" min={0} step="0.01" />
              </Field>
              <Field label="Lo que ya abonó" htmlFor="ncPaidMajor" hint="Se registra como pago del contrato">
                <Input id="ncPaidMajor" name="ncPaidMajor" type="number" min={0} step="0.01" />
              </Field>
              <Field label="Fecha de venta / del abono" htmlFor="ncSaleDate">
                <Input id="ncSaleDate" name="ncSaleDate" type="date" />
              </Field>
              <Field label="Adultos / niños" htmlFor="ncAdults">
                <div className="flex gap-2">
                  <Input id="ncAdults" name="ncAdults" type="number" min={0} placeholder="Adultos" />
                  <Input name="ncChildren" type="number" min={0} placeholder="Niños" />
                </div>
              </Field>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="cancelContract" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
            Marcar el contrato como cancelado (el cliente se retira y pide su dinero)
          </label>
        </div>
      )}
      <Field label="Detalle del motivo" htmlFor="reason" required error={fe.reason?.[0]}>
        <Textarea id="reason" name="reason" rows={2} defaultValue={v.reason ?? ""} required />
      </Field>
      <Field label="Enlace al correo (opcional)" htmlFor="emailThread">
        <Input id="emailThread" name="emailThread" defaultValue={v.emailThread ?? ""} placeholder="https://mail.google.com/…" />
      </Field>
      <Field label="Notas" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={v.notes ?? ""} />
      </Field>
      {!editing && (
        <Field label="Adjuntar la solicitud (PDF/foto, opcional)" htmlFor="attachment">
          <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png" />
        </Field>
      )}
      {state && !state.ok && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar reembolso"}
        </Button>
      </div>
    </form>
  );
}

export function NewRefundButton({
  contracts,
  groups,
  destinations,
  sellers,
}: {
  contracts: ComboOption[];
  groups: ComboOption[];
  destinations: DestinationOption[];
  sellers: ComboOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Nuevo reembolso
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Nueva solicitud de reembolso" className="max-w-2xl">
          <RefundForm
            contracts={contracts}
            groups={groups}
            destinations={destinations}
            sellers={sellers}
            onDone={(id) => {
              setOpen(false);
              if (id) router.push(`/reembolsos/${id}`);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
