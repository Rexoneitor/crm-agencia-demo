import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, can } from "@/core/auth";
import { NotFoundError } from "@/core/errors";
import { prisma } from "@/core/db/prisma";
import { getGroupDetail } from "@/modules/groups/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { PaymentBadge } from "@/shared/ui/state-badge";
import { RegisterGroupPaymentButton, AddContractToGroupForm, RemoveContractButton } from "./panels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grupo" };

export default async function GrupoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  let detail;
  try {
    detail = await getGroupDetail(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const canEdit = can(user, "contract.edit");
  const canPay = can(user, "payment.register");

  const memberIds = new Set(detail.contracts.map((c) => c.id));
  const candidates = await prisma.contract.findMany({
    where: { archivedAt: null, id: { notIn: [...memberIds] } },
    select: { id: true, number: true, client: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    // Sin tope: antes solo se podían agregar los 200 contratos más recientes (consulta liviana).
  });

  const currencies = [...new Set(detail.contracts.filter((c) => !c.archived).map((c) => c.currency))];

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.group.name}
        description={detail.group.notes ?? "Varias personas, un mismo viaje — organizados juntos."}
        actions={
          detail.group.archivedAt ? (
            <Badge tone="neutral">Archivado</Badge>
          ) : canPay && detail.contracts.length > 0 ? (
            <RegisterGroupPaymentButton
              groupId={detail.group.id}
              contracts={detail.contracts.filter((c) => !c.archived)}
              currencies={currencies}
            />
          ) : undefined
        }
      />

      {detail.contracts.length === 0 ? (
        <EmptyState
          title="Sin contratos todavía"
          description="Añade los contratos de este viaje para verlos juntos y poder repartir un pago entre ellos."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Contrato</TH>
                  <TH>Cliente</TH>
                  <TH>Destino</TH>
                  <TH>Precio</TH>
                  <TH>Saldo</TH>
                  <TH>Estado</TH>
                  {canEdit && <TH className="text-right">Acciones</TH>}
                </TR>
              </THead>
              <TBody>
                {detail.contracts.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/contratos/${c.id}`} className="font-medium hover:underline">
                        {c.number}
                      </Link>
                      {c.archived && (
                        <Badge tone="neutral" className="ml-1">
                          Archivado
                        </Badge>
                      )}
                    </TD>
                    <TD>{c.client}</TD>
                    <TD>{c.destination}</TD>
                    <TD className="tabular-nums">{c.price}</TD>
                    <TD className="tabular-nums">{c.balance}</TD>
                    <TD>
                      <PaymentBadge state={c.paymentState} />
                    </TD>
                    {canEdit && (
                      <TD className="text-right">
                        <RemoveContractButton groupId={detail.group.id} contractId={c.id} />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canEdit && !detail.group.archivedAt && (
        <Card>
          <CardContent className="p-4">
            <AddContractToGroupForm
              groupId={detail.group.id}
              candidates={candidates.map((c) => ({ id: c.id, label: `${c.number} — ${c.client.fullName}` }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
