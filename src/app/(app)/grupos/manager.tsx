"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { archiveGroupAction, createGroupAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";

interface Group {
  id: string;
  name: string;
  notes: string | null;
  archivedAt: string | null;
  contracts: number;
}

export function GroupsManager({ groups, editable }: { groups: Group[]; editable: boolean }) {
  const [creating, setCreating] = useState(false);
  const active = groups.filter((g) => !g.archivedAt);
  const archived = groups.filter((g) => g.archivedAt);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo grupo
          </Button>
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          title="Aún no hay grupos"
          description="Crea un grupo cuando varias personas viajen juntas, cada una con su propio contrato."
          action={editable ? <Button onClick={() => setCreating(true)}>Crear grupo</Button> : undefined}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Grupo</TH>
              <TH>Contratos</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {active.map((g) => (
              <TR key={g.id}>
                <TD>
                  <Link href={`/grupos/${g.id}`} className="font-medium hover:underline">
                    {g.name}
                  </Link>
                  {g.notes && <span className="block text-xs text-muted-foreground">{g.notes}</span>}
                </TD>
                <TD className="tabular-nums">{g.contracts}</TD>
                <TD className="text-right">
                  {editable && <ArchiveButton id={g.id} archived={false} />}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Archivados ({archived.length})</summary>
          <ul className="mt-2 space-y-1">
            {archived.map((g) => (
              <li key={g.id} className="flex items-center justify-between">
                <Link href={`/grupos/${g.id}`} className="hover:underline">
                  {g.name}
                </Link>
                {editable && <ArchiveButton id={g.id} archived />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {creating && <GroupDialog onClose={() => setCreating(false)} />}
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
          const res = await archiveGroupAction(id, !archived);
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

function GroupDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(createGroupAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <Dialog open onClose={onClose} title="Nuevo grupo de viaje">
      <form action={action} className="space-y-3">
        <Field label="Nombre" htmlFor="name" required error={fe.name?.[0]}>
          <Input id="name" name="name" placeholder="p. ej. Familia Pérez — San Andrés" required />
        </Field>
        <Field label="Notas" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} />
        </Field>
        {state && !state.ok && !Object.keys(fe).length && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function GroupBadge({ name }: { name: string }) {
  return (
    <Badge tone="neutral" className="whitespace-nowrap">
      {name}
    </Badge>
  );
}
