"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { archiveDestinationAction, saveDestinationAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { label } from "@/core/domain/enums";

interface Dest {
  id: string;
  name: string;
  country: string;
  scope: string;
  color: string;
  active: boolean;
  notes: string | null;
  archivedAt: string | null;
  hotels: number;
  contracts: number;
}

export function DestinationsManager({
  destinations,
  editable,
}: {
  destinations: Dest[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<Dest | null>(null);
  const [creating, setCreating] = useState(false);
  const active = destinations.filter((d) => !d.archivedAt);
  const archived = destinations.filter((d) => d.archivedAt);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo destino
          </Button>
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          title="Aún no hay destinos"
          description="Crea los destinos que vende la agencia para poder asociarlos a contratos y reservas."
          action={editable ? <Button onClick={() => setCreating(true)}>Crear destino</Button> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Destino</TH>
              <TH>Ámbito</TH>
              <TH>Hoteles</TH>
              <TH>Contratos</TH>
              <TH>Estado</TH>
              {editable && <TH className="text-right">Acciones</TH>}
            </TR>
          </THead>
          <TBody>
            {active.map((d) => (
              <TR key={d.id}>
                <TD>
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className="inline-block size-3 rounded-full border border-black/10"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{d.country}</span>
                </TD>
                <TD>{label(d.scope)}</TD>
                <TD className="tabular-nums">{d.hotels}</TD>
                <TD className="tabular-nums">{d.contracts}</TD>
                <TD>
                  {d.active ? (
                    <Badge tone="success">Activo</Badge>
                  ) : (
                    <Badge tone="neutral">Inactivo</Badge>
                  )}
                </TD>
                {editable && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                        Editar
                      </Button>
                      <ArchiveButton id={d.id} archived={false} />
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Archivados ({archived.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {archived.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span>{d.name}</span>
                {editable && <ArchiveButton id={d.id} archived />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(creating || editing) && (
        <DestinationDialog
          key={editing?.id ?? "new"}
          dest={editing}
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
          const res = await archiveDestinationAction(id, !archived);
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

function DestinationDialog({ dest, onClose }: { dest: Dest | null; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveDestinationAction, null);
  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <Dialog open onClose={onClose} title={dest ? "Editar destino" : "Nuevo destino"}>
      <form action={action} className="space-y-3">
        {dest && <input type="hidden" name="id" value={dest.id} />}
        <Field label="Nombre" htmlFor="name" required error={fe.name?.[0]}>
          <Input id="name" name="name" defaultValue={dest?.name} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="País" htmlFor="country">
            <Input id="country" name="country" defaultValue={dest?.country ?? "Colombia"} />
          </Field>
          <Field label="Ámbito" htmlFor="scope" required>
            <Select id="scope" name="scope" defaultValue={dest?.scope ?? "nacional"}>
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Color" htmlFor="color" error={fe.color?.[0]}>
            <input
              id="color"
              name="color"
              type="color"
              defaultValue={dest?.color ?? "#2563eb"}
              className="h-9 w-full rounded-md border border-input bg-surface"
            />
          </Field>
          <Field label="Activo" htmlFor="active">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={dest?.active ?? true}
                className="size-4"
              />
              Visible en listas
            </label>
          </Field>
        </div>
        <Field label="Notas" htmlFor="notes">
          <Input id="notes" name="notes" defaultValue={dest?.notes ?? ""} />
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
