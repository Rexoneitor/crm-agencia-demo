import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import { normalizeSearch } from "@/modules/search/service";
import { env } from "@/config/env";
import { systemClock } from "@/core/time/clock";
import { deriveContract, rulesConfigFromSettings } from "@/core/domain/rules";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "./view";
import { formatMoney, money } from "@/core/money/money";

export interface ContractListFilters {
  q?: string;
  modality?: string;
  tripType?: string;
  destinationId?: string;
  sellerId?: string;
  lifecycleState?: string;
  paymentState?: string;
  /** "DEMO" = solo DEMO, "otra" = de otras empresas */
  issuer?: string;
  archived?: boolean;
}

export interface ContractListRow {
  id: string;
  number: string;
  client: string;
  destination: string;
  color: string;
  seller: string | null;
  issuer: string;
  modality: string;
  tripType: string;
  travelDate: string | null;
  vigenciaEnd: string | null;
  lifecycleState: string;
  reservationState: string | null;
  paymentState: string;
  price: string;
  balance: string;
  liquidationDueDate: string | null;
  isOverdue: boolean;
  vigenciaExpiring: boolean;
  group: { id: string; name: string } | null;
}

export interface ContractListPage {
  rows: ContractListRow[];
  /** Total de contratos que cumplen los filtros (no solo los de esta página). */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista paginada de contratos. Antes se mostraban solo los 200 más recientes sin avisar
 * (con 377 contratos, los más viejos «desaparecían») y el filtro por estado de pago se
 * aplicaba DESPUÉS de cortar en 200, así que podía faltar alguno.
 */
export async function listContracts(
  filters: ContractListFilters = {},
  paging: { page?: number; pageSize?: number } = {},
): Promise<ContractListPage> {
  const pageSize = Math.min(500, Math.max(10, paging.pageSize ?? 100));
  const page = Math.max(1, Math.floor(paging.page ?? 1));
  const q = filters.q?.trim();

  // Búsqueda sin tildes ni mayúsculas, palabras en cualquier orden (como el buscador global).
  let idsByText: string[] | null = null;
  if (q) {
    const words = normalizeSearch(q).split(" ").filter(Boolean);
    const qDigits = q.replace(/\D/g, "");
    const light = await prisma.contract.findMany({
      select: { id: true, number: true, client: { select: { fullName: true, documentId: true, phone: true } } },
    });
    idsByText = light
      .filter((c) => {
        const hay = normalizeSearch(`${c.number} ${c.client.fullName}`);
        if (words.every((w) => hay.includes(w))) return true;
        const nums = [c.client.documentId, c.client.phone].map((x) => (x ?? "").replace(/\D/g, ""));
        return qDigits.length >= 4 && nums.some((n) => n.includes(qDigits));
      })
      .map((c) => c.id);
  }

  // Con AND: antes «archivados» y «otra empresa» usaban la misma llave NOT y uno anulaba al otro.
  const and: Prisma.ContractWhereInput[] = [
    filters.archived ? { NOT: { archivedAt: null } } : { archivedAt: null },
    ...(filters.issuer === "DEMO" ? [{ issuer: "DEMO" }] : filters.issuer === "otra" ? [{ NOT: { issuer: "DEMO" } }] : []),
  ];
  const where: Prisma.ContractWhereInput = {
    AND: and,
    ...(filters.modality ? { modality: filters.modality } : {}),
    ...(filters.tripType ? { tripType: filters.tripType } : {}),
    ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
    ...(filters.sellerId === "none" ? { sellerId: null } : filters.sellerId ? { sellerId: filters.sellerId } : {}),
    ...(filters.lifecycleState ? { lifecycleState: filters.lifecycleState } : {}),
    ...(idsByText ? { id: { in: idsByText } } : {}),
  };

  const include = {
      ...contractViewInclude,
      client: { select: { fullName: true } },
      destination: { select: { name: true, color: true } },
      seller: { select: { name: true } },
      group: { select: { id: true, name: true } },
  } satisfies Prisma.ContractInclude;

  const config = rulesConfigFromSettings(await getSettingsMap());
  const clock = systemClock(env.APP_TIMEZONE);
  type Row = Prisma.ContractGetPayload<{ include: typeof include }>;
  const toRow = (c: Row): ContractListRow => {
      const d = deriveContract(toContractView(c), config, clock);
      return {
        id: c.id,
        number: c.number,
        client: c.client.fullName,
        destination: c.destination.name,
        color: c.destination.color,
        seller: c.seller?.name ?? null,
        issuer: c.issuer,
        modality: c.modality,
        tripType: c.tripType,
        travelDate: c.travelDate,
        vigenciaEnd: c.vigenciaEnd,
        lifecycleState: c.lifecycleState,
        reservationState: c.reservation?.state ?? null,
        paymentState: d.paymentState,
        price: formatMoney(money(c.priceAmount, c.currency), { withCode: true }),
        balance: formatMoney(d.balance, { withCode: true }),
        liquidationDueDate: d.liquidationDueDate,
        isOverdue: d.isOverdueForLiquidation,
        vigenciaExpiring: d.vigenciaExpiring,
        group: c.group ? { id: c.group.id, name: c.group.name } : null,
      };
  };

  if (filters.paymentState) {
    // El estado de pago es calculado: hay que derivar todos y luego paginar.
    const all = await prisma.contract.findMany({ where, include, orderBy: { createdAt: "desc" } });
    const rows = all.map(toRow).filter((r) => r.paymentState === filters.paymentState);
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }

  const [total, rows] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { rows: rows.map(toRow), total, page, pageSize };
}
