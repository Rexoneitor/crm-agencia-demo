"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  addInventoryPaymentAction,
  assignInventoryAction,
  createInventoryAction,
  reverseAssignmentAction,
  updateInventoryAction,
} from "./actions";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

interface Opt {
  id: string;
  name: string;
}

function useClose(state: { ok: boolean } | null, close: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      close();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function Err({ state }: { state: { ok: boolean; error?: string } | null }) {
  if (!state || state.ok || !state.error) return null;
  return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>;
}

export function NewInventoryButton({
  sellers,
  destinations,
  hotels,
}: {
  sellers: Opt[];
  destinations: Opt[];
  hotels: { id: string; name: string; destinationId: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createInventoryAction, null);
  const [destinationId, setDestinationId] = useState("");
  useClose(state, () => setOpen(false));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Nuevo cupo
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Nuevo cupo">
          <form action={action} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendedor" htmlFor="sellerId" required>
                <Select id="sellerId" name="sellerId" defaultValue="">
                  <option value="" disabled>Selecciona…</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha de compra" htmlFor="purchaseDate" required>
                <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Destino" htmlFor="destinationId" required>
                <Select id="destinationId" name="destinationId" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                  <option value="" disabled>Selecciona…</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Hotel" htmlFor="hotelId">
                <Select id="hotelId" name="hotelId" defaultValue="">
                  <option value="">Sin especificar</option>
                  {hotels.filter((h) => !destinationId || h.destinationId === destinationId).map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha de viaje" htmlFor="travelDate">
                <Input id="travelDate" name="travelDate" type="date" />
              </Field>
              <Field label="Plazas / packs" htmlFor="seats" required>
                <Input id="seats" name="seats" type="number" min={1} defaultValue={2} required />
              </Field>
              <Field label="Valor total" htmlFor="amountMajor" required>
                <Input id="amountMajor" name="amountMajor" type="number" min={0} step="0.01" required />
              </Field>
              <Field label="Moneda" htmlFor="currency" required>
                <Select id="currency" name="currency" defaultValue="COP">
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>
            <Field label="Referencia" htmlFor="reference">
              <Input id="reference" name="reference" placeholder="CUPO-…" />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Crear cupo"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export interface InventoryEditable {
  id: string;
  sellerId: string;
  purchaseDate: string;
  destinationId: string;
  hotelId: string | null;
  travelDate: string | null;
  seats: number;
  amountMajor: number;
  currency: string;
  reference: string | null;
  notes: string | null;
}

export function EditInventoryButton({
  inventory,
  sellers,
  destinations,
  hotels,
}: {
  inventory: InventoryEditable;
  sellers: Opt[];
  destinations: Opt[];
  hotels: { id: string; name: string; destinationId: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateInventoryAction, null);
  const [destinationId, setDestinationId] = useState(inventory.destinationId);
  useClose(state, () => setOpen(false));

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Editar
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Editar cupo">
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={inventory.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendedor" htmlFor="sellerId" required>
                <Select id="sellerId" name="sellerId" defaultValue={inventory.sellerId}>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha de compra" htmlFor="purchaseDate" required>
                <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={inventory.purchaseDate} required />
              </Field>
              <Field label="Destino" htmlFor="destinationId" required>
                <Select id="destinationId" name="destinationId" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Hotel" htmlFor="hotelId">
                <Select id="hotelId" name="hotelId" defaultValue={inventory.hotelId ?? ""}>
                  <option value="">Sin especificar</option>
                  {hotels.filter((h) => !destinationId || h.destinationId === destinationId).map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha de viaje" htmlFor="travelDate">
                <Input id="travelDate" name="travelDate" type="date" defaultValue={inventory.travelDate ?? ""} />
              </Field>
              <Field label="Plazas / packs" htmlFor="seats" required>
                <Input id="seats" name="seats" type="number" min={1} defaultValue={inventory.seats} required />
              </Field>
              <Field label="Valor total" htmlFor="amountMajor" required>
                <Input id="amountMajor" name="amountMajor" type="number" min={0} step="0.01" defaultValue={inventory.amountMajor} required />
              </Field>
              <Field label="Moneda" htmlFor="currency" required>
                <Select id="currency" name="currency" defaultValue={inventory.currency}>
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>
            <Field label="Referencia" htmlFor="reference">
              <Input id="reference" name="reference" defaultValue={inventory.reference ?? ""} />
            </Field>
            <Field label="Notas" htmlFor="notes">
              <Input id="notes" name="notes" defaultValue={inventory.notes ?? ""} />
            </Field>
            <p className="text-xs text-muted-foreground">
              No puedes dejar el cupo con menos plazas de las ya asignadas a contratos.
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function AddInventoryPaymentButton({ inventoryId, currency }: { inventoryId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addInventoryPaymentAction, null);
  useClose(state, () => setOpen(false));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Registrar pago del cupo</Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Pago del vendedor por el cupo">
          <form action={action} className="space-y-3">
            <input type="hidden" name="pendingInventoryId" value={inventoryId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha" htmlFor="valueDate" required>
                <Input id="valueDate" name="valueDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Método" htmlFor="method">
                <Select id="method" name="method" defaultValue="transferencia">
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
              <Field label="Monto" htmlFor="amountMajor" required>
                <Input id="amountMajor" name="amountMajor" type="number" min={0} step="0.01" required />
              </Field>
              <Field label="Moneda" htmlFor="currency" required>
                <Select id="currency" name="currency" defaultValue={currency}>
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>
            <Field label="Referencia" htmlFor="reference">
              <Input id="reference" name="reference" />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function AssignInventoryButton({
  inventoryId,
  inventoryCurrency,
  seatsLeft,
  contracts,
}: {
  inventoryId: string;
  inventoryCurrency: string;
  seatsLeft: number;
  contracts: { id: string; number: string; client: string; currency: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(assignInventoryAction, null);
  const [contractId, setContractId] = useState("");
  useClose(state, () => setOpen(false));
  const today = new Date().toISOString().slice(0, 10);
  const contract = contracts.find((c) => c.id === contractId);
  const cross = contract && contract.currency !== inventoryCurrency;

  return (
    <>
      <Button size="sm" disabled={seatsLeft <= 0} onClick={() => setOpen(true)}>
        Asignar a contrato
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Asignar cupo a un contrato"
          description={`Genera el asiento «aplicación de anticipo» en el contrato y descuenta plazas del cupo. Quedan ${seatsLeft} plaza(s).`}
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="pendingInventoryId" value={inventoryId} />
            <Field label="Contrato" htmlFor="contractId" required>
              <Select id="contractId" name="contractId" value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="" disabled>Selecciona…</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} — {c.client} ({c.currency})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plazas a asignar" htmlFor="seats" required>
                <Input id="seats" name="seats" type="number" min={1} max={seatsLeft} defaultValue={Math.min(2, seatsLeft)} required />
              </Field>
              <Field label={`Importe a aplicar (${contract?.currency ?? "moneda del contrato"})`} htmlFor="appliedMajor" required>
                <Input id="appliedMajor" name="appliedMajor" type="number" min={0} step="0.01" required />
              </Field>
              {cross && (
                <Field label={`Tasa (${contract!.currency}→${inventoryCurrency})`} htmlFor="exchangeRate" required>
                  <Input id="exchangeRate" name="exchangeRate" placeholder="0.00025" />
                </Field>
              )}
              <Field label="Fecha de valor" htmlFor="valueDate" required>
                <Input id="valueDate" name="valueDate" type="date" defaultValue={today} required />
              </Field>
            </div>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Asignando…" : "Asignar"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function ReverseAssignmentButton({ inventoryId, assignmentId }: { inventoryId: string; assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reverseAssignmentAction, null);
  useClose(state, () => setOpen(false));
  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => setOpen(true)}>
        revertir
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Revertir asignación">
          <form action={action} className="space-y-3">
            <input type="hidden" name="pendingInventoryId" value={inventoryId} />
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <p className="text-sm text-muted-foreground">
              Devuelve las plazas al cupo y anula el asiento de anticipo en el contrato.
            </p>
            <Field label="Motivo" htmlFor="reason" required>
              <Input id="reason" name="reason" required />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="danger" disabled={pending}>{pending ? "…" : "Revertir"}</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
