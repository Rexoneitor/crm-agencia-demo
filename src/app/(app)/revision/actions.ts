"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/core/forms";
import { markTraveled } from "@/modules/contracts/service";
import { confirmReservation } from "@/modules/reservations/service";
import { addNote } from "@/modules/notes/service";
import { voidEntry } from "@/modules/payments/service";
import { createRefund } from "@/modules/refunds/service";
import { reviewSetDates, reviewSetSeller } from "@/modules/review/service";

function reval(id: string) {
  revalidatePath("/revision");
  revalidatePath(`/contratos/${id}`);
  revalidatePath("/calendario");
}

async function done<T>(id: string, p: Promise<{ ok: boolean } & T>) {
  const res = await p;
  if (res.ok) reval(id);
  return res;
}

export async function reviewSellerAction(id: string, sellerId: string) {
  return done(id, runAction((u) => reviewSetSeller(u, id, sellerId)));
}

export async function reviewConfirmAction(id: string) {
  return done(id, runAction((u) => confirmReservation(u, id, true)));
}

export async function reviewDatesAction(id: string, checkIn: string, checkOut: string) {
  return done(id, runAction((u) => reviewSetDates(u, id, checkIn, checkOut)));
}

export async function reviewTraveledAction(id: string) {
  return done(id, runAction((u) => markTraveled(u, id, true)));
}

export async function reviewNoteAction(id: string, content: string) {
  return done(id, runAction((u) => addNote(u, { entityType: "contract", entityId: id, content })));
}

/** Registra una solicitud de reembolso para el contrato (se completa luego en «Reembolsos»). */
export async function reviewRefundAction(
  id: string,
  input: { clientName: string; channel: string; reason: string; requestedMajor?: string },
) {
  return done(
    id,
    runAction((u) =>
      createRefund(u, {
        contractId: id,
        clientName: input.clientName,
        requestedAt: new Date().toLocaleDateString("en-CA"),
        channel: input.channel,
        reasonCode: "desistimiento_cliente",
        reason: input.reason,
        requestedMajor: input.requestedMajor ?? "",
      }),
    ),
  );
}

export async function reviewVoidAction(id: string, entryId: string, reason: string) {
  const res = await done(id, runAction((u) => voidEntry(u, { entryId, reason })));
  if (res.ok) revalidatePath("/pagos");
  return res;
}
