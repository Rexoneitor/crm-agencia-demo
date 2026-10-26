"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import {
  archiveGroup,
  createGroup,
  registerGroupPayment,
  setContractGroup,
} from "@/modules/groups/service";

export async function createGroupAction(_prev: unknown, fd: FormData) {
  const res = await runAction((user) => createGroup(user, formToObject(fd)));
  if (res.ok) revalidatePath("/grupos");
  return res;
}

export async function archiveGroupAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveGroup(user, id, archived));
  if (res.ok) {
    revalidatePath("/grupos");
    revalidatePath(`/grupos/${id}`);
  }
  return res;
}

export async function addContractToGroupAction(groupId: string, contractId: string) {
  const res = await runAction((user) => setContractGroup(user, contractId, groupId));
  if (res.ok) {
    revalidatePath(`/grupos/${groupId}`);
    revalidatePath("/contratos");
  }
  return res;
}

export async function removeContractFromGroupAction(groupId: string, contractId: string) {
  const res = await runAction((user) => setContractGroup(user, contractId, null));
  if (res.ok) {
    revalidatePath(`/grupos/${groupId}`);
    revalidatePath("/contratos");
  }
  return res;
}

export async function registerGroupPaymentAction(_prev: unknown, fd: FormData) {
  const groupId = String(fd.get("groupId"));
  const receiptFile = fd.get("receipt");
  const payload = formToObject(fd);
  delete payload.receipt;
  const res = await runAction((user) =>
    registerGroupPayment(user, payload, receiptFile instanceof File ? receiptFile : null),
  );
  if (res.ok) {
    revalidatePath(`/grupos/${groupId}`);
    revalidatePath("/contratos");
    revalidatePath("/pagos");
  }
  return res;
}
