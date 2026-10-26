import { requireUser, can } from "@/core/auth";
import { BACKUP_DISABLED_MESSAGE } from "@/modules/backup/service";
import { prisma } from "@/core/db/prisma";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { label } from "@/core/domain/enums";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sistema" };


export default async function SistemaPage() {
  const user = await requireUser();
  const audit = await prisma.auditLog.findMany({
    orderBy: { at: "desc" },
    take: 40,
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistema"
        description="Exportación, respaldos y auditoría. Siempre puedes llevarte tus datos en un Excel."
      />

      <Card>
        <CardHeader>
          <CardTitle>Exportar datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {can(user, "export.run") ? (
            <>
              <div className="space-y-2">
                <a
                  href="/api/export/full"
                  className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Descargar TODO en un Excel
                </a>
                <p className="text-xs text-muted-foreground">
                  Un solo archivo editable con todo: contratos (con lo cobrado, lo retenido por el vendedor, saldo,
                  estado de la reserva y reembolso), el calendario mes por mes, reembolsos, pagos, las fotos de los
                  comprobantes, reservas, clientes, grupos, vendedores, comisiones, cupos, notas e
                  historial. Se abre con Excel, LibreOffice o Google Sheets y se puede seguir
                  usando aunque el CRM no funcione.
                </p>
              </div>

              <div className="border-t border-border pt-3">
                <a href="/api/export/paquete" className="text-sm font-medium text-primary hover:underline">
                  Paquete con el Excel y los CSV (.zip)
                </a>
                <p className="mt-1 text-xs text-muted-foreground">
                  El mismo Excel completo más cada hoja en CSV, por si hace falta importarla en otro sistema. Los PDF de los contratos y las fotos se descargan desde cada contrato (están guardados en Supabase). Guárdalo cada semana fuera de internet (USB o nube).
                </p>
              </div>

            </>
          ) : (
            <p className="text-sm text-muted-foreground">No tienes permiso para exportar.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respaldos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{BACKUP_DISABLED_MESSAGE}</p>
          <p className="text-xs text-muted-foreground">
            La base de datos está en Neon, que guarda un historial de cambios para restaurar a un momento anterior
            (consulta el panel de Neon, sección Restore). Los PDF y fotos están en Supabase Storage.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bitácora de auditoría (últimas 40)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {audit.length === 0 ? (
            <EmptyState title="Sin actividad registrada" className="m-4 border-0" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Entidad</TH>
                  <TH>Acción</TH>
                  <TH>Detalle</TH>
                  <TH>Usuario</TH>
                </TR>
              </THead>
              <TBody>
                {audit.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {a.at.toISOString().slice(0, 16).replace("T", " ")}
                    </TD>
                    <TD className="text-xs">{a.entityType}</TD>
                    <TD className="text-xs">{label(a.action)}</TD>
                    <TD className="text-xs text-muted-foreground">{a.summary ?? "—"}</TD>
                    <TD className="text-xs">{a.user?.name ?? "sistema"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
