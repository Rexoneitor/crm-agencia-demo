"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  addRefundAttachmentAction,
  archiveRefundAction,
  registerRefundPaymentAction,
  setRefundStateAction,
  voidRefundPaymentAction,
} from "../actions";
import { RefundForm, type RefundFormValues } from "../components";
import { Button } from "@/shared/ui/button";
import { type ComboOption } from "@/shared/ui/combobox";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { PAYMENT_METHOD, REFUND_STATE, label } from "@/core/domain/enums";

type State = { ok: boolean; error?: string; fieldErrors?: Record<string, string[]> } | null;

function Err({ state }: { state: State }) {
  if (!state || state.ok || !state.error) return null;
  return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>;
}

function useRefreshOnOk(state: State, onDone?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function EditRefundButton({
  initial,
  contracts,
  groups,
}: {
  initial: RefundFormValues;
  contracts: ComboOption[];
  groups: ComboOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Editar
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Editar reembolso" className="max-w-2xl">
          <RefundForm
            initial={initial}
            contracts={contracts}
            groups={groups}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </Dialog>
      )}
    </>
  );
}

export function RefundPaymentButton({
  refundId,
  contractId,
  currency,
}: {
  refundId: string;
  contractId: string | null;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(registerRefundPaymentAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  const fe = (state && !state.ok && state.fieldErrors) || {};
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Registrar pago al cliente</Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Pago del reembolso al cliente"
          description={
            contractId
              ? "Se anotará también como asiento de reembolso en el contrato."
              : "Este reembolso no tiene contrato: el pago queda solo aquí."
          }
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="refundId" value={refundId} />
            <input type="hidden" name="contractId" value={contractId ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha del pago" htmlFor="paidDate" required error={fe.paidDate?.[0]}>
                <Input id="paidDate" name="paidDate" type="date" defaultValue={today} required />
              </Field>
              <Field label={`Monto (${currency})`} htmlFor="amountMajor" required error={fe.amountMajor?.[0]}>
                <Input id="amountMajor" name="amountMajor" type="number" min={0} step="0.01" required />
              </Field>
              <Field label="Método" htmlFor="method">
                <Select id="method" name="method" defaultValue="transferencia">
                  {PAYMENT_METHOD.map((m) => (
                    <option key={m} value={m}>{label(m)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Referencia" htmlFor="reference">
                <Input id="reference" name="reference" />
              </Field>
            </div>
            <Field label="Notas" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} />
            </Field>
            <Field label="Comprobante (opcional)" htmlFor="receipt">
              <Input id="receipt" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar pago"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function StateChanger({ refundId, current }: { refundId: string; current: string }) {
  const [state, action, pending] = useActionState(setRefundStateAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="refundId" value={refundId} />
      <Field label="Cambiar estado" htmlFor="state">
        <Select id="state" name="state" defaultValue={current}>
          {REFUND_STATE.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </Select>
      </Field>
      <Input name="note" placeholder="Nota (p. ej. enviado a operaciones)" />
      <Err state={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Actualizar estado"}
      </Button>
    </form>
  );
}

export function VoidRefundPaymentButton({
  paymentId,
  refundId,
  contractId,
}: {
  paymentId: string;
  refundId: string;
  contractId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(voidRefundPaymentAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Anular
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Anular pago al cliente">
          <form action={action} className="space-y-3">
            <input type="hidden" name="paymentId" value={paymentId} />
            <input type="hidden" name="refundId" value={refundId} />
            <input type="hidden" name="contractId" value={contractId ?? ""} />
            <Field label="Motivo" htmlFor="reason" required>
              <Input id="reason" name="reason" required minLength={5} />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" disabled={pending}>
                Anular
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function AttachmentUpload({ refundId }: { refundId: string }) {
  const [state, action, pending] = useActionState(addRefundAttachmentAction, null);
  useRefreshOnOk(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input type="hidden" name="refundId" value={refundId} />
      <Input name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="w-auto" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Adjuntar
      </Button>
      <Err state={state} />
    </form>
  );
}

export function ArchiveRefundButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const res = await archiveRefundAction(id, !archived);
          setPending(false);
          if (res.ok) router.refresh();
          else setErr(res.error);
        }}
      >
        {archived ? "Restaurar reembolso" : "Archivar (registrado por error)"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </>
  );
}
