"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import { ValidationError } from "@/core/errors";
import {
  addRefundAttachment,
  archiveRefund,
  createRefund,
  registerRefundPayment,
  setRefundState,
  updateRefund,
  voidRefundPayment,
} from "@/modules/refunds/service";

function takeFile(fd: FormData, key: string): { file: File | null; payload: Record<string, unknown> } {
  const f = fd.get(key);
  const payload = formToObject(fd);
  delete payload[key];
  return { file: f instanceof File && f.size > 0 ? f : null, payload };
}

function refresh(id?: string, contractId?: unknown) {
  revalidatePath("/reembolsos");
  if (id) revalidatePath(`/reembolsos/${id}`);
  if (typeof contractId === "string" && contractId) revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/");
}

export async function createRefundAction(_prev: unknown, fd: FormData) {
  const { file, payload } = takeFile(fd, "attachment");
  const res = await runAction((user) => createRefund(user, payload, file));
  if (res.ok) refresh(res.data.id, payload.contractId);
  return res;
}

export async function updateRefundAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("id"));
  const payload = formToObject(fd);
  delete payload.id;
  const res = await runAction((user) => updateRefund(user, id, payload));
  if (res.ok) refresh(id, payload.contractId);
  return res;
}

export async function setRefundStateAction(_prev: unknown, fd: FormData) {
  const payload = formToObject(fd);
  const res = await runAction((user) => setRefundState(user, payload));
  if (res.ok) refresh(String(payload.refundId));
  return res;
}

export async function registerRefundPaymentAction(_prev: unknown, fd: FormData) {
  const { file, payload } = takeFile(fd, "receipt");
  const res = await runAction((user) => registerRefundPayment(user, payload, file));
  if (res.ok) {
    refresh(String(payload.refundId), payload.contractId);
    revalidatePath("/pagos");
  }
  return res;
}

export async function voidRefundPaymentAction(_prev: unknown, fd: FormData) {
  const payload = formToObject(fd);
  const res = await runAction((user) => voidRefundPayment(user, payload));
  if (res.ok) {
    refresh(String(fd.get("refundId")), payload.contractId);
    revalidatePath("/pagos");
  }
  return res;
}

export async function archiveRefundAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveRefund(user, id, archived));
  if (res.ok) refresh(id);
  return res;
}

export async function addRefundAttachmentAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("refundId"));
  const f = fd.get("file");
  const res = await runAction(async (user) => {
    if (!(f instanceof File) || f.size === 0) throw new ValidationError("Elige un archivo");
    return addRefundAttachment(user, id, f);
  });
  if (res.ok) refresh(id);
  return res;
}
