/**
 * Datos iniciales + datos de demostración.
 *  · Usuarios: admin y estándar.
 *  · Configuración: todos los defaults (RN configurables).
 *  · Maestros: destinos con color y ámbito, hoteles, vendedores.
 *  · Demo: clientes y contratos ficticios cubriendo los casos del prompt §52.
 *
 * Nunca usa datos personales reales. Es idempotente por email/nombre.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { addDays, format } from "date-fns";
import { SETTING_DEFS } from "../src/modules/settings/defaults";

const prisma = new PrismaClient();
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const today = new Date();
const d = (offsetDays: number) => format(addDays(today, offsetDays), "yyyy-MM-dd");

async function main() {
  console.log("→ Sembrando configuración…");
  for (const s of SETTING_DEFS) {
    const value = s.type === "json" ? JSON.stringify(s.value) : String(s.value);
    await prisma.setting.upsert({
      where: { key: s.key },
      create: { key: s.key, value, type: s.type, group: s.group, label: s.label },
      update: {}, // no piso overrides existentes
    });
  }

  console.log("→ Usuarios…");
  const adminPass = await hash("admin1234", ARGON);
  const userPass = await hash("usuario1234", ARGON);
  const admin = await prisma.user.upsert({
    where: { email: "admin@agencia.com" },
    create: { email: "admin@agencia.com", name: "Administradora", role: "admin", passwordHash: adminPass },
    update: { role: "admin" },
  });
  await prisma.user.upsert({
    where: { email: "usuario@agencia.com" },
    create: { email: "usuario@agencia.com", name: "Operador Ventas", role: "standard", passwordHash: userPass },
    update: {},
  });

  console.log("→ Destinos y hoteles…");
  const destinationsSeed = [
    { name: "Santa Marta", scope: "nacional", color: "#f59e0b" },
    { name: "San Andrés", scope: "nacional", color: "#ef4444" },
    { name: "Cartagena", scope: "nacional", color: "#3b82f6" },
    { name: "Coveñas", scope: "nacional", color: "#10b981" },
    { name: "Cancún", scope: "internacional", color: "#8b5cf6" },
    { name: "Punta Cana", scope: "internacional", color: "#ec4899" },
    { name: "Curazao", scope: "internacional", color: "#06b6d4" },
  ];
  const destinations: Record<string, string> = {};
  for (const ds of destinationsSeed) {
    const row = await prisma.destination.upsert({
      where: { name: ds.name },
      create: { name: ds.name, scope: ds.scope, color: ds.color, country: ds.scope === "nacional" ? "Colombia" : "—" },
      update: { color: ds.color, scope: ds.scope },
    });
    destinations[ds.name] = row.id;
  }

  const hotelsSeed: [string, string][] = [
    ["Hotel Zuana", "Santa Marta"],
    ["Decameron San Luis", "San Andrés"],
    ["Hotel Las Américas", "Cartagena"],
    ["Kokomo Beach", "Curazao"],
    ["Riu Palace", "Punta Cana"],
    ["Grand Oasis", "Cancún"],
  ];
  const hotels: Record<string, string> = {};
  for (const [name, dest] of hotelsSeed) {
    const existing = await prisma.hotel.findFirst({ where: { name, destinationId: destinations[dest] } });
    const row =
      existing ??
      (await prisma.hotel.create({ data: { name, destinationId: destinations[dest] } }));
    hotels[name] = row.id;
  }

  console.log("→ Vendedores…");
  const sellersSeed = [
    { name: "Laura Restrepo", commissionKind: "percentage", commissionValue: "10" },
    { name: "Carlos Mejía", commissionKind: "percentage", commissionValue: "8" },
    { name: "Ana Torres", commissionKind: "fixed", commissionValue: "150000", commissionCurrency: "COP" },
  ];
  const sellers: Record<string, string> = {};
  for (const s of sellersSeed) {
    const existing = await prisma.seller.findFirst({ where: { name: s.name } });
    const row = existing ?? (await prisma.seller.create({ data: s }));
    sellers[s.name] = row.id;
  }

  console.log("→ Clientes demo…");
  const DEMO_NOTE = "Registro de demostración — puedes eliminarlo cuando cargues tus datos reales.";
  // El prefijo "(EJEMPLO)" deja claro en todas las listas qué es de prueba.
  const clientsSeed = [
    { fullName: "(EJEMPLO) María González", phone: "3001112233", documentId: "43111222", city: "Medellín" },
    { fullName: "(EJEMPLO) Pedro Ramírez", phone: "3014445566", documentId: "71444555", city: "Bogotá" },
    { fullName: "(EJEMPLO) Familia Ochoa", phone: "3027778899", city: "Rionegro" },
    { fullName: "(EJEMPLO) Juliana Vélez", phone: "3009990011", documentId: "1017990011", city: "Envigado" },
  ];
  const clients: Record<string, string> = {};
  for (const c of clientsSeed) {
    const bareName = c.fullName.replace(/^\(EJEMPLO\)\s*/, "");
    const existing =
      (await prisma.client.findFirst({ where: { fullName: c.fullName } })) ??
      (await prisma.client.findFirst({ where: { fullName: bareName } }));
    const row =
      existing ??
      (await prisma.client.create({ data: { ...c, notes: DEMO_NOTE, createdBy: admin.id } }));
    // clave por nombre sin prefijo para que el resto del seed no cambie
    clients[bareName] = row.id;
  }

  // Numeración
  const year = format(today, "yyyy");
  async function nextNumber(): Promise<string> {
    const counter = await prisma.counter.upsert({
      where: { key: `contract:${year}` },
      create: { key: `contract:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `CTR-${year}-${String(counter.value).padStart(6, "0")}`;
  }

  const existingContracts = await prisma.contract.count();
  if (existingContracts > 0) {
    console.log("→ Ya existen contratos; se omite la demo de contratos.");
    console.log("✔ Seed completado.");
    return;
  }

  console.log("→ Contratos demo…");

  // CASO 1 + 3: fecha cerrada San Andrés, reserva pendiente, pago parcial
  {
    const number = await nextNumber();
    const c = await prisma.contract.create({
      data: {
        number,
        clientId: clients["María González"],
        sellerId: sellers["Laura Restrepo"],
        modality: "fecha_cerrada",
        tripType: "nacional",
        destinationId: destinations["San Andrés"],
        hotelId: hotels["Decameron San Luis"],
        saleDate: d(-20),
        travelDate: d(35),
        returnDate: d(38),
        days: 4,
        nights: 3,
        priceAmount: 2_000_000n,
        currency: "COP",
        liquidationLeadDays: 30,
        commissionKind: "percentage",
        commissionValue: "10",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 2, children: 0, infants: 0, packs: 1 } },
        reservation: { create: { checkIn: d(35), checkOut: d(38), state: "pendiente_confirmacion" } },
        ledger: {
          create: {
            kind: "pago_recibido",
            valueDate: d(-18),
            receivedAmount: 500_000n,
            receivedCurrency: "COP",
            appliedAmount: 500_000n,
            appliedCurrency: "COP",
            reference: "ABC123",
            method: "transferencia",
            createdById: admin.id,
          },
        },
        commission: {
          create: { sellerId: sellers["Laura Restrepo"], expectedAmount: 200_000n, currency: "COP", accrual: "on_full_payment" },
        },
      },
    });
    console.log(`   ${c.number} — San Andrés (parcial, reserva pendiente)`);
  }

  // CASO 2: fecha cerrada Cartagena, reserva CONFIRMADA, pagada
  {
    const number = await nextNumber();
    await prisma.contract.create({
      data: {
        number,
        clientId: clients["Pedro Ramírez"],
        sellerId: sellers["Carlos Mejía"],
        modality: "fecha_cerrada",
        tripType: "nacional",
        destinationId: destinations["Cartagena"],
        hotelId: hotels["Hotel Las Américas"],
        saleDate: d(-45),
        travelDate: d(20),
        returnDate: d(24),
        days: 5,
        nights: 4,
        priceAmount: 3_200_000n,
        currency: "COP",
        liquidationLeadDays: 30,
        commissionKind: "percentage",
        commissionValue: "8",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 2, children: 1, infants: 0, packs: 1 } },
        reservation: {
          create: { checkIn: d(20), checkOut: d(24), state: "confirmada", confirmedAt: new Date(), confirmedBy: admin.id },
        },
        ledger: {
          create: [
            { kind: "pago_recibido", valueDate: d(-40), receivedAmount: 1_200_000n, receivedCurrency: "COP", appliedAmount: 1_200_000n, appliedCurrency: "COP", method: "transferencia", createdById: admin.id },
            { kind: "pago_recibido", valueDate: d(-10), receivedAmount: 2_000_000n, receivedCurrency: "COP", appliedAmount: 2_000_000n, appliedCurrency: "COP", method: "transferencia", createdById: admin.id },
          ],
        },
      },
    });
    console.log(`   ${number} — Cartagena (pagada, confirmada)`);
  }

  // CASO 5: internacional Punta Cana, límite de liquidación próximo, con cuotas
  {
    const number = await nextNumber();
    const travel = d(95);
    const c = await prisma.contract.create({
      data: {
        number,
        clientId: clients["Juliana Vélez"],
        sellerId: sellers["Laura Restrepo"],
        modality: "fecha_cerrada",
        tripType: "internacional",
        destinationId: destinations["Punta Cana"],
        hotelId: hotels["Riu Palace"],
        saleDate: d(-15),
        travelDate: travel,
        returnDate: d(102),
        days: 8,
        nights: 7,
        priceAmount: 950n * 100n, // 950.00 USD
        currency: "USD",
        liquidationLeadDays: 90,
        commissionKind: "percentage",
        commissionValue: "10",
        commissionCurrency: "USD",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 2, children: 0, infants: 0, packs: 1 } },
        reservation: { create: { checkIn: travel, checkOut: d(102), state: "confirmada", confirmedAt: new Date(), confirmedBy: admin.id } },
        installments: {
          create: [
            { sequence: 1, dueDate: d(-10), expectedAmount: 300_00n, currency: "USD" },
            { sequence: 2, dueDate: d(20), expectedAmount: 300_00n, currency: "USD" },
            { sequence: 3, dueDate: d(55), expectedAmount: 350_00n, currency: "USD" },
          ],
        },
      },
    });
    // pago cruzado: cliente paga en COP la primera cuota
    const firstInst = await prisma.installment.findFirst({ where: { contractId: c.id, sequence: 1 } });
    await prisma.ledgerEntry.create({
      data: {
        contractId: c.id,
        installmentId: firstInst!.id,
        kind: "pago_recibido",
        valueDate: d(-9),
        receivedAmount: 1_200_000n,
        receivedCurrency: "COP",
        appliedAmount: 300_00n,
        appliedCurrency: "USD",
        exchangeRate: "0.00025",
        exchangeRateDate: d(-9),
        exchangeRateSource: "manual",
        method: "transferencia",
        createdById: admin.id,
      },
    });
    console.log(`   ${number} — Punta Cana USD (cuotas, pago cruzado COP)`);
  }

  // CASO 6: fecha abierta Santa Marta, sin reserva, vigencia amplia
  {
    const number = await nextNumber();
    await prisma.contract.create({
      data: {
        number,
        clientId: clients["Familia Ochoa"],
        sellerId: sellers["Ana Torres"],
        modality: "fecha_abierta",
        tripType: "nacional",
        destinationId: destinations["Santa Marta"],
        hotelId: hotels["Hotel Zuana"],
        saleDate: d(-5),
        vigenciaStart: d(-5),
        vigenciaEnd: d(40),
        days: 4,
        nights: 3,
        priceAmount: 1_800_000n,
        currency: "COP",
        liquidationLeadDays: 30,
        commissionKind: "fixed",
        commissionValue: "150000",
        commissionCurrency: "COP",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 3, children: 2, infants: 1, packs: 2 } },
        ledger: {
          create: { kind: "pago_recibido", valueDate: d(-5), receivedAmount: 600_000n, receivedCurrency: "COP", appliedAmount: 600_000n, appliedCurrency: "COP", method: "efectivo", createdById: admin.id },
        },
      },
    });
    console.log(`   ${number} — Santa Marta (fecha abierta, vigencia por expirar)`);
  }

  // Contrato fuera de plazo: nacional, límite ya pasado, con saldo
  {
    const number = await nextNumber();
    await prisma.contract.create({
      data: {
        number,
        clientId: clients["Pedro Ramírez"],
        sellerId: sellers["Carlos Mejía"],
        modality: "fecha_cerrada",
        tripType: "nacional",
        destinationId: destinations["Coveñas"],
        saleDate: d(-60),
        travelDate: d(10),
        returnDate: d(13),
        days: 4,
        nights: 3,
        priceAmount: 2_400_000n,
        currency: "COP",
        liquidationLeadDays: 30, // límite = hoy-20 → fuera de plazo
        commissionKind: "percentage",
        commissionValue: "8",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 2, children: 0, infants: 0, packs: 1 } },
        reservation: { create: { checkIn: d(10), checkOut: d(13), state: "confirmada", confirmedAt: new Date(), confirmedBy: admin.id } },
        ledger: {
          create: { kind: "pago_recibido", valueDate: d(-55), receivedAmount: 900_000n, receivedCurrency: "COP", appliedAmount: 900_000n, appliedCurrency: "COP", method: "transferencia", createdById: admin.id },
        },
      },
    });
    console.log(`   ${number} — Coveñas (FUERA DE PLAZO con saldo)`);
  }

  // Liquidado con comisión retenida
  {
    const number = await nextNumber();
    await prisma.contract.create({
      data: {
        number,
        clientId: clients["María González"],
        sellerId: sellers["Ana Torres"],
        modality: "fecha_cerrada",
        tripType: "nacional",
        destinationId: destinations["Cartagena"],
        hotelId: hotels["Hotel Las Américas"],
        saleDate: d(-30),
        travelDate: d(50),
        returnDate: d(53),
        days: 4,
        nights: 3,
        priceAmount: 1_999_000n,
        currency: "COP",
        liquidationLeadDays: 30,
        commissionKind: "percentage",
        commissionValue: "10",
        lifecycleState: "activo",
        createdBy: admin.id,
        passengers: { create: { adults: 2 } },
        reservation: { create: { checkIn: d(50), checkOut: d(53), state: "confirmada", confirmedAt: new Date(), confirmedBy: admin.id } },
        ledger: {
          create: [
            { kind: "pago_recibido", valueDate: d(-25), receivedAmount: 1_799_100n, receivedCurrency: "COP", appliedAmount: 1_799_100n, appliedCurrency: "COP", method: "transferencia", createdById: admin.id },
            { kind: "comision_retenida", valueDate: d(-25), receivedAmount: 199_900n, receivedCurrency: "COP", appliedAmount: 199_900n, appliedCurrency: "COP", reason: "El saldo restante corresponde a la comisión del vendedor (Ana Torres).", createdById: admin.id },
          ],
        },
      },
    });
    console.log(`   ${number} — Cartagena (LIQUIDADO con comisión retenida)`);
  }

  // CASO 7: cupo anticipado comprado por vendedor, sin cliente aún
  {
    const inv = await prisma.pendingInventory.create({
      data: {
        sellerId: sellers["Laura Restrepo"],
        purchaseDate: d(-10),
        destinationId: destinations["San Andrés"],
        hotelId: hotels["Decameron San Luis"],
        travelDate: d(25),
        seats: 4,
        amount: 6_000_000n,
        currency: "COP",
        reference: "CUPO-SAI-2026-07",
        state: "disponible",
        createdBy: admin.id,
        payments: {
          create: { valueDate: d(-10), amount: 6_000_000n, currency: "COP", method: "transferencia", createdBy: admin.id },
        },
      },
    });
    console.log(`   Cupo ${inv.reference} — San Andrés x4 (disponible)`);
  }

  console.log("✔ Seed completado.");
  console.log("   Admin:   admin@agencia.com / admin1234");
  console.log("   Usuario: usuario@agencia.com / usuario1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
