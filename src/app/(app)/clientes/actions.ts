"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import {
  archiveClient,
  createClient,
  updateClient,
} from "@/modules/clients/service";

export async function saveClientAction(_prev: unknown, fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const payload = formToObject(fd);
  const res = await runAction((user) =>
    id ? updateClient(user, id, payload) : createClient(user, payload),
  );
  if (res.ok) {
    revalidatePath("/clientes");
    if (id) revalidatePath(`/clientes/${id}`);
  }
  return res;
}

export async function archiveClientAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveClient(user, id, archived));
  if (res.ok) revalidatePath("/clientes");
  return res;
}
