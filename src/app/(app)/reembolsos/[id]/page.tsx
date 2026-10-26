import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/core/auth";
import { prisma } from "@/core/db/prisma";
import { NotFoundError } from "@/core/errors";
import { getRefundDetail } from "@/modules/refunds/service";
import { label } from "@/core/domain/enums";
import { toMajorNumber, money } from "@/core/money/money";
import { PageHeader } from "@/shared/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { RefundStateBadge } from "../components";
import { EditRefundButton, RefundPaymentButton, StateChanger, VoidRefundPaymentButton, AttachmentUpload, ArchiveRefundButton } from "./panels";
import { sortedEs } from "@/core/sort";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reembolso" };

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function ReembolsoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try {
    d = await getRefundDetail(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { refund: r, row } = d;
  const canEdit = can(user, "payment.register");
  const canVoid = can(user, "payment.void");

  const [contracts, groups] = canEdit
    ? await Promise.all([
        prisma.contract.findMany({
          where: { archivedAt: null },
          select: { id: true, number: true, client: { select: { fullName: true } } },
          orderBy: { number: "desc" },
        }),
        sortedEs(prisma.contractGroup.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (r) => r.name),
      ])
    : [[], []];

  const major = (v: bigint | null) => (v == null ? "" : String(toMajorNumber(money(v, r.currency))));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${r.number} — ${r.clientName}`}
        description={<RefundStateBadge state={r.state} overdue={row.overdue} />}
        actions={
          canEdit && !r.archivedAt ? (
            <>
              <EditRefundButton
                contracts={contracts.map((c) => ({ id: c.id, label: `${c.number} — ${c.client.fullName}` }))}
                groups={groups.map((g) => ({ id: g.id, label: g.name }))}
                initial={{
                  id: r.id,
                  contractId: r.contractId,
                  groupId: r.groupId,
                  clientName: r.clientName,
                  clientDoc: r.clientDoc,
                  contactEmail: r.contactEmail,
                  contactPhone: r.contactPhone,
                  people: r.people,
                  requestedAt: r.requestedAt,
                  channel: r.channel,
                  reasonCode: r.reasonCode,
                  reason: r.reason,
                  dueDate: r.dueDate,
                  currency: r.currency,
                  requestedMajor: major(r.requestedAmount),
                  agreedMajor: major(r.agreedAmount),
                  emailThread: r.emailThread,
                  notes: r.notes,
                }}
              />
              {!["rechazado", "desistido"].includes(r.state) && (
                <RefundPaymentButton refundId={r.id} contractId={r.contractId} currency={r.currency} />
              )}
            </>
          ) : r.archivedAt ? (
            <Badge tone="neutral">Archivado</Badge>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Solicitud</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row k="Contrato">
                {r.contract ? (
                  <Link href={`/contratos/${r.contract.id}`} className="text-primary hover:underline">
                    {r.contract.number} — {r.contract.client.fullName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Sin contrato en el sistema</span>
                )}
                {r.contract && r.contract.lifecycleState !== "cancelado" && (
                  <span className="ml-2 text-xs text-warning">(el contrato sigue {label(r.contract.lifecycleState).toLowerCase()})</span>
                )}
              </Row>
              {r.group && (
                <Row k="Grupo">
                  <Link href={`/grupos/${r.group.id}`} className="text-primary hover:underline">
                    {r.group.name}
                  </Link>
                </Row>
              )}
              <Row k="Documento">{r.clientDoc ?? "—"}</Row>
              <Row k="Contacto">
                {[r.contactEmail, r.contactPhone].filter(Boolean).join(" · ") || "—"}
              </Row>
              {r.people && <Row k="Personas">{r.people}</Row>}
              <Row k="Fecha de solicitud">{r.requestedAt}</Row>
              <Row k="Canal">{label(r.channel)}</Row>
              <Row k="Plazo">
                <span className={row.overdue ? "font-semibold text-danger" : ""}>{r.dueDate ?? "—"}</span>
              </Row>
              <Row k="Motivo">
                {label(r.reasonCode)}
                <p className="whitespace-pre-line text-muted-foreground">{r.reason}</p>
              </Row>
              {r.emailThread && (
                <Row k="Correo">
                  <a href={r.emailThread} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Abrir hilo en Gmail
                  </a>
                </Row>
              )}
              {r.notes && (
                <Row k="Notas">
                  <p className="whitespace-pre-line">{r.notes}</p>
                </Row>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Montos ({r.currency})</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row k="Pide el cliente">{row.requested}</Row>
              <Row k="Acordado">{row.agreed}</Row>
              <Row k="Ya pagado">{row.paid}</Row>
              <Row k="Pendiente">
                <span className="font-semibold">{row.pending}</span>
              </Row>
            </dl>
            {canEdit && !r.archivedAt && (
              <div className="mt-4 border-t border-border pt-3">
                <StateChanger refundId={r.id} current={r.state} />
                {r.stateNote && <p className="mt-2 text-xs text-muted-foreground">Última nota: {r.stateNote}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagos al cliente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.payments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Todavía no se le ha devuelto nada.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Monto</TH>
                  <TH>Método</TH>
                  <TH>Referencia</TH>
                  <TH>Comprobante</TH>
                  <TH>En el contrato</TH>
                  {canVoid && <TH />}
                </TR>
              </THead>
              <TBody>
                {d.payments.map((p) => (
                  <TR key={p.id} className={p.voided ? "opacity-50" : ""}>
                    <TD>{p.paidDate}</TD>
                    <TD className="tabular-nums">
                      {p.amount}
                      {p.voided && <Badge tone="danger" className="ml-1">anulado</Badge>}
                      {p.voidReason && <span className="block text-xs text-muted-foreground">{p.voidReason}</span>}
                    </TD>
                    <TD>{p.method ? label(p.method) : "—"}</TD>
                    <TD className="text-xs">{p.reference ?? "—"}</TD>
                    <TD className="text-xs">
                      {p.document ? (
                        <a href={`/api/files/${p.document.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {p.document.originalName}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-xs">{p.ledgerEntryId ? "Asentado" : "—"}</TD>
                    {canVoid && (
                      <TD className="text-right">
                        {!p.voided && <VoidRefundPaymentButton paymentId={p.id} refundId={r.id} contractId={r.contractId} />}
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documentos de la solicitud</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.attachments.length === 0 ? (
              <p className="text-muted-foreground">Sin documentos (derecho de petición, carta, captura…).</p>
            ) : (
              <ul className="space-y-1">
                {d.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {a.originalName}
                    </a>{" "}
                    <span className="text-xs text-muted-foreground">{a.createdAt.toISOString().slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <AttachmentUpload refundId={r.id} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {d.history.map((h) => (
                <li key={h.id}>
                  <span className="text-xs text-muted-foreground">
                    {h.at.toISOString().slice(0, 16).replace("T", " ")} · {h.user?.name ?? "sistema"}
                  </span>
                  <p>{h.summary}</p>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-4 border-t border-border pt-3">
                <ArchiveRefundButton id={r.id} archived={r.archivedAt != null} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
