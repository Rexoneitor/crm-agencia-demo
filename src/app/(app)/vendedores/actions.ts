"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import { archiveSeller, createSeller, updateSeller } from "@/modules/sellers/service";

export async function saveSellerAction(_prev: unknown, fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const payload = formToObject(fd);
  payload.active = fd.get("active") === "on" || fd.get("active") === "true";
  const res = await runAction((user) =>
    id ? updateSeller(user, id, payload) : createSeller(user, payload),
  );
  if (res.ok) revalidatePath("/vendedores");
  return res;
}

export async function archiveSellerAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveSeller(user, id, archived));
  if (res.ok) revalidatePath("/vendedores");
  return res;
}
