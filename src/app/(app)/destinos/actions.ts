"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import {
  archiveDestination,
  createDestination,
  updateDestination,
} from "@/modules/destinations/service";

export async function saveDestinationAction(_prev: unknown, fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const payload = formToObject(fd);
  payload.active = fd.get("active") === "on" || fd.get("active") === "true";
  const res = await runAction((user) =>
    id ? updateDestination(user, id, payload) : createDestination(user, payload),
  );
  if (res.ok) revalidatePath("/destinos");
  return res;
}

export async function archiveDestinationAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveDestination(user, id, archived));
  if (res.ok) revalidatePath("/destinos");
  return res;
}
