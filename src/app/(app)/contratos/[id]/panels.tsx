"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Upload } from "lucide-react";
import {
  addAdjustmentAction,
  addNoteAction,
  archiveContractAction,
  archiveDocAction,
  archiveNoteAction,
  cancelContractAction,
  markTraveledAction,
  deleteContractAction,
  deleteEntryAction,
  updateEntryAction,
  attachReceiptAction,
  confirmReservationAction,
  markLiquidatedAction,
  registerPaymentAction,
  rescheduleReservationAction,
  resolveExceptionAction,
  scheduleTripAction,
  setInstallmentPlanAction,
  settleCommissionAction,
  transferContractAction,
  uploadDocAction,
  duplicateContractAction,
  updateContractAction,
  updateNoteAction,
  voidEntryAction,
} from "../actions";
import type { ContractDetailVM } from "@/modules/contracts/detail-vm";
import { Button } from "@/shared/ui/button";
import { ComboBox } from "@/shared/ui/combobox";
import { Dialog } from "@/shared/ui/dialog";
import { Input, Select, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

export interface CatalogOpt {
  id: string;
  label: string;
  hint?: string;
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

function Err({ state }: { state: { ok: boolean; error?: string } | null }) {
  if (!state || state.ok || !state.error) return null;
  return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>;
}

// ── Confirmar / desconfirmar reserva ─────────────────────────────────────

export function ConfirmReservationButton({
  contractId,
  confirmed,
}: {
  contractId: string;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant={confirmed ? "secondary" : "primary"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setErr(null);
          const res = await confirmReservationAction(contractId, !confirmed);
          setPending(false);
          if (res.ok) router.refresh();
          else setErr(res.error);
        }}
      >
        <CheckCircle2 />
        {confirmed ? "Revertir confirmación" : "Confirmar reserva"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

// ── Reprogramar ─────────────────────────────────────────────────────────

export function RescheduleForm({
  contractId,
  checkIn,
  checkOut,
}: {
  contractId: string;
  checkIn: string;
  checkOut: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(rescheduleReservationAction, null);
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Reprogramar
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Reprogramar reserva">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nueva entrada" htmlFor="checkIn" required>
                <Input id="checkIn" name="checkIn" type="date" defaultValue={checkIn} required />
              </Field>
              <Field label="Nueva salida" htmlFor="checkOut" required>
                <Input id="checkOut" name="checkOut" type="date" defaultValue={checkOut} required />
              </Field>
            </div>
            <Field label="Motivo (opcional)" htmlFor="reason">
              <Input id="reason" name="reason" />
            </Field>
            <p className="text-xs text-muted-foreground">
              Se conservará la fecha anterior en el historial y se recalculará la fecha límite de
              liquidación. Una reserva confirmada pasará a “requiere cambio de fecha”.
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Reprogramar"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Programar viaje (fecha abierta) ─────────────────────────────────────

export function ScheduleTripForm({
  contractId,
  vigenciaStart,
  vigenciaEnd,
}: {
  contractId: string;
  vigenciaStart: string | null;
  vigenciaEnd: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(scheduleTripAction, null);
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Programar viaje</Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Programar viaje"
          description={`Ventana de vigencia: ${vigenciaStart ?? "—"} → ${vigenciaEnd ?? "—"}`}
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de viaje" htmlFor="travelDate" required>
                <Input id="travelDate" name="travelDate" type="date" min={vigenciaStart ?? undefined} max={vigenciaEnd ?? undefined} required />
              </Field>
              <Field label="Fecha de regreso" htmlFor="returnDate">
                <Input id="returnDate" name="returnDate" type="date" />
              </Field>
              <Field label="Días" htmlFor="days">
                <Input id="days" name="days" type="number" min={0} />
              </Field>
              <Field label="Noches" htmlFor="nights">
                <Input id="nights" name="nights" type="number" min={0} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              El contrato <strong>pasará a fecha cerrada</strong> y se creará la reserva (pendiente
              de confirmación) reutilizando los datos del contrato. La ventana de vigencia se
              conserva como referencia.
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Programando…" : "Programar"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Cancelar contrato (RN-16) ──────────────────────────────────────────

export function CancelContractDialog({ vm }: { vm: ContractDetailVM }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelContractAction, null);
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancelar contrato
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={`Cancelar ${vm.number}`}>
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={vm.id} />
            <Field label="Causa" htmlFor="code" required>
              <Select id="code" name="code" defaultValue="desistimiento_cliente">
                <option value="desistimiento_cliente">Desistimiento del cliente</option>
                <option value="no_pago">No pago</option>
                <option value="fuerza_mayor">Fuerza mayor</option>
                <option value="error_agencia">Error de la agencia</option>
                <option value="otro">Otro</option>
              </Select>
            </Field>
            <Field label="Motivo (obligatorio)" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={2} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Reembolso al cliente (${vm.currency})`} htmlFor="refundMajor" hint="opcional — genera asiento">
                <Input id="refundMajor" name="refundMajor" type="number" min={0} step="0.01" />
              </Field>
              <Field label={`Penalidad retenida (${vm.currency})`} htmlFor="penaltyMajor" hint="opcional — genera asiento">
                <Input id="penaltyMajor" name="penaltyMajor" type="number" min={0} step="0.01" />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Se marcará el contrato y la reserva como cancelados. La acción queda auditada.
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Volver
              </Button>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Cancelando…" : "Cancelar contrato"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Editar contrato ────────────────────────────────────────────────────

export function EditContractForm({
  vm,
  sellers,
  destinations,
  hotels,
  groups,
}: {
  vm: ContractDetailVM;
  sellers: CatalogOpt[];
  destinations: CatalogOpt[];
  hotels: (CatalogOpt & { destinationId: string })[];
  groups: CatalogOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateContractAction, null);
  const [destId, setDestId] = useState(vm.destination.id);
  useRefreshOnOk(state, () => setOpen(false));
  const fe = (state && !state.ok && "fieldErrors" in state && state.fieldErrors) || {};
  const hotelsForDest = destId ? hotels.filter((h) => h.destinationId === destId) : hotels;
  const cerrada = vm.modality === "fecha_cerrada";

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Editar contrato
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={`Editar ${vm.number}`}>
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={vm.id} />
            <input type="hidden" name="version" value={vm.version} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendedor" htmlFor="sellerId">
                <ComboBox
                  name="seller"
                  allowCreate={false}
                  defaultId={vm.seller?.id ?? ""}
                  placeholder="Sin asignar"
                  options={sellers}
                />
              </Field>
              <Field label="Ámbito" htmlFor="tripType">
                <Select id="tripType" name="tripType" defaultValue={vm.tripType}>
                  <option value="nacional">Nacional</option>
                  <option value="internacional">Internacional</option>
                </Select>
              </Field>
              <Field label="Destino" htmlFor="destinationId">
                <ComboBox
                  name="destination"
                  allowCreate={false}
                  defaultId={vm.destination.id}
                  options={destinations}
                  onChange={({ id }) => setDestId(id)}
                />
              </Field>
              <Field label="Hotel" htmlFor="hotelId">
                <ComboBox
                  name="hotel"
                  allowCreate={false}
                  defaultId={vm.hotelId ?? ""}
                  placeholder="Sin especificar"
                  options={hotelsForDest}
                />
              </Field>
              <Field
                label="Grupo de viaje"
                htmlFor="groupId"
                hint="varias personas, mismo viaje — déjalo vacío para quitarlo"
              >
                <ComboBox
                  name="group"
                  defaultId={vm.group?.id ?? ""}
                  placeholder="Sin grupo"
                  options={groups}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de venta" htmlFor="saleDate">
                <Input id="saleDate" name="saleDate" type="date" defaultValue={vm.saleDate ?? ""} />
              </Field>
              {cerrada ? (
                <>
                  <Field label="Fecha de viaje" htmlFor="travelDate">
                    <Input id="travelDate" name="travelDate" type="date" defaultValue={vm.travelDate ?? ""} />
                  </Field>
                  <Field label="Fecha de regreso" htmlFor="returnDate">
                    <Input id="returnDate" name="returnDate" type="date" defaultValue={vm.returnDate ?? ""} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Vigencia desde" htmlFor="vigenciaStart">
                    <Input id="vigenciaStart" name="vigenciaStart" type="date" defaultValue={vm.vigenciaStart ?? ""} />
                  </Field>
                  <Field label="Vigencia hasta" htmlFor="vigenciaEnd">
                    <Input id="vigenciaEnd" name="vigenciaEnd" type="date" defaultValue={vm.vigenciaEnd ?? ""} />
                  </Field>
                </>
              )}
              <Field label="Días" htmlFor="days">
                <Input id="days" name="days" type="number" min={0} defaultValue={vm.days ?? ""} />
              </Field>
              <Field label="Noches" htmlFor="nights">
                <Input id="nights" name="nights" type="number" min={0} defaultValue={vm.nights ?? ""} />
              </Field>
              <Field label={`Precio total (${vm.currency})`} htmlFor="priceMajor" error={fe.priceMajor?.[0]}>
                <Input
                  id="priceMajor"
                  name="priceMajor"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={vm.priceMajor}
                />
              </Field>
              <Field label="Días de anticipación (liquidación)" htmlFor="liquidationLeadDays">
                <Input
                  id="liquidationLeadDays"
                  name="liquidationLeadDays"
                  type="number"
                  min={0}
                  defaultValue={vm.liquidationLeadDays}
                />
              </Field>
            </div>

            <fieldset className="rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Pasajeros</legend>
              <div className="grid grid-cols-4 gap-3">
                <Field label="Adultos" htmlFor="adults">
                  <Input id="adults" name="adults" type="number" min={0} defaultValue={vm.passengers.adults} />
                </Field>
                <Field label="Niños" htmlFor="children">
                  <Input id="children" name="children" type="number" min={0} defaultValue={vm.passengers.children} />
                </Field>
                <Field label="Infantes" htmlFor="infants">
                  <Input id="infants" name="infants" type="number" min={0} defaultValue={vm.passengers.infants} />
                </Field>
                <Field label="Packs" htmlFor="packs">
                  <Input id="packs" name="packs" type="number" min={1} defaultValue={vm.passengers.packs} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Comisión del vendedor (congelada al vender)
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo" htmlFor="commissionKind">
                  <Select id="commissionKind" name="commissionKind" defaultValue={vm.commission.kind}>
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Valor fijo</option>
                  </Select>
                </Field>
                <Field label="Valor" htmlFor="commissionValueMajor">
                  <Input
                    id="commissionValueMajor"
                    name="commissionValueMajor"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={vm.commission.valueDisplay}
                  />
                </Field>
              </div>
            </fieldset>

            <Field label="Empresa del contrato" htmlFor="issuer" hint="DEMO = Agencia Demo; escribe otra si no es de DEMO">
              <Input id="issuer" name="issuer" defaultValue={vm.issuer} />
            </Field>

            <Field label="Notas" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} defaultValue={vm.notes ?? ""} />
            </Field>

            <p className="text-xs text-muted-foreground">
              Cambiar el ámbito recalcula los días de anticipación (salvo que los fijes aquí).
              Cambiar las fechas de viaje también actualiza la reserva. Cambiar la comisión
              recalcula la «comisión esperada», no reescribe pagos ya hechos.
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Cambiar titular (traspaso, §23.1) ──────────────────────────────────

export function TransferClientButton({
  vm,
  clients,
}: {
  vm: ContractDetailVM;
  clients: CatalogOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(transferContractAction, null);
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cambiar titular
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Cambiar titular de ${vm.number}`}
          description="El contrato pasa a otro cliente sin rehacerlo. Los pagos, cuotas, documentos e historial van con el contrato. Queda registrado el titular anterior."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={vm.id} />
            <Field label="Nuevo titular" htmlFor="newClientId" required>
              <ComboBox
                name="newClient"
                placeholder="Escribe o elige el cliente…"
                options={clients}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Titular actual: <strong>{vm.client.name}</strong>
            </p>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Cambiando…" : "Cambiar titular"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Duplicar contrato (acompañantes del mismo viaje) ───────────────────

export function DuplicateContractButton({
  vm,
  clients,
}: {
  vm: ContractDetailVM;
  clients: CatalogOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(duplicateContractAction, null);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Duplicar contrato
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Duplicar ${vm.number}`}
          description="Crea un contrato nuevo con el mismo destino, fechas, hotel, vendedor y precio — para el acompañante de este viaje. No copia pagos, documentos ni notas."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={vm.id} />
            <Field label="Cliente del nuevo contrato" htmlFor="newClientId" required>
              <ComboBox name="newClient" placeholder="Escribe o elige el cliente…" options={clients} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="keepGroup" defaultChecked className="size-4" />
              Añadir al mismo grupo de viaje
              {!vm.group && " (se crea un grupo nuevo con los dos contratos)"}
            </label>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Duplicando…" : "Duplicar contrato"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Archivar / restaurar contrato (RN-12) ──────────────────────────────

export function MarkTraveledButton({ contractId, traveled }: { contractId: string; traveled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          if (traveled || confirm("¿Este cliente ya viajó? El contrato pasará a Finalizado y dejará de generar alertas.")) {
            setPending(true);
            const res = await markTraveledAction(contractId, !traveled);
            setPending(false);
            if (res.ok) router.refresh();
            else setErr(res.error);
          }
        }}
      >
        {traveled ? "Quitar «ya viajó»" : "Ya viajó"}
      </Button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </>
  );
}

export function ArchiveContractButton({
  contractId,
  archived,
}: {
  contractId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (archived) {
    return (
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const res = await archiveContractAction(contractId, false);
          setPending(false);
          if (res.ok) router.refresh();
          else setErr(res.error);
        }}
      >
        Restaurar contrato
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Archivar contrato
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Archivar contrato"
          description="El contrato desaparece de las listas, el calendario, las alertas y los reportes. No se borra: puedes restaurarlo cuando quieras."
        >
          <div className="space-y-3">
            <Field label="Motivo (opcional)" htmlFor="reason">
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="p. ej. contrato de prueba" />
            </Field>
            {err && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setErr(null);
                  const res = await archiveContractAction(contractId, true, reason || undefined);
                  setPending(false);
                  if (res.ok) {
                    setOpen(false);
                    router.refresh();
                  } else setErr(res.error);
                }}
              >
                {pending ? "Archivando…" : "Archivar"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

// ── Eliminar contrato (borrado definitivo) ─────────────────────────────

export function DeleteContractDialog({ vm }: { vm: ContractDetailVM }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState(deleteContractAction, null);

  const payments = vm.ledger.length;
  const docs = vm.documents.length;
  const notes = vm.notesList.length;
  const matches = confirm.trim() === vm.number;

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Eliminar definitivamente
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Eliminar ${vm.number}`}
          description="Borrado permanente. Esto NO se puede deshacer."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={vm.id} />

            <div className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              Se borrarán para siempre: el contrato, su reserva
              {vm.reservation ? "" : " (no tiene)"}, {payments} movimiento(s) de dinero,
              {" "}las cuotas, {docs} documento(s) y {notes} nota(s). Los cupos asignados
              se liberarán. Sólo quedará el registro en la bitácora de auditoría.
            </div>
            <p className="text-xs text-muted-foreground">
              ¿Sólo quieres que desaparezca de las listas? Usa <strong>Archivar</strong>{" "}
              en su lugar: es reversible.
            </p>

            <Field
              label={`Escribe ${vm.number} para confirmar`}
              htmlFor="confirmNumber"
              required
            >
              <Input
                id="confirmNumber"
                name="confirmNumber"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                placeholder={vm.number}
              />
            </Field>

            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" disabled={pending || !matches}>
                {pending ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Resolver excepción (RN-07) ─────────────────────────────────────────

export function ResolveExceptionDialog({ vm }: { vm: ContractDetailVM }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resolveExceptionAction, null);
  const [resolution, setResolution] = useState("mantener_activo");
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button onClick={() => setOpen(true)}>Resolver situación</Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Resolver contrato fuera de plazo"
          description="Se alcanzó la fecha límite de liquidación con saldo pendiente. Un administrador debe decidir explícitamente."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={vm.id} />
            <Field label="Decisión" htmlFor="resolution" required>
              <Select
                id="resolution"
                name="resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="mantener_activo">Mantener activo</option>
                <option value="fecha_extendida">Extender fecha de viaje</option>
                <option value="excepcion_autorizada">Autorizar excepción</option>
                <option value="incumplido">Marcar incumplido</option>
              </Select>
            </Field>
            {resolution === "fecha_extendida" && (
              <Field label="Nueva fecha de viaje" htmlFor="newTravelDate" required>
                <Input id="newTravelDate" name="newTravelDate" type="date" />
              </Field>
            )}
            <Field label="Justificación" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={2} required />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar decisión"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Subir documento ────────────────────────────────────────────────────

export function DocumentUpload({ contractId }: { contractId: string }) {
  const [state, action, pending] = useActionState(uploadDocAction, null);
  const router = useRouter();
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form key={key} action={action} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="entityType" value="contract" />
      <input type="hidden" name="entityId" value={contractId} />
      <Field label="Tipo" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="comprobante" className="w-44">
          <option value="contrato">Contrato</option>
          <option value="contrato_firmado">Contrato firmado</option>
          <option value="comprobante">Comprobante</option>
          <option value="voucher">Voucher</option>
          <option value="confirmacion_hotel">Confirmación de hotel</option>
          <option value="otro">Otro</option>
        </Select>
      </Field>
      <input
        type="file"
        name="file"
        accept="application/pdf,image/jpeg,image/png"
        required
        className="text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5"
      />
      <Button type="submit" disabled={pending}>
        <Upload /> {pending ? "Subiendo…" : "Subir"}
      </Button>
      <Err state={state} />
    </form>
  );
}

export function ArchiveDocButton({ id, contractId }: { id: string; contractId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await archiveDocAction(id, contractId);
        setPending(false);
        if (res.ok) router.refresh();
      }}
    >
      Archivar
    </Button>
  );
}

// ── Notas ──────────────────────────────────────────────────────────────

export function AddNoteForm({ entityId }: { entityId: string }) {
  const [state, action, pending] = useActionState(addNoteAction, null);
  const router = useRouter();
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form key={key} action={action} className="space-y-2">
      <input type="hidden" name="entityType" value="contract" />
      <input type="hidden" name="entityId" value={entityId} />
      <Textarea name="content" rows={2} placeholder="Escribe una nota interna…" required />
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="pinned" className="size-4" /> Fijar
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="priority" value="alta" className="size-4" /> Prioridad alta
        </label>
        <Button type="submit" size="sm" disabled={pending} className="ml-auto">
          {pending ? "Guardando…" : "Añadir nota"}
        </Button>
      </div>
      <Err state={state} />
    </form>
  );
}

export function ArchiveNoteButton({ id, entityId }: { id: string; entityId: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-muted-foreground hover:text-danger"
      onClick={async () => {
        const res = await archiveNoteAction(id, entityId);
        if (res.ok) router.refresh();
      }}
    >
      archivar
    </button>
  );
}

export function EditNoteButton({
  note,
  entityId,
}: {
  note: { id: string; content: string; pinned: boolean; priority: string };
  entityId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateNoteAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setOpen(true)}>
        editar
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Editar nota">
          <form action={action} className="space-y-2">
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="entityId" value={entityId} />
            <Textarea name="content" rows={3} defaultValue={note.content} required />
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="pinned" defaultChecked={note.pinned} className="size-4" /> Fijar
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="priority"
                  value="alta"
                  defaultChecked={note.priority === "alta"}
                  className="size-4"
                />
                Prioridad alta
              </label>
            </div>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Registrar pago ─────────────────────────────────────────────────────

export function RegisterPaymentForm({
  contractId,
  currency,
  installments,
  sellerRetainsCommission = false,
}: {
  contractId: string;
  currency: string;
  installments: { id: string; sequence: number; dueDate: string; state: string }[];
  sellerRetainsCommission?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(registerPaymentAction, null);
  const [recCur, setRecCur] = useState(currency);
  useRefreshOnOk(state, () => setOpen(false));
  const cross = recCur !== currency;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Registrar pago</Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Registrar pago recibido">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de valor" htmlFor="valueDate" required>
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
              <Field label="Monto recibido" htmlFor="receivedMajor" required>
                <Input id="receivedMajor" name="receivedMajor" type="number" min={0} step="0.01" required />
              </Field>
              <Field label="Moneda recibida" htmlFor="receivedCurrency" required>
                <Select
                  id="receivedCurrency"
                  name="receivedCurrency"
                  value={recCur}
                  onChange={(e) => setRecCur(e.target.value)}
                >
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>

            {cross && (
              <div className="grid grid-cols-2 gap-3 rounded-md bg-info-bg p-3">
                <Field label={`Tasa de cambio (${recCur}→${currency})`} htmlFor="exchangeRate" hint="se congela en el asiento">
                  <Input id="exchangeRate" name="exchangeRate" type="text" placeholder="0.00025" />
                </Field>
                <Field label={`o importe aplicado (${currency})`} htmlFor="appliedMajorOverride">
                  <Input id="appliedMajorOverride" name="appliedMajorOverride" type="number" min={0} step="0.01" />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Referencia" htmlFor="reference">
                <Input id="reference" name="reference" placeholder="N.º de transferencia" />
              </Field>
              <Field label="Imputar a cuota" htmlFor="installmentId">
                <Select id="installmentId" name="installmentId" defaultValue="">
                  <option value="">— sin imputar —</option>
                  {installments
                    .filter((i) => i.state !== "cancelada" && i.state !== "pagada")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        Cuota {i.sequence} · {i.dueDate}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>

            <Field label="Observaciones" htmlFor="notes">
              <Input id="notes" name="notes" />
            </Field>

            <label className="flex items-start gap-2 rounded-md bg-info-bg p-3 text-sm">
              <input
                type="checkbox"
                name="settleRetainedCommission"
                defaultChecked={sellerRetainsCommission}
                className="mt-0.5 size-4"
              />
              <span>
                Con este pago el contrato queda <strong>pagado</strong>.
                <span className="block text-xs text-muted-foreground">
                  Lo que falte respecto al precio se anota como comisión que retuvo el
                  vendedor. Úsalo cuando el cliente pagó todo pero a la agencia le llegó
                  menos.
                </span>
              </span>
            </label>

            <Field label="Comprobante (JPG, PNG o PDF)" htmlFor="receipt">
              <input
                id="receipt"
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png"
                className="text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5"
              />
            </Field>

            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Registrando…" : "Registrar pago"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function VoidEntryButton({ contractId, entryId }: { contractId: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(voidEntryAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => setOpen(true)}>
        anular
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Anular asiento">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="entryId" value={entryId} />
            <p className="text-sm text-muted-foreground">
              El asiento no se borra: queda marcado como anulado con su motivo. Registra un asiento
              nuevo si corresponde.
            </p>
            <Field label="Motivo de la anulación" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={2} required />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Anulando…" : "Anular"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export interface EditableEntry {
  id: string;
  kind: string;
  valueDate: string;
  receivedMajor: number;
  receivedCurrency: string;
  reference: string | null;
  method: string | null;
}

export function EditEntryButton({
  contractId,
  entry,
  contractCurrency,
}: {
  contractId: string;
  entry: EditableEntry;
  contractCurrency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateEntryAction, null);
  const [recCur, setRecCur] = useState(entry.receivedCurrency);
  useRefreshOnOk(state, () => setOpen(false));
  const cross = recCur !== contractCurrency;

  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setOpen(true)}>
        editar
      </button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Corregir pago"
          description="Para un error de tecleo (fecha o importe mal). El cambio queda registrado en la auditoría."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="entryId" value={entry.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de valor" htmlFor="valueDate" required>
                <Input id="valueDate" name="valueDate" type="date" defaultValue={entry.valueDate} required />
              </Field>
              <Field label="Método" htmlFor="method">
                <Select id="method" name="method" defaultValue={entry.method ?? "transferencia"}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
              <Field label="Monto recibido" htmlFor="receivedMajor" required>
                <Input
                  id="receivedMajor"
                  name="receivedMajor"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={entry.receivedMajor}
                  required
                />
              </Field>
              <Field label="Moneda recibida" htmlFor="receivedCurrency" required>
                <Select
                  id="receivedCurrency"
                  name="receivedCurrency"
                  value={recCur}
                  onChange={(e) => setRecCur(e.target.value)}
                >
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
            </div>
            {cross && (
              <div className="grid grid-cols-2 gap-3 rounded-md bg-info-bg p-3">
                <Field label={`Tasa (${recCur}→${contractCurrency})`} htmlFor="exchangeRate">
                  <Input id="exchangeRate" name="exchangeRate" type="text" placeholder="0.00025" />
                </Field>
                <Field label={`o importe aplicado (${contractCurrency})`} htmlFor="appliedMajorOverride">
                  <Input id="appliedMajorOverride" name="appliedMajorOverride" type="number" min={0} step="0.01" />
                </Field>
              </div>
            )}
            <Field label="Referencia" htmlFor="reference">
              <Input id="reference" name="reference" defaultValue={entry.reference ?? ""} />
            </Field>
            <Field label="Observaciones" htmlFor="notes">
              <Input id="notes" name="notes" />
            </Field>
            <Field label="Adjuntar comprobante (opcional)" htmlFor="receipt">
              <Input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function AttachReceiptButton({ contractId, entryId }: { contractId: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(attachReceiptAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setOpen(true)}>
        adjuntar
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Adjuntar comprobante" description="Sube la foto o el PDF del pago ya registrado.">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="entryId" value={entryId} />
            <Field label="Comprobante (JPG, PNG o PDF)" htmlFor="receipt" required>
              <Input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Subiendo…" : "Adjuntar"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function DeleteEntryButton({ contractId, entryId }: { contractId: string; entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => setOpen(true)}>
        eliminar
      </button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Eliminar pago"
          description="Para un error de tecleo. El asiento se borra por completo (no queda como «anulado»). Queda constancia en la auditoría."
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              ¿Sólo quieres corregir un importe? Usa <strong>anular</strong> y registra el pago
              correcto: así queda el rastro de lo que pasó.
            </p>
            {err && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setErr(null);
                  const res = await deleteEntryAction(contractId, entryId);
                  setPending(false);
                  if (res.ok) {
                    setOpen(false);
                    router.refresh();
                  } else setErr(res.error);
                }}
              >
                {pending ? "Eliminando…" : "Eliminar pago"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function MarkLiquidatedButton({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markLiquidatedAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Marcar contrato como pagado
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Marcar contrato como pagado"
          description="Úsalo si el contrato ya está pagado pero a la agencia le llegó menos porque el vendedor se quedó con su comisión. El saldo que falta se anota como «comisión retenida» y el contrato pasa a pagado. Los reportes siguen distinguiendo la caja recibida de la comisión cedida."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <Field label="Motivo" htmlFor="reason" required>
              <Textarea
                id="reason"
                name="reason"
                rows={2}
                required
                defaultValue="El saldo restante corresponde a la comisión retenida por el vendedor."
              />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Marcar como pagado"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function AddAdjustmentButton({ contractId, currency }: { contractId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addAdjustmentAction, null);
  const today = new Date().toISOString().slice(0, 10);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Descuento / castigo
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Ajuste autorizado">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo" htmlFor="kind" required>
                <Select id="kind" name="kind" defaultValue="descuento">
                  <option value="descuento">Descuento</option>
                  <option value="castigo">Castigo</option>
                </Select>
              </Field>
              <Field label={`Monto (${currency})`} htmlFor="amountMajor" required>
                <Input id="amountMajor" name="amountMajor" type="number" min={0} step="0.01" required />
              </Field>
            </div>
            <Field label="Fecha de valor" htmlFor="valueDate" required>
              <Input id="valueDate" name="valueDate" type="date" defaultValue={today} required />
            </Field>
            <Field label="Motivo" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={2} required />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar ajuste"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Plan de cuotas ─────────────────────────────────────────────────────

export function InstallmentPlanForm({
  contractId,
  currency,
  hasPlan,
}: {
  contractId: string;
  currency: string;
  hasPlan: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ dueDate: string; amountMajor: string }[]>([
    { dueDate: "", amountMajor: "" },
  ]);
  const [state, action, pending] = useActionState(setInstallmentPlanAction, null);
  useRefreshOnOk(state, () => setOpen(false));

  return (
    <>
      <Button variant={hasPlan ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {hasPlan ? "Editar plan de cuotas" : "Definir plan de cuotas"}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Plan de cuotas"
          description="Las cuotas que ya tienen pagos imputados no se modifican."
        >
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label={i === 0 ? "Vence" : ""} htmlFor={`d${i}`} className="flex-1">
                    <Input
                      id={`d${i}`}
                      name="dueDate"
                      type="date"
                      value={row.dueDate}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, dueDate: e.target.value } : r)))
                      }
                      required
                    />
                  </Field>
                  <Field label={i === 0 ? `Monto (${currency})` : ""} htmlFor={`a${i}`} className="flex-1">
                    <Input
                      id={`a${i}`}
                      name="amountMajor"
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.amountMajor}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, amountMajor: e.target.value } : r)))
                      }
                      required
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRows((rs) => [...rs, { dueDate: "", amountMajor: "" }])}
            >
              + Añadir cuota
            </Button>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar plan"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function SettleCommissionButton({
  contractId,
  suggested,
}: {
  contractId: string;
  suggested: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(settleCommissionAction, null);
  useRefreshOnOk(state, () => setOpen(false));
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Liquidar comisión
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Liquidar comisión al vendedor" description="Flujo de cuentas por pagar, separado del cobro al cliente.">
          <form action={action} className="space-y-3">
            <input type="hidden" name="contractId" value={contractId} />
            <Field label="Importe liquidado" htmlFor="settledMajor" required hint={`sugerido: ${suggested}`}>
              <Input id="settledMajor" name="settledMajor" type="number" min={0} step="0.01" required />
            </Field>
            <Field label="Referencia" htmlFor="reference">
              <Input id="reference" name="reference" />
            </Field>
            <Err state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Registrar liquidación"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
