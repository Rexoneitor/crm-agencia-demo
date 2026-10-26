import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/core/auth";
import { listClients } from "@/modules/clients/service";
import { PageHeader, EmptyState } from "@/shared/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/table";
import { Pagination } from "@/shared/ui/pagination";
import { NewClientButton } from "./manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q;
  const { rows: clients, total, page, pageSize } = await listClients(q, { page: Number(sp.pagina) || 1 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Un mismo cliente puede tener varios contratos."
        actions={<NewClientButton />}
      />

      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nombre, teléfono, documento o N.º de contrato…"
          className="h-9 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title={q ? `Sin resultados para "${q}"` : "Aún no hay clientes"}
          description={q ? "Prueba con otro término." : "Crea el primer cliente para empezar a registrar contratos."}
          action={!q ? <NewClientButton /> : undefined}
        />
      ) : (
        <>
        <Pagination basePath="/clientes" params={{ q }} page={page} pageSize={pageSize} total={total} noun="clientes" />
        <Table>
          <THead>
            <TR>
              <TH>Cliente</TH>
              <TH>Documento</TH>
              <TH>Contacto</TH>
              <TH>Ciudad</TH>
              <TH>Contratos</TH>
            </TR>
          </THead>
          <TBody>
            {clients.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.fullName}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{c.documentId ?? "—"}</TD>
                <TD className="text-muted-foreground">
                  {c.phone ?? "—"}
                  {c.email ? ` · ${c.email}` : ""}
                </TD>
                <TD className="text-muted-foreground">{c.city ?? "—"}</TD>
                <TD className="tabular-nums">{c._count.contracts}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {total > pageSize && <Pagination basePath="/clientes" params={{ q }} page={page} pageSize={pageSize} total={total} noun="clientes" />}
        </>
      )}
    </div>
  );
}
