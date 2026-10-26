"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import {
  addInventoryPayment,
  archiveInventory,
  assignInventory,
  createInventory,
  reverseAssignment,
  updateInventory,
} from "@/modules/inventory/service";

function reval(id?: string) {
  revalidatePath("/cupos");
  if (id) revalidatePath(`/cupos/${id}`);
  revalidatePath("/");
}

export async function createInventoryAction(_prev: unknown, fd: FormData) {
  const res = await runAction((user) => createInventory(user, formToObject(fd)));
  if (res.ok) reval();
  return res;
}

export async function updateInventoryAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("id"));
  const res = await runAction((user) => updateInventory(user, id, formToObject(fd)));
  if (res.ok) reval(id);
  return res;
}

export async function addInventoryPaymentAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("pendingInventoryId"));
  const res = await runAction((user) => addInventoryPayment(user, formToObject(fd)));
  if (res.ok) reval(id);
  return res;
}

export async function assignInventoryAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("pendingInventoryId"));
  const res = await runAction((user) => assignInventory(user, formToObject(fd)));
  if (res.ok) {
    reval(id);
    revalidatePath(`/contratos/${String(fd.get("contractId"))}`);
  }
  return res;
}

export async function reverseAssignmentAction(_prev: unknown, fd: FormData) {
  const id = String(fd.get("pendingInventoryId"));
  const res = await runAction((user) => reverseAssignment(user, formToObject(fd)));
  if (res.ok) reval(id);
  return res;
}

export async function archiveInventoryAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveInventory(user, id, archived));
  if (res.ok) reval(id);
  return res;
}
