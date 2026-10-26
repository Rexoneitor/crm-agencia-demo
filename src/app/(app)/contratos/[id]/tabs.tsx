"use client";

import Link from "next/link";
import { Tabs } from "@/shared/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { PaymentBadge } from "@/shared/ui/state-badge";
import { label } from "@/core/domain/enums";
import type { ContractDetailVM } from "@/modules/contracts/detail-vm";
import {
  AddAdjustmentButton,
  AddNoteForm,
  ArchiveContractButton,
  ArchiveDocButton,
  ArchiveNoteButton,
  CancelContractDialog,
  MarkTraveledButton,
  DeleteContractDialog,
  DeleteEntryButton,
  DuplicateContractButton,
  EditContractForm,
  EditEntryButton,
  AttachReceiptButton,
  EditNoteButton,
  TransferClientButton,
  ConfirmReservationButton,
  DocumentUpload,
  InstallmentPlanForm,
  MarkLiquidatedButton,
  RegisterPaymentForm,
  RescheduleForm,
  ResolveExceptionDialog,
  ScheduleTripForm,
  SettleCommissionButton,
  VoidEntryButton,
} from "./panels";

interface Perms {
  edit: boolean;
  confirm: boolean;
  reschedule: boolean;
  cancel: boolean;
  delete: boolean;
  resolveException: boolean;
  registerPayment: boolean;
  deletePayment: boolean;
  editPayment: boolean;
}

export interface Catalogs {
  sellers: { id: string; label: string }[];
  destinations: { id: string; label: string; hint?: string }[];
  hotels: { id: string; label: string; destinationId: string }[];
  clients: { id: string; label: string }[];
  groups: { id: string; label: string }[];
}

export function ContractTabs({
  vm,
  perms,
  catalogs,
}: {
  vm: ContractDetailVM;
  perms: Perms;
  catalogs: Catalogs;
}) {
  const canceled = vm.lifecycleState === "cancelado";

  return (
    <Tabs
      tabs={[
        { key: "resumen", label: "Resumen" },
        { key: "reserva", label: "Reserva" },
        { key: "pasajeros", label: "Pasajeros" },
        { key: "pagos", label: "Pagos", count: vm.ledger.length },
        { key: "cuotas", label: "Cuotas", count: vm.installments.length },
        { key: "documentos", label: "Documentos", count: vm.documents.length },
        { key: "notas", label: "Notas", count: vm.notesList.length },
        { key: "historial", label: "Historial", count: vm.history.length },
      ]}
    >
      {(active) => (
        <>
          {active === "resumen" && (
            <ResumenPanel vm={vm} perms={perms} canceled={canceled} catalogs={catalogs} />
          )}
          {active === "reserva" && <ReservaPanel vm={vm} perms={perms} canceled={canceled} />}
          {active === "pasajeros" && <PasajerosPanel vm={vm} />}
          {active === "pagos" && <PagosPanel vm={vm} perms={perms} />}
          {active === "cuotas" && <CuotasPanel vm={vm} perms={perms} />}
          {active === "documentos" && <DocumentosPanel vm={vm} perms={perms} />}
          {active === "notas" && <NotasPanel vm={vm} />}
          {active === "historial" && <HistorialPanel vm={vm} />}
        </>
      )}
    </Tabs>
  );
}

function Money({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </div>
  );
}

function ResumenPanel({
  vm,
  perms,
  canceled,
  catalogs,
}: {
  vm: ContractDetailVM;
  perms: Perms;
  canceled: boolean;
  catalogs: Catalogs;
}) {
  return (
    <div className="space-y-4">
      {vm.archived && (
        <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          Este contrato está <strong>archivado</strong>: no aparece en listas, calendario, alertas ni
          reportes. Usa “Restaurar contrato” abajo para reactivarlo.
        </div>
      )}
      {vm.needsExceptionResolution && perms.resolveException && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          <span>
            Este contrato alcanzó su fecha límite de liquidación ({vm.liquidationDueDate}) con saldo
            pendiente y necesita una decisión.
          </span>
          <ResolveExceptionDialog vm={vm} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Información general</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Row
              k="Cliente"
              v={
                <span>
                  <Link href={`/clientes/${vm.client.id}`} className="hover:underline">
                    {vm.client.name}
                  </Link>
                  {vm.transferredFrom && (
                    <span className="block text-xs text-muted-foreground">
                      antes: {vm.transferredFrom}
                    </span>
                  )}
                </span>
              }
            />
            <Row k="Vendedor" v={vm.seller?.name} />
            {vm.group && (
              <Row
                k="Grupo de viaje"
                v={
                  <Link href={`/grupos/${vm.group.id}`} className="hover:underline">
                    {vm.group.name}
                  </Link>
                }
              />
            )}
            <Row k="Destino" v={`${vm.destination.name} (${vm.destination.scope})`} />
            <Row k="Hotel" v={vm.hotel} />
            <Row k="Modalidad" v={vm.modalityLabel} />
            <Row k="Fecha de venta" v={vm.saleDate} />
            {vm.modality === "fecha_abierta" ? (
              <Row k="Ventana de vigencia" v={`${vm.vigenciaStart ?? "—"} → ${vm.vigenciaEnd ?? "—"}`} />
            ) : (
              <Row k="Viaje" v={`${vm.travelDate ?? "—"} → ${vm.returnDate ?? "—"} (${vm.days ?? "?"}d/${vm.nights ?? "?"}n)`} />
            )}
            <Row k="Días anticipación (congelado)" v={`${vm.liquidationLeadDays} días`} />
            <Row k="Fecha límite de liquidación" v={vm.liquidationDueDate} />
            {vm.cancellationReason && (
              <Row k="Motivo de cancelación" v={`${label(vm.cancellationCode ?? "")} — ${vm.cancellationReason}`} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dinero</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Precio bruto" v={<Money>{vm.price}</Money>} />
            <Row k="Liquidado" v={<Money>{vm.settled}</Money>} />
            <Row k="Saldo" v={<Money><strong>{vm.balance}</strong></Money>} />
            <div className="pt-1">
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(vm.paidRatio * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {Math.round(vm.paidRatio * 100)}% · <PaymentBadge state={vm.paymentState} />
              </p>
            </div>
            {vm.cashReceivedByCurrency.length > 0 && (
              <Row
                k="Caja recibida"
                v={vm.cashReceivedByCurrency.map((c) => c.formatted).join(" · ")}
              />
            )}
            <Row
              k="Comisión esperada"
              v={
                vm.commission.expected
                  ? `${vm.commission.expected} (${label(vm.commission.accrual)})`
                  : "—"
              }
            />
            {vm.commission.expected && (
              <div className="pt-1">
                {vm.commission.settledAt ? (
                  <p className="text-xs text-success">
                    Comisión liquidada el {new Date(vm.commission.settledAt).toLocaleDateString("es-CO")}
                  </p>
                ) : (
                  perms.registerPayment && (
                    <SettleCommissionButton contractId={vm.id} suggested={vm.commission.expected!} />
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(perms.edit || perms.cancel || perms.delete) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {perms.edit && !canceled && (
            <EditContractForm
              vm={vm}
              sellers={catalogs.sellers}
              destinations={catalogs.destinations}
              hotels={catalogs.hotels}
              groups={catalogs.groups}
            />
          )}
          {perms.edit && !canceled && (
            <TransferClientButton vm={vm} clients={catalogs.clients} />
          )}
          {perms.edit && (
            <DuplicateContractButton vm={vm} clients={catalogs.clients} />
          )}
          {perms.cancel && (
            <ArchiveContractButton contractId={vm.id} archived={vm.archived} />
          )}
          {perms.cancel && !canceled && !vm.archived && (
            <MarkTraveledButton contractId={vm.id} traveled={vm.lifecycleState === "finalizado"} />
          )}
          {perms.cancel && !canceled && !vm.archived && <CancelContractDialog vm={vm} />}
          {perms.delete && <DeleteContractDialog vm={vm} />}
        </div>
      )}
    </div>
  );
}

function ReservaPanel({ vm, perms, canceled }: { vm: ContractDetailVM; perms: Perms; canceled: boolean }) {
  if (!vm.reservation) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Sin reserva todavía"
          description={
            vm.modality === "fecha_abierta"
              ? "Es un contrato de fecha abierta. Cuando el cliente defina su fecha, prográmalo aquí."
              : "Este contrato no tiene reserva asociada."
          }
          action={
            vm.modality === "fecha_abierta" && perms.reschedule && !canceled ? (
              <ScheduleTripForm
                contractId={vm.id}
                vigenciaStart={vm.vigenciaStart}
                vigenciaEnd={vm.vigenciaEnd}
              />
            ) : undefined
          }
        />
      </div>
    );
  }

  const r = vm.reservation;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 text-sm">
          <Row k="Estado" v={label(r.state)} />
          <Row k="Entrada" v={r.checkIn} />
          <Row k="Salida" v={r.checkOut} />
          <Row k="Confirmada" v={r.confirmedAt ? new Date(r.confirmedAt).toLocaleString("es-CO") : "No"} />
          <Row k="Días para el viaje" v={vm.daysToTravel !== null ? `${vm.daysToTravel}` : "—"} />
        </CardContent>
      </Card>

      {!canceled && (
        <div className="flex flex-wrap gap-2">
          {perms.confirm && (
            <ConfirmReservationButton contractId={vm.id} confirmed={r.state === "confirmada"} />
          )}
          {perms.reschedule && (
            <RescheduleForm contractId={vm.id} checkIn={r.checkIn} checkOut={r.checkOut} />
          )}
        </div>
      )}
    </div>
  );
}

function PasajerosPanel({ vm }: { vm: ContractDetailVM }) {
  const p = vm.passengers;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Adultos", p.adults],
        ["Niños", p.children],
        ["Infantes", p.infants],
        ["Packs", p.packs],
      ].map(([k, v]) => (
        <Card key={k as string}>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{v}</p>
            <p className="text-xs text-muted-foreground">{k}</p>
          </CardContent>
        </Card>
      ))}
      <Card className="col-span-2 sm:col-span-4">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Total de pasajeros: <strong className="text-foreground">{p.total}</strong>. El registro
          nominal (nombres y documentos) es una extensión prevista para viajes internacionales.
        </CardContent>
      </Card>
    </div>
  );
}

function PagosPanel({ vm, perms }: { vm: ContractDetailVM; perms: Perms }) {
  const canceled = vm.lifecycleState === "cancelado";
  const hasBalance = BigInt(vm.balanceRaw) > 0n;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>Precio: <strong className="tabular-nums">{vm.price}</strong></span>
        <span>Liquidado: <strong className="tabular-nums">{vm.settled}</strong></span>
        <span>Saldo: <strong className="tabular-nums">{vm.balance}</strong></span>
        <span className="ml-auto flex flex-wrap gap-2">
          {perms.registerPayment && !canceled && (
            <RegisterPaymentForm
              contractId={vm.id}
              currency={vm.currency}
              installments={vm.installments}
              sellerRetainsCommission={vm.seller?.retainsCommission ?? false}
            />
          )}
          {perms.registerPayment && !canceled && (
            <AddAdjustmentButton contractId={vm.id} currency={vm.currency} />
          )}
          {perms.registerPayment && !canceled && hasBalance && (
            <MarkLiquidatedButton contractId={vm.id} />
          )}
        </span>
      </div>

      {vm.cashReceivedByCurrency.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Caja real recibida: {vm.cashReceivedByCurrency.map((c) => c.formatted).join(" · ")}
        </p>
      )}

      {vm.ledger.length === 0 ? (
        <EmptyState title="Sin movimientos" description="Registra el primer pago para empezar el libro de asientos." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Fecha</TH>
              <TH>Tipo</TH>
              <TH>Recibido</TH>
              <TH>Aplicado</TH>
              <TH>Ref.</TH>
              <TH>Registró</TH>
              {perms.registerPayment && <TH />}
            </TR>
          </THead>
          <TBody>
            {vm.ledger.map((e) => (
              <TR key={e.id} className={e.voided ? "opacity-50" : ""}>
                <TD>{e.valueDate}</TD>
                <TD className={e.voided ? "line-through" : ""}>
                  {e.kindLabel}
                  {e.groupPayment && (
                    <Badge tone="neutral" className="ml-1.5">
                      pago de grupo
                    </Badge>
                  )}
                  {e.reason && <span className="block text-xs text-muted-foreground">{e.reason}</span>}
                  {e.voided && e.voidReason && (
                    <span className="block text-xs text-danger">anulado: {e.voidReason}</span>
                  )}
                  {e.receipts.length > 0 && (
                    <span className="block text-xs">
                      {e.receipts.map((r) => (
                        <a key={r.id} href={`/api/files/${r.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {r.name}
                        </a>
                      ))}
                    </span>
                  )}
                </TD>
                <TD className="tabular-nums">
                  {e.received}
                  {e.crossCurrency && (
                    <span className="block text-xs text-muted-foreground">tasa {e.exchangeRate}</span>
                  )}
                </TD>
                <TD className="tabular-nums">{e.applied}</TD>
                <TD className="text-muted-foreground">{e.reference ?? "—"}</TD>
                <TD className="text-muted-foreground">{e.by ?? "—"}</TD>
                {(perms.registerPayment || perms.deletePayment || perms.editPayment) && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      {perms.editPayment && !e.voided && e.kind !== "aplicacion_de_anticipo" && (
                        <EditEntryButton
                          contractId={vm.id}
                          contractCurrency={vm.currency}
                          entry={{
                            id: e.id,
                            kind: e.kind,
                            valueDate: e.valueDate,
                            receivedMajor: e.receivedMajor,
                            receivedCurrency: e.receivedCurrency,
                            reference: e.reference,
                            method: e.method,
                          }}
                        />
                      )}
                      {perms.registerPayment && !e.voided && e.kind === "pago_recibido" && (
                        <AttachReceiptButton contractId={vm.id} entryId={e.id} />
                      )}
                      {perms.registerPayment && !e.voided && (
                        <VoidEntryButton contractId={vm.id} entryId={e.id} />
                      )}
                      {perms.deletePayment && (
                        <DeleteEntryButton contractId={vm.id} entryId={e.id} />
                      )}
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function CuotasPanel({ vm, perms }: { vm: ContractDetailVM; perms: Perms }) {
  const planControl = perms.edit && vm.lifecycleState !== "cancelado" && (
    <div className="flex justify-end">
      <InstallmentPlanForm
        contractId={vm.id}
        currency={vm.currency}
        hasPlan={vm.installments.length > 0}
      />
    </div>
  );
  if (vm.installments.length === 0) {
    return (
      <div className="space-y-4">
        {planControl}
        <EmptyState title="Sin plan de cuotas" description="Este contrato no tiene cuotas definidas. Puedes registrar pagos sin plan o definir uno." />
      </div>
    );
  }
  const tone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
    pagada: "success",
    parcial: "warning",
    proxima: "warning",
    vencida: "danger",
    pendiente: "neutral",
    cancelada: "neutral",
  };
  return (
    <div className="space-y-4">
      {planControl}
      <Table>
        <THead>
          <TR>
            <TH>#</TH>
            <TH>Vence</TH>
            <TH>Esperado</TH>
            <TH>Pagado</TH>
            <TH>Pendiente</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {vm.installments.map((i) => (
            <TR key={i.id}>
              <TD>{i.sequence}</TD>
              <TD>{i.dueDate}</TD>
              <TD className="tabular-nums">{i.expected}</TD>
              <TD className="tabular-nums">{i.paid}</TD>
              <TD className="tabular-nums">{i.outstanding}</TD>
              <TD>
                <Badge tone={tone[i.state] ?? "neutral"}>{label(i.state)}</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function DocumentosPanel({ vm, perms }: { vm: ContractDetailVM; perms: Perms }) {
  return (
    <div className="space-y-4">
      {perms.edit && <DocumentUpload contractId={vm.id} />}
      {vm.documents.length === 0 ? (
        <EmptyState title="Sin documentos" description="Adjunta el contrato PDF, comprobantes, vouchers o confirmaciones." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {vm.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Badge tone="outline">{d.kindLabel}</Badge>
              <a
                href={`/api/files/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {d.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{d.sizeKb} KB</span>
              {perms.edit && <ArchiveDocButton id={d.id} contractId={vm.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotasPanel({ vm }: { vm: ContractDetailVM }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <AddNoteForm entityId={vm.id} />
        </CardContent>
      </Card>
      {vm.notesList.length === 0 ? (
        <EmptyState title="Sin notas" description="Aún no hay notas internas para este contrato." />
      ) : (
        <ul className="space-y-2">
          {vm.notesList.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap">{n.content}</p>
                <span className="flex shrink-0 gap-2">
                  <EditNoteButton
                    note={{ id: n.id, content: n.content, pinned: n.pinned, priority: n.priority }}
                    entityId={vm.id}
                  />
                  <ArchiveNoteButton id={n.id} entityId={vm.id} />
                </span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {n.pinned && <Badge tone="warning">Fijada</Badge>}
                {n.priority === "alta" && <Badge tone="danger">Alta</Badge>}
                {n.author ?? "—"} · {new Date(n.createdAt).toLocaleString("es-CO")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistorialPanel({ vm }: { vm: ContractDetailVM }) {
  if (vm.history.length === 0) {
    return <EmptyState title="Sin historial" description="Los cambios quedarán registrados aquí." />;
  }
  return (
    <ul className="space-y-1 text-sm">
      {vm.history.map((h) => (
        <li key={h.id} className="flex justify-between gap-3 border-b border-border py-2">
          <span>{h.summary ?? h.action}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {h.user} · {new Date(h.at).toLocaleString("es-CO")}
          </span>
        </li>
      ))}
    </ul>
  );
}
