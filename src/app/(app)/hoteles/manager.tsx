"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { archiveHotelAction, saveHotelAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";

interface Hotel {
  id: string;
  name: string;
  destinationId: string;
  destination: string;
  color: string;
  city: string | null;
  country: string | null;
  active: boolean;
  notes: string | null;
  archivedAt: string | null;
  contracts: number;
}

export function HotelsManager({
  hotels,
  destinations,
  editable,
}: {
  hotels: Hotel[];
  destinations: { id: string; name: string }[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<Hotel | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = hotels
    .filter((h) => !h.archivedAt)
    .filter((h) => !filter || h.destinationId === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          className="max-w-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Todos los destinos</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        {editable && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo hotel
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Sin hoteles"
          description="Agrega hoteles para poder seleccionarlos al crear contratos."
          action={editable ? <Button onClick={() => setCreating(true)}>Crear hotel</Button> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Hotel</TH>
              <TH>Destino</TH>
              <TH>Ciudad</TH>
              <TH>Contratos</TH>
              <TH>Estado</TH>
              {editable && <TH className="text-right">Acciones</TH>}
            </TR>
          </THead>
          <TBody>
            {visible.map((h) => (
              <TR key={h.id}>
                <TD className="font-medium">{h.name}</TD>
                <TD>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: h.color }}
                    />
                    {h.destination}
                  </span>
                </TD>
                <TD className="text-muted-foreground">{h.city ?? "—"}</TD>
                <TD className="tabular-nums">{h.contracts}</TD>
                <TD>
                  {h.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                </TD>
                {editable && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(h)}>
                        Editar
                      </Button>
                      <ArchiveButton id={h.id} archived={false} />
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {(creating || editing) && (
        <HotelDialog
          key={editing?.id ?? "new"}
          hotel={editing}
          destinations={destinations}
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
          const res = await archiveHotelAction(id, !archived);
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

function HotelDialog({
  hotel,
  destinations,
  onClose,
}: {
  hotel: Hotel | null;
  destinations: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveHotelAction, null);
  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <Dialog open onClose={onClose} title={hotel ? "Editar hotel" : "Nuevo hotel"}>
      <form action={action} className="space-y-3">
        {hotel && <input type="hidden" name="id" value={hotel.id} />}
        <Field label="Nombre" htmlFor="name" required error={fe.name?.[0]}>
          <Input id="name" name="name" defaultValue={hotel?.name} required />
        </Field>
        <Field label="Destino" htmlFor="destinationId" required error={fe.destinationId?.[0]}>
          <Select id="destinationId" name="destinationId" defaultValue={hotel?.destinationId ?? ""}>
            <option value="" disabled>
              Selecciona…
            </option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ciudad" htmlFor="city">
            <Input id="city" name="city" defaultValue={hotel?.city ?? ""} />
          </Field>
          <Field label="País" htmlFor="country">
            <Input id="country" name="country" defaultValue={hotel?.country ?? ""} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={hotel?.active ?? true} className="size-4" />
          Activo
        </label>
        <Field label="Notas" htmlFor="notes">
          <Input id="notes" name="notes" defaultValue={hotel?.notes ?? ""} />
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
