"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/core/forms";
import { attachReceipt } from "@/modules/payments/service";
import { quickRegisterPayment, searchContractsForReceipt } from "@/modules/payments/quick";

export async function searchReceiptContractsAction(q: string) {
  return runAction(() => searchContractsForReceipt(q));
}

function reval(contractId: string) {
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/pagos");
  revalidatePath("/contratos");
}

/** Pago nuevo con su captura (y la parte que retuvo el vendedor). */
export async function quickPayAction(fd: FormData) {
  const contractId = String(fd.get("contractId") ?? "");
  const file = fd.get("receipt");
  const res = await runAction((user) =>
    quickRegisterPayment(
      user,
      {
        contractId,
        valueDate: String(fd.get("valueDate") ?? ""),
        atsMajor: Number(fd.get("atsMajor") || 0),
        sellerMajor: Number(fd.get("sellerMajor") || 0),
        method: String(fd.get("method") ?? "") || undefined,
        reference: String(fd.get("reference") ?? ""),
        sellerId: String(fd.get("sellerId") ?? "") || undefined,
      },
      file instanceof File ? file : null,
    ),
  );
  if (res.ok) reval(contractId);
  return res;
}

/** Adjunta la captura a un pago que ya estaba cargado sin comprobante. */
export async function quickAttachAction(fd: FormData) {
  const contractId = String(fd.get("contractId") ?? "");
  const file = fd.get("receipt");
  const res = await runAction((user) =>
    attachReceipt(user, String(fd.get("entryId")), file instanceof File ? file : (null as unknown as File)),
  );
  if (res.ok) reval(contractId);
  return res;
}
