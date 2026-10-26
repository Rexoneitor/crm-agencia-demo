"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { archiveSellerAction, saveSellerAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";

interface Seller {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  retainsCommission: boolean;
  commissionKind: string;
  commissionValue: string;
  commissionValueDisplay: string;
  commissionCurrency: string;
  notes: string | null;
  archivedAt: string | null;
  contracts: number;
}

export function SellersManager({ sellers, editable }: { sellers: Seller[]; editable: boolean }) {
  const [editing, setEditing] = useState<Seller | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = sellers.filter((s) => !s.archivedAt);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo vendedor
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Sin vendedores"
          description="Registra a los vendedores para asignarlos a los contratos."
          action={editable ? <Button onClick={() => setCreating(true)}>Crear vendedor</Button> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Vendedor</TH>
              <TH>Contacto</TH>
              <TH>Comisión</TH>
              <TH>Contratos</TH>
              <TH>Estado</TH>
              {editable && <TH className="text-right">Acciones</TH>}
            </TR>
          </THead>
          <TBody>
            {visible.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="text-muted-foreground">
                  {s.phone ?? "—"}
                  {s.email ? ` · ${s.email}` : ""}
                </TD>
                <TD>
                  {s.commissionKind === "percentage"
                    ? `${s.commissionValueDisplay}%`
                    : `${s.commissionValueDisplay} ${s.commissionCurrency}`}
                </TD>
                <TD className="tabular-nums">{s.contracts}</TD>
                <TD>{s.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}</TD>
                {editable && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        Editar
                      </Button>
                      <ArchiveButton id={s.id} archived={false} />
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {(creating || editing) && (
        <SellerDialog
          key={editing?.id ?? "new"}
          seller={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
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
          setErr(null);
          const res = await archiveSellerAction(id, !archived);
          setPending(false);
          if (!res.ok) setErr(res.error);
        }}
      >
        {archived ? "Restaurar" : "Archivar"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </>
  );
}

function SellerDialog({ seller, onClose }: { seller: Seller | null; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveSellerAction, null);
  const [kind, setKind] = useState(seller?.commissionKind ?? "percentage");
  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <Dialog open onClose={onClose} title={seller ? "Editar vendedor" : "Nuevo vendedor"}>
      <form action={action} className="space-y-3">
        {seller && <input type="hidden" name="id" value={seller.id} />}
        <Field label="Nombre" htmlFor="name" required error={fe.name?.[0]}>
          <Input id="name" name="name" defaultValue={seller?.name} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={seller?.phone ?? ""} />
          </Field>
          <Field label="Email" htmlFor="email" error={fe.email?.[0]}>
            <Input id="email" name="email" type="email" defaultValue={seller?.email ?? ""} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo comisión" htmlFor="commissionKind">
            <Select
              id="commissionKind"
              name="commissionKind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Valor fijo</option>
            </Select>
          </Field>
          <Field
            label={kind === "percentage" ? "Porcentaje" : "Valor"}
            htmlFor="commissionValue"
            error={fe.commissionValue?.[0]}
          >
            <Input
              id="commissionValue"
              name="commissionValue"
              defaultValue={seller?.commissionValueDisplay ?? "0"}
            />
          </Field>
          <Field label="Moneda" htmlFor="commissionCurrency">
            <Select
              id="commissionCurrency"
              name="commissionCurrency"
              defaultValue={seller?.commissionCurrency ?? "COP"}
              disabled={kind === "percentage"}
            >
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={seller?.active ?? true} className="size-4" />
          Activo
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="retainsCommission"
            defaultChecked={seller?.retainsCommission ?? false}
            className="mt-0.5 size-4"
          />
          <span>
            Retiene su comisión de los pagos
            <span className="block text-xs text-muted-foreground">
              Los clientes pagan a su cuenta; a la agencia le llega el pago menos su comisión.
              Al registrar un pago con este vendedor, se ofrecerá cerrar el contrato como
              «pagado» y anotar el resto como comisión retenida.
            </span>
          </span>
        </label>
        <Field label="Notas" htmlFor="notes">
          <Input id="notes" name="notes" defaultValue={seller?.notes ?? ""} />
        </Field>

        {state && !state.ok && !Object.keys(fe).length && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
