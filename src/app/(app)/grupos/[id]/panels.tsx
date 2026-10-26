"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  addContractToGroupAction,
  registerGroupPaymentAction,
  removeContractFromGroupAction,
} from "../actions";
import { Button } from "@/shared/ui/button";
import { ComboBox } from "@/shared/ui/combobox";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

function Err({ state }: { state: { ok: boolean; error?: string } | null }) {
  if (!state || state.ok || !state.error) return null;
  return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>;
}

function useRefreshOnOk(state: { ok: boolean } | null, onDone?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

// ── Registrar pago del grupo ────────────────────────────────────────────

interface MemberContract {
  id: string;
  number: string;
  client: string;
  currency: string;
  balanceAmount: bigint;
}

export function RegisterGroupPaymentButton({
  groupId,
  contracts,
  currencies,
}: {
  groupId: string;
  contracts: MemberContract[];
  currencies: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(registerGroupPaymentAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  const [currency, setCurrency] = useState(currencies[0] ?? "COP");
  const eligible = useMemo(() => contracts.filter((c) => c.currency === currency), [contracts, currency]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [total, setTotal] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const selectedIds = eligible.filter((c) => checked[c.id]).map((c) => c.id);
  const assigned = selectedIds.reduce((s, id) => s + Number(amounts[id] || 0), 0);
  const totalNum = Number(total || 0);
  const remaining = Math.round((totalNum - assigned) * 100) / 100;

  function splitEvenly() {
    const ids = selectedIds;
    if (!ids.length || !totalNum) return;
    const per = Math.floor((totalNum / ids.length) * 100) / 100;
    const next: Record<string, string> = { ...amounts };
    let left = totalNum;
    ids.forEach((id, i) => {
      const amt = i === ids.length - 1 ? Math.round(left * 100) / 100 : per;
      next[id] = String(amt);
      left -= amt;
    });
    setAmounts(next);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Registrar pago del grupo</Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Registrar pago del grupo"
          description="Un solo pago, repartido entre los contratos que marques. Cada uno recibe su propio asiento; el comprobante queda enlazado a todos."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="groupId" value={groupId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de valor" htmlFor="valueDate" required>
                <Input id="valueDate" name="valueDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Moneda" htmlFor="receivedCurrency" required>
                <Select
                  id="receivedCurrency"
                  name="receivedCurrency"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setChecked({});
                    setAmounts({});
                  }}
                >
                  {(currencies.length ? currencies : ["COP", "USD"]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Método" htmlFor="method">
                <Select id="method" name="method" defaultValue="transferencia">
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
              <Field label="Referencia" htmlFor="reference">
                <Input id="reference" name="reference" placeholder="N.º de transferencia" />
              </Field>
            </div>

            <Field label={`Monto total recibido (${currency})`} htmlFor="totalHelper">
              <Input
                id="totalHelper"
                type="number"
                min={0}
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0"
              />
            </Field>

            <div className="rounded-md border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {eligible.length === 0 ? (
                    <tr>
                      <td className="p-3 text-muted-foreground">
                        Ningún contrato del grupo está en {currency}.
                      </td>
                    </tr>
                  ) : (
                    eligible.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0">
                        <td className="w-8 p-2">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={!!checked[c.id]}
                            onChange={(e) => setChecked((s) => ({ ...s, [c.id]: e.target.checked }))}
                          />
                        </td>
                        <td className="p-2">
                          <span className="font-medium">{c.number}</span>
                          <span className="block text-xs text-muted-foreground">{c.client}</span>
                        </td>
                        <td className="w-36 p-2">
                          <input type="hidden" name="contractId" value={checked[c.id] ? c.id : ""} disabled={!checked[c.id]} />
                          <Input
                            type="number"
                            name="receivedMajor"
                            min={0}
                            step="0.01"
                            disabled={!checked[c.id]}
                            value={amounts[c.id] ?? ""}
                            onChange={(e) => setAmounts((s) => ({ ...s, [c.id]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <Button type="button" variant="secondary" size="sm" onClick={splitEvenly}>
                Repartir parejo
              </Button>
              <span className={remaining === 0 ? "text-success" : "text-muted-foreground"}>
                Por asignar: {remaining.toLocaleString("es-CO")} {currency}
              </span>
            </div>

            <Field label="Comprobante (JPG, PNG o PDF)" htmlFor="receipt">
              <input
                id="receipt"
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png"
                className="text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5"
              />
            </Field>
            <Field label="Observaciones" htmlFor="notes">
              <Input id="notes" name="notes" />
            </Field>

            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || selectedIds.length === 0 || remaining !== 0}>
                {pending ? "Registrando…" : "Registrar pago"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Añadir / quitar contrato del grupo ───────────────────────────────────

export function AddContractToGroupForm({
  groupId,
  candidates,
}: {
  groupId: string;
  candidates: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [contractId, setContractId] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Añadir un contrato existente a este grupo</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-72">
          <ComboBox
            name="candidate"
            allowCreate={false}
            placeholder="Busca por número o cliente…"
            options={candidates}
            onChange={({ id }) => setContractId(id)}
          />
        </div>
        <Button
          disabled={!contractId || pending}
          onClick={async () => {
            setPending(true);
            setErr(null);
            const res = await addContractToGroupAction(groupId, contractId);
            setPending(false);
            if (res.ok) {
              setContractId("");
              router.refresh();
            } else setErr(res.error);
          }}
        >
          {pending ? "Añadiendo…" : "Añadir"}
        </Button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="text-xs text-muted-foreground">
        También puedes hacerlo desde el propio contrato: Editar contrato → Grupo de viaje.
      </p>
    </div>
  );
}

export function RemoveContractButton({ groupId, contractId }: { groupId: string; contractId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await removeContractFromGroupAction(groupId, contractId);
        setPending(false);
        if (res.ok) router.refresh();
      }}
    >
      Quitar del grupo
    </Button>
  );
}
