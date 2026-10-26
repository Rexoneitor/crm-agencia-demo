/**
 * "Empezar de cero": borra TODOS los datos operativos —contratos, clientes,
 * reservas, pagos, cuotas, comisiones, cupos, documentos, notas, historial y
 * alertas— dejando intactos:
 *   · usuarios y su configuración de acceso
 *   · la configuración del sistema (reglas, umbrales, moneda)
 *   · los maestros: destinos, hoteles y vendedores
 *
 * Úsalo cuando quieras quitar los datos de demostración y arrancar con datos
 * reales. NO se puede deshacer (haz un respaldo antes si tienes dudas).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Borrando datos operativos (se conservan usuarios, configuración y maestros)…\n");

  // En orden de dependencias (hijos antes que padres).
  const steps: [string, () => Promise<{ count: number }>][] = [
    ["Comprobantes", () => prisma.receipt.deleteMany()],
    ["Asientos del libro", () => prisma.ledgerEntry.deleteMany()],
    ["Cuotas", () => prisma.installment.deleteMany()],
    ["Comisiones", () => prisma.commission.deleteMany()],
    ["Pasajeros", () => prisma.contractPassenger.deleteMany()],
    ["Asignaciones de cupo", () => prisma.inventoryAssignment.deleteMany()],
    ["Pagos de cupo", () => prisma.inventoryPayment.deleteMany()],
    ["Reservas", () => prisma.reservation.deleteMany()],
    ["Contratos", () => prisma.contract.deleteMany()],
    ["Cupos", () => prisma.pendingInventory.deleteMany()],
    ["Clientes", () => prisma.client.deleteMany()],
    ["Documentos", () => prisma.document.deleteMany()],
    ["Notas", () => prisma.note.deleteMany()],
    ["Estado de alertas", () => prisma.alertState.deleteMany()],
    ["Historial / auditoría", () => prisma.auditLog.deleteMany()],
    ["Contadores de numeración", () => prisma.counter.deleteMany()],
    ["Registros de respaldo", () => prisma.backupRecord.deleteMany()],
  ];

  for (const [name, fn] of steps) {
    const { count } = await fn();
    console.log(`  ${name}: ${count} eliminado(s)`);
  }

  const kept = {
    usuarios: await prisma.user.count(),
    configuracion: await prisma.setting.count(),
    destinos: await prisma.destination.count(),
    hoteles: await prisma.hotel.count(),
    vendedores: await prisma.seller.count(),
  };
  console.log("\nSe conservan:", kept);
  console.log("\n✔ Listo. La aplicación queda vacía de datos operativos y lista para datos reales.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
