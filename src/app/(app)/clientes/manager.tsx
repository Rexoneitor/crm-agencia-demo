"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { saveClientAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

export interface ClientForm {
  id: string;
  fullName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
}

export function NewClientButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Nuevo cliente
      </Button>
      {open && <ClientDialog client={null} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditClientButton({ client }: { client: ClientForm }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Editar datos
      </Button>
      {open && <ClientDialog client={client} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientDialog({ client, onClose }: { client: ClientForm | null; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveClientAction, null);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fe = (state && !state.ok && state.fieldErrors) || {};

  return (
    <Dialog open onClose={onClose} title={client ? "Editar cliente" : "Nuevo cliente"}>
      <form action={action} className="space-y-3">
        {client && <input type="hidden" name="id" value={client.id} />}
        <Field label="Nombre completo" htmlFor="fullName" required error={fe.fullName?.[0]}>
          <Input id="fullName" name="fullName" defaultValue={client?.fullName} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Documento" htmlFor="documentId">
            <Input id="documentId" name="documentId" defaultValue={client?.documentId ?? ""} />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" htmlFor="email" error={fe.email?.[0]}>
            <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
          </Field>
          <Field label="Ciudad" htmlFor="city">
            <Input id="city" name="city" defaultValue={client?.city ?? ""} />
          </Field>
        </div>
        <Field label="Dirección" htmlFor="address">
          <Input id="address" name="address" defaultValue={client?.address ?? ""} />
        </Field>
        <Field label="Observaciones" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} rows={3} />
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
