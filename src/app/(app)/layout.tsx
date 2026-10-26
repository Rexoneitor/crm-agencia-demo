import { requireUser } from "@/core/auth";
import { countActiveAlerts } from "@/modules/alerts/service";
import { maybeAutoBackup } from "@/modules/backup/service";
import { AppShell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Respaldo automático diario, en segundo plano (no bloquea la página).
  void maybeAutoBackup().catch(() => {});

  let alertCount = 0;
  try {
    alertCount = await countActiveAlerts();
  } catch {
    // Si la BD aún no está lista, no rompemos el layout.
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      alertCount={alertCount}
    >
      {children}
    </AppShell>
  );
}
