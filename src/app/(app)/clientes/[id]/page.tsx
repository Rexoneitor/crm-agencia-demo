import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth";
import { getClientDetail } from "@/modules/clients/service";
import { NotFoundError } from "@/core/errors";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent } from "@/shared/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { LifecycleBadge, PaymentBadge, ReservationBadge } from "@/shared/ui/state-badge";
import { ClientDetailTabs } from "./tabs";
import { EditClientButton } from "../manager";
import { label } from "@/core/domain/enums";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente" };

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  let data;
  try {
    data = await getClientDetail(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { client, contracts, notes, history, documents } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.fullName}
        description={[client.documentId, client.phone, client.city].filter(Boolean).join(" · ")}
        actions={
          <EditClientButton
            client={{
              id: client.id,
              fullName: client.fullName,
              documentId: client.documentId,
              phone: client.phone,
              email: client.email,
              city: client.city,
              address: client.address,
              notes: client.notes,
            }}
          />
        }
      />

      <ClientDetailTabs
        counts={{
          contratos: contracts.length,
          documentos: documents.length,
          notas: notes.length,
          historial: history.length,
        }}
        resumen={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="space-y-1 p-4 text-sm">
                  <Row label="Correo" value={client.email} />
                  <Row label="Teléfono" value={client.phone} />
                  <Row label="Documento" value={client.documentId} />
                  <Row label="Ciudad" value={client.city} />
                  <Row label="Dirección" value={client.address} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-sm">
                  <p className="mb-1 font-medium">Observaciones</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {client.notes || "Sin observaciones."}
                  </p>
                </CardContent>
              </Card>
            </div>
            <ContractsTable contracts={contracts} />
          </div>
        }
        contratos={<ContractsTable contracts={contracts} />}
        documentos={
          documents.length === 0 ? (
            <EmptyState title="Sin documentos" description="Los documentos del cliente aparecerán aquí." />
          ) : (
            <ul className="space-y-2 text-sm">
              {documents.map((d) => (
                <li key={d.id} className="rounded-md border border-border bg-surface px-3 py-2">
                  {d.originalName} · {label(d.kind)}
                </li>
              ))}
            </ul>
          )
        }
        notas={
          notes.length === 0 ? (
            <EmptyState title="Sin notas" description="Aún no hay notas internas para este cliente." />
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.author ?? "—"} · {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </p>
                </li>
              ))}
            </ul>
          )
        }
        historial={
          history.length === 0 ? (
            <EmptyState title="Sin historial" description="Los cambios registrados aparecerán aquí." />
          ) : (
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-3 border-b border-border py-2">
                  <span>{h.summary ?? h.action}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {h.user?.name ?? "sistema"} ·{" "}
                    {h.at.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function ContractsTable({
  contracts,
}: {
  contracts: Awaited<ReturnType<typeof getClientDetail>>["contracts"];
}) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        title="Sin contratos"
        description="Este cliente aún no tiene contratos registrados."
      />
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Contrato</TH>
          <TH>Destino</TH>
          <TH>Viaje</TH>
          <TH>Precio</TH>
          <TH>Saldo</TH>
          <TH>Estado</TH>
        </TR>
      </THead>
      <TBody>
        {contracts.map((c) => (
          <TR key={c.id}>
            <TD>
              <Link href={`/contratos/${c.id}`} className="font-medium hover:underline">
                {c.number}
              </Link>
              <span className="block text-xs text-muted-foreground">{label(c.modality)}</span>
            </TD>
            <TD>
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.destination}
              </span>
            </TD>
            <TD className="text-muted-foreground">{c.travelDate ?? "—"}</TD>
            <TD className="tabular-nums">{c.price}</TD>
            <TD className="tabular-nums">{c.balance}</TD>
            <TD>
              <div className="flex flex-wrap gap-1">
                <LifecycleBadge state={c.lifecycleState} />
                {c.reservationState && <ReservationBadge state={c.reservationState} />}
                <PaymentBadge state={c.paymentState} />
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
