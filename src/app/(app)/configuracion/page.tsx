import Link from "next/link";
import { requireUser, can } from "@/core/auth";
import { getAllSettings } from "@/modules/settings/service";
import { PageHeader } from "@/shared/ui/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { SettingsForm } from "./form";
import { PasswordCard } from "./password";

const CATALOGS = [
  { href: "/clientes", name: "Clientes", desc: "Personas y familias que compran viajes." },
  { href: "/vendedores", name: "Vendedores", desc: "Quién vende, con su comisión por defecto." },
  { href: "/destinos", name: "Destinos", desc: "Ciudades/países, con su color en el calendario." },
  { href: "/hoteles", name: "Hoteles", desc: "Alojamientos, asociados a un destino." },
];

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

const GROUP_LABELS: Record<string, string> = {
  agency: "Agencia",
  currency: "Moneda",
  liquidation: "Reglas de liquidación (RN-01 / RN-02)",
  alerts: "Umbrales de alertas",
  commission: "Comisiones",
  contract: "Contratos",
  documents: "Documentos",
  general: "General",
};

export default async function ConfiguracionPage() {
  const user = await requireUser();
  const settings = await getAllSettings();
  const editable = can(user, "settings.manage");

  const groups = new Map<string, typeof settings>();
  for (const s of settings) {
    const arr = groups.get(s.group) ?? [];
    arr.push(s);
    groups.set(s.group, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Ningún valor de negocio está fijado en el código: todo se edita aquí. Los cambios afectan al cálculo de estados y alertas en toda la aplicación."
      />
      {!editable && (
        <p className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
          Solo un administrador puede modificar la configuración.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Catálogos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="mb-2 text-sm text-muted-foreground">
            Aquí añades, editas o archivas lo que luego eliges al crear un contrato.
            (También puedes escribir un nombre nuevo directamente en el formulario de
            contrato y se crea solo.)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATALOGS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="rounded-lg border border-border p-3 transition-colors hover:bg-surface-muted"
              >
                <span className="block font-medium text-primary">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.desc}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <PasswordCard />

      <SettingsForm
        groups={[...groups.entries()].map(([key, items]) => ({
          key,
          label: GROUP_LABELS[key] ?? key,
          items,
        }))}
        editable={editable}
      />
    </div>
  );
}
