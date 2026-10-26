import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import { env } from "@/config/env";
import { systemClock, type Clock } from "@/core/time/clock";
import { assertCan, type SessionUser } from "@/core/auth";
import { writeAudit } from "@/core/audit/audit";
import { NotFoundError, ValidationError } from "@/core/errors";
import { deriveContract, rulesConfigFromSettings, type RulesConfig } from "@/core/domain/rules";
import { fromMajor, toMajorNumber } from "@/core/money/money";
import { getSettingsMap } from "@/modules/settings/service";
import { toContractView, contractViewInclude } from "@/modules/contracts/view";
import { registerPayment } from "./service";

/**
 * «Subir comprobante»: pantalla rápida para cargar capturas de pago una tras otra.
 * Busca el contrato por nombre, muestra lo que debe y registra el pago (con la parte
 * que retuvo el vendedor) o adjunta la captura a un pago que no tenía comprobante.
 */

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export interface QuickContract {
  id: string;
  number: string;
  client: string;
  destination: string;
  travelDate: string | null;
  lifecycleState: string;
  issuer: string;
  seller: { id: string; name: string; retainsCommission: boolean } | null;
  currency: string;
  price: number;
  received: number;
  retained: number;
  balance: number;
  /**
   * Pagos recibidos y comisiones retenidas vigentes. De aquí salen (en el navegador) los
   * pagos sin comprobante, los posibles duplicados y la lista para anular uno errado.
   * Se envía una sola lista para no repetir datos (la «Revisión rápida» trae cientos).
   */
  entries: { id: string; kind: string; valueDate: string; amount: number; hasReceipt: boolean }[];
}

/** Include que necesita `toQuickContract`. */
export const quickInclude = {
  ...contractViewInclude,
  client: { select: { fullName: true } },
  destination: { select: { name: true } },
  seller: { select: { id: true, name: true, retainsCommission: true } },
  ledger: { include: { receipts: { select: { id: true } } } },
} as const;

type QuickRow = Prisma.ContractGetPayload<{ include: typeof quickInclude }>;

export function toQuickContract(c: QuickRow, config: RulesConfig, clock: Clock): QuickContract {
  const d = deriveContract(toContractView(c), config, clock);
  const live = c.ledger.filter((e) => !e.voided);
  const sum = (kind: string) => live.filter((e) => e.kind === kind).reduce((a, e) => a + e.appliedAmount, 0n);
  const major = (n: bigint) => toMajorNumber({ amount: n, currency: c.currency });
  return {
    id: c.id,
    number: c.number,
    client: c.client.fullName,
    destination: c.destination.name,
    travelDate: c.reservation?.checkIn ?? c.travelDate,
    lifecycleState: c.lifecycleState,
    issuer: c.issuer,
    seller: c.seller,
    currency: c.currency,
    price: major(c.priceAmount),
    received: major(sum("pago_recibido")),
    retained: major(sum("comision_retenida")),
    balance: toMajorNumber(d.balance),
    entries: live
      .filter((e) => e.kind === "pago_recibido" || e.kind === "comision_retenida")
      .map((e) => ({ id: e.id, kind: e.kind, valueDate: e.valueDate, amount: major(e.appliedAmount), hasReceipt: e.receipts.length > 0 })),
  };
}

export async function searchContractsForReceipt(q: string): Promise<QuickContract[]> {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  // 1) Lista liviana (número + nombre) para filtrar sin tildes; 2) datos completos solo de los
  // 15 que coinciden. Antes se traía el libro de pagos de TODOS los contratos en cada tecla.
  const light = await prisma.contract.findMany({
    where: { archivedAt: null },
    select: { id: true, number: true, client: { select: { fullName: true } } },
  });
  const ids = light
    .filter((c) => {
      const hay = norm(`${c.client.fullName} ${c.number}`);
      return words.every((w) => hay.includes(w));
    })
    .slice(0, 15)
    .map((c) => c.id);
  if (!ids.length) return [];
  const [rows, settings] = await Promise.all([
    prisma.contract.findMany({ where: { id: { in: ids } }, include: quickInclude }),
    getSettingsMap(),
  ]);
  const config = rulesConfigFromSettings(settings);
  const clock = systemClock(env.APP_TIMEZONE);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [toQuickContract(c, config, clock)] : [];
  });
}

/**
 * Registra un pago: `atsMajor` es lo que ENTRÓ a la agencia (lo que muestra la captura) y
 * `sellerMajor` lo que se quedó el vendedor aparte (comisión retenida). El cliente pagó la suma.
 * Si el contrato no tiene vendedor y llega `sellerId`, se le asigna.
 */
export async function quickRegisterPayment(
  user: SessionUser,
  input: {
    contractId: string;
    valueDate: string;
    atsMajor: number;
    sellerMajor: number;
    method?: string;
    reference?: string;
    sellerId?: string;
  },
  file: File | null,
) {
  assertCan(user, "payment.register");
  const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw new NotFoundError("contrato");
  const ats = Number(input.atsMajor);
  const sellerPart = Number(input.sellerMajor || 0);
  if (!(ats > 0)) throw new ValidationError("Escribe cuánto entró a la agencia", { atsMajor: ["Obligatorio"] });
  if (sellerPart < 0) throw new ValidationError("La parte del vendedor no puede ser negativa", { sellerMajor: ["Revisa el monto"] });

  if (input.sellerId && !contract.sellerId) {
    await prisma.contract.update({
      where: { id: contract.id },
      data: { sellerId: input.sellerId, version: { increment: 1 } },
    });
    await writeAudit(prisma, {
      entityType: "contract",
      entityId: contract.id,
      action: "update",
      userId: user.id,
      summary: "Vendedor asignado desde «Subir comprobante».",
    });
  }

  const entry = await registerPayment(
    user,
    {
      contractId: contract.id,
      valueDate: input.valueDate,
      receivedMajor: ats,
      receivedCurrency: contract.currency,
      method: input.method || undefined,
      reference: input.reference || "",
      notes: sellerPart > 0 ? `Entró a la agencia ${ats}; el vendedor retuvo ${sellerPart} (el cliente pagó ${ats + sellerPart}).` : "",
    },
    file && file.size > 0 ? file : null,
  );

  if (sellerPart > 0) {
    const m = fromMajor(sellerPart, contract.currency);
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          contractId: contract.id,
          kind: "comision_retenida",
          valueDate: input.valueDate,
          receivedAmount: m.amount,
          receivedCurrency: contract.currency,
          appliedAmount: m.amount,
          appliedCurrency: contract.currency,
          reason: "El vendedor retuvo su comisión (cargado desde «Subir comprobante»).",
          createdById: user.id,
        },
      });
      await writeAudit(tx, {
        entityType: "contract",
        entityId: contract.id,
        action: "payment",
        userId: user.id,
        summary: `Comisión retenida por el vendedor: ${sellerPart}`,
      });
    });
  }
  return entry;
}
