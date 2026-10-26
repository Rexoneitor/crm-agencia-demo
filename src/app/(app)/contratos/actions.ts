"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, runAction } from "@/core/forms";
import { fail } from "@/core/errors";
import { getCurrentUser } from "@/core/auth";
import {
  archiveContract,
  markTraveled,
  cancelContract,
  createContract,
  deleteContract,
  duplicateContract,
  resolveException,
  scheduleTrip,
  transferContract,
  updateContract,
} from "@/modules/contracts/service";
import {
  confirmReservation,
  rescheduleReservation,
} from "@/modules/reservations/service";
import { addNote, archiveNote, updateNote } from "@/modules/notes/service";
import {
  archiveDocument,
  uploadDocument,
} from "@/modules/documents/service";
import type { DocumentKind } from "@/core/domain/enums";
import {
  addAdjustment,
  attachReceipt,
  deleteEntry,
  markLiquidated,
  registerPayment,
  setInstallmentPlan,
  settleCommission,
  updateEntry,
  voidEntry,
} from "@/modules/payments/service";

export async function createContractAction(_prev: unknown, fd: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Sesión expirada." };
  const pdf = fd.get("pdf");
  const payload = formToObject(fd);
  delete payload.pdf;
  let result;
  try {
    result = await createContract(user, payload, pdf instanceof File ? pdf : null);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/contratos");
  redirect(`/contratos/${result.id}`);
}

export async function updateContractAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("id"));
  const version = Number(fd.get("version") ?? 0);
  const payload = formToObject(fd);
  const res = await runAction((user) => updateContract(user, id, payload, version));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/contratos");
    revalidatePath("/calendario");
  }
  return res;
}

export async function transferContractAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("id"));
  const newClientId = String(fd.get("newClientId") ?? "");
  const newClientName = String(fd.get("newClientNew") ?? "");
  const res = await runAction((user) =>
    transferContract(user, id, { newClientId, newClientName }),
  );
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/contratos");
    revalidatePath("/clientes");
  }
  return res;
}

export async function updateNoteAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("id"));
  const entityId = String(fd.get("entityId") ?? "");
  const res = await runAction((user) => updateNote(user, id, formToObject(fd)));
  if (res.ok && entityId) revalidatePath(`/contratos/${entityId}`);
  return res;
}

export async function duplicateContractAction(_prev: unknown, fd: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Sesión expirada." };
  const id = String(fd.get("id"));
  const clientId = String(fd.get("newClientId") ?? "");
  const clientNew = String(fd.get("newClientNew") ?? "");
  const keepGroup = fd.get("keepGroup") === "on";
  let result;
  try {
    result = await duplicateContract(user, id, { clientId, clientNew, keepGroup });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/contratos");
  revalidatePath("/grupos");
  redirect(`/contratos/${result.id}`);
}

export async function scheduleTripAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => scheduleTrip(user, id, formToObject(fd)));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/calendario");
  }
  return res;
}

export async function confirmReservationAction(contractId: string, confirm: boolean) {
  const res = await runAction((user) => confirmReservation(user, contractId, confirm));
  if (res.ok) {
    revalidatePath(`/contratos/${contractId}`);
    revalidatePath("/calendario");
  }
  return res;
}

export async function rescheduleReservationAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => rescheduleReservation(user, id, formToObject(fd)));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/calendario");
  }
  return res;
}

export async function cancelContractAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => cancelContract(user, id, formToObject(fd)));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/calendario");
    revalidatePath("/contratos");
  }
  return res;
}

export async function resolveExceptionAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => resolveException(user, id, formToObject(fd)));
  if (res.ok) revalidatePath(`/contratos/${id}`);
  return res;
}

export async function markTraveledAction(id: string, traveled: boolean) {
  const res = await runAction((user) => markTraveled(user, id, traveled));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/contratos");
    revalidatePath("/calendario");
    revalidatePath("/");
  }
  return res;
}

export async function archiveContractAction(id: string, archived: boolean, reason?: string) {
  const res = await runAction((user) => archiveContract(user, id, archived, reason));
  if (res.ok) {
    revalidatePath(`/contratos/${id}`);
    revalidatePath("/contratos");
    revalidatePath("/calendario");
    revalidatePath("/");
  }
  return res;
}

export async function deleteContractAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const confirmNumber = String(fd.get("confirmNumber") ?? "");
  const res = await runAction((user) => deleteContract(user, id, { confirmNumber }));
  if (res.ok) {
    revalidatePath("/contratos");
    revalidatePath("/calendario");
    revalidatePath("/pagos");
    revalidatePath("/");
    redirect("/contratos");
  }
  return res;
}

export async function uploadDocAction(_prev: unknown, fd: FormData) {
  const entityId = String(fd.get("entityId"));
  const entityType = String(fd.get("entityType") || "contract");
  const file = fd.get("file");
  const kind = String(fd.get("kind") || "otro") as DocumentKind;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Selecciona un archivo." };
  }
  const res = await runAction((user) =>
    uploadDocument(user, { file, kind, entityType, entityId }),
  );
  if (res.ok) {
    revalidatePath(`/contratos/${entityId}`);
    revalidatePath(`/clientes/${entityId}`);
  }
  return res;
}

export async function archiveDocAction(id: string, contractId: string) {
  const res = await runAction((user) => archiveDocument(user, id));
  if (res.ok) revalidatePath(`/contratos/${contractId}`);
  return res;
}

export async function archiveNoteAction(id: string, entityId: string) {
  const res = await runAction((user) => archiveNote(user, id));
  if (res.ok) {
    revalidatePath(`/contratos/${entityId}`);
    revalidatePath(`/clientes/${entityId}`);
  }
  return res;
}

function revalContract(id: string) {
  revalidatePath(`/contratos/${id}`);
  revalidatePath("/contratos");
  revalidatePath("/pagos");
  revalidatePath("/");
}

export async function registerPaymentAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const receipt = fd.get("receipt");
  const payload = formToObject(fd);
  delete payload.receipt;
  const res = await runAction((user) =>
    registerPayment(user, payload, receipt instanceof File ? receipt : null),
  );
  if (res.ok) revalContract(id);
  return res;
}

export async function voidEntryAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => voidEntry(user, formToObject(fd)));
  if (res.ok) revalContract(id);
  return res;
}

export async function deleteEntryAction(contractId: string, entryId: string) {
  const res = await runAction((user) => deleteEntry(user, { entryId }));
  if (res.ok) {
    revalContract(contractId);
    revalidatePath("/pagos");
  }
  return res;
}

export async function updateEntryAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const receipt = fd.get("receipt");
  const payload = formToObject(fd);
  delete payload.receipt;
  const res = await runAction(async (user) => {
    const r = await updateEntry(user, payload);
    if (receipt instanceof File && receipt.size > 0) await attachReceipt(user, String(payload.entryId), receipt);
    return r;
  });
  if (res.ok) {
    revalContract(id);
    revalidatePath("/pagos");
  }
  return res;
}

export async function attachReceiptAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const file = fd.get("receipt");
  const res = await runAction((user) =>
    attachReceipt(user, String(fd.get("entryId")), file instanceof File ? file : (null as unknown as File)),
  );
  if (res.ok) revalContract(id);
  return res;
}

export async function markLiquidatedAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => markLiquidated(user, formToObject(fd)));
  if (res.ok) revalContract(id);
  return res;
}

export async function addAdjustmentAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => addAdjustment(user, formToObject(fd)));
  if (res.ok) revalContract(id);
  return res;
}

export async function setInstallmentPlanAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const rows: { dueDate: string; amountMajor: string }[] = [];
  const dueDates = fd.getAll("dueDate").map(String);
  const amounts = fd.getAll("amountMajor").map(String);
  for (let i = 0; i < dueDates.length; i++) {
    if (dueDates[i] && amounts[i]) rows.push({ dueDate: dueDates[i], amountMajor: amounts[i] });
  }
  const res = await runAction((user) => setInstallmentPlan(user, { contractId: id, rows }));
  if (res.ok) revalContract(id);
  return res;
}

export async function settleCommissionAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("contractId"));
  const res = await runAction((user) => settleCommission(user, formToObject(fd)));
  if (res.ok) revalContract(id);
  return res;
}

export async function addNoteAction(_prev: unknown, fd: FormData) {
  const entityType = String(fd.get("entityType"));
  const entityId = String(fd.get("entityId"));
  const res = await runAction((user) =>
    addNote(user, {
      entityType,
      entityId,
      content: String(fd.get("content") ?? ""),
      pinned: fd.get("pinned") === "on",
      priority: fd.get("priority") === "alta" ? "alta" : "normal",
    }),
  );
  if (res.ok) {
    revalidatePath(`/contratos/${entityId}`);
    revalidatePath(`/clientes/${entityId}`);
  }
  return res;
}
