import "server-only";
import { prisma } from "@/core/db/prisma";
import { label } from "@/core/domain/enums";
import { sortEs } from "@/core/sort";
import { normalizeSearch } from "@/core/text";

export interface SearchHit {
  type: "cliente" | "contrato" | "vendedor" | "destino";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export { normalizeSearch };

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * ¿El texto `hay` contiene todas las palabras de la búsqueda? (en cualquier orden).
 * Si la búsqueda trae números (cédula, teléfono), también compara solo los dígitos.
 */
function matcher(query: string) {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  const qDigits = digits(query);
  return (text: string, numbers: (string | null | undefined)[] = []) => {
    const hay = normalizeSearch(text);
    if (words.length && words.every((w) => hay.includes(w))) return true;
    return qDigits.length >= 4 && numbers.some((n) => digits(n).includes(qDigits));
  };
}

/**
 * Buscador global (prompt §37): cliente, contrato, referencia de pago, vendedor, destino.
 * No distingue tildes ni mayúsculas («jose pena» encuentra a «José Peña») y las
 * palabras pueden ir en cualquier orden. Las listas son pequeñas (cientos de filas),
 * así que se filtran en memoria con columnas mínimas: más rápido que varias
 * consultas `LIKE` y sin depender de cómo SQLite compara las tildes.
 */
export async function globalSearch(query: string, limits = { contracts: 8, clients: 8, others: 5 }): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const match = matcher(q);

  const [contracts, clients, sellers, destinations, byReference] = await Promise.all([
    prisma.contract.findMany({
      where: { archivedAt: null },
      // Solo lo necesario para filtrar; los detalles se piden después para los pocos que coinciden.
      select: { id: true, number: true, client: { select: { fullName: true, documentId: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({
      where: { archivedAt: null },
      select: { id: true, fullName: true, documentId: true, phone: true, email: true },
    }),
    prisma.seller.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    prisma.destination.findMany({ where: { archivedAt: null }, select: { id: true, name: true, scope: true } }),
    // Referencia de un pago (número de transacción): coincidencia exacta de texto en la BD.
    q.length >= 4
      ? prisma.ledgerEntry.findMany({
          where: { reference: { contains: q, mode: "insensitive" }, contract: { archivedAt: null } },
          select: { contractId: true },
          take: 20,
        })
      : Promise.resolve([] as { contractId: string }[]),
  ]);

  const refIds = new Set(byReference.map((r) => r.contractId));
  const contractHits = contracts
    .filter(
      (c) =>
        refIds.has(c.id) ||
        match(`${c.number} ${c.client.fullName}`, [c.number, c.client.documentId, c.client.phone]),
    )
    .slice(0, limits.contracts);
  const details = contractHits.length
    ? await prisma.contract.findMany({
        where: { id: { in: contractHits.map((c) => c.id) } },
        select: { id: true, travelDate: true, lifecycleState: true, destination: { select: { name: true } }, reservation: { select: { checkIn: true } } },
      })
    : [];
  const detailById = new Map(details.map((d) => [d.id, d]));

  const clientHits = sortEs(clients, (c) => c.fullName)
    .filter((c) => match(`${c.fullName} ${c.email ?? ""}`, [c.documentId, c.phone]))
    .slice(0, limits.clients);

  return [
    ...contractHits.map((c): SearchHit => {
      const d = detailById.get(c.id);
      const date = d?.reservation?.checkIn ?? d?.travelDate;
      return {
        type: "contrato",
        id: c.id,
        title: `${c.number} · ${c.client.fullName}`,
        subtitle: [d?.destination.name, date ? `viaja ${date}` : null, d && d.lifecycleState !== "activo" ? label(d.lifecycleState) : null]
          .filter(Boolean)
          .join(" · "),
        href: `/contratos/${c.id}`,
      };
    }),
    ...clientHits.map((c): SearchHit => ({
      type: "cliente",
      id: c.id,
      title: c.fullName,
      subtitle: [c.documentId, c.phone].filter(Boolean).join(" · ") || "Cliente",
      href: `/clientes/${c.id}`,
    })),
    ...sellers
      .filter((s) => match(s.name))
      .slice(0, limits.others)
      .map((s): SearchHit => ({ type: "vendedor", id: s.id, title: s.name, subtitle: "Vendedor", href: `/contratos?vendedor=${s.id}` })),
    ...destinations
      .filter((d) => match(d.name))
      .slice(0, limits.others)
      .map((d): SearchHit => ({
        type: "destino",
        id: d.id,
        title: d.name,
        subtitle: d.scope === "internacional" ? "Destino internacional" : "Destino nacional",
        href: `/calendario?destino=${d.id}`,
      })),
  ];
}
