/**
 * Uso único: marca con el prefijo "(EJEMPLO)" los clientes de demostración
 * que ya estaban en la base de datos antes de este cambio, para que se
 * distingan de los datos reales en todas las listas y el calendario.
 *
 *   npx tsx prisma/mark-demo.ts
 *
 * Es idempotente: si ya tienen el prefijo, no hace nada.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_NAMES = [
  "María González",
  "Pedro Ramírez",
  "Familia Ochoa",
  "Juliana Vélez",
];
const DEMO_NOTE =
  "Registro de demostración — puedes eliminarlo cuando cargues tus datos reales.";

async function main() {
  let changed = 0;
  for (const name of DEMO_NAMES) {
    const rows = await prisma.client.findMany({ where: { fullName: name } });
    for (const row of rows) {
      await prisma.client.update({
        where: { id: row.id },
        data: {
          fullName: `(EJEMPLO) ${name}`,
          notes: row.notes ?? DEMO_NOTE,
        },
      });
      changed++;
      console.log(`  marcado: ${name} → (EJEMPLO) ${name}`);
    }
  }
  console.log(changed === 0 ? "Nada que marcar (ya estaban marcados o no existen)." : `Listo: ${changed} cliente(s) marcados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
