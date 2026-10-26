"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction } from "@/core/forms";
import { archiveHotel, createHotel, updateHotel } from "@/modules/hotels/service";

export async function saveHotelAction(_prev: unknown, fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const payload = formToObject(fd);
  payload.active = fd.get("active") === "on" || fd.get("active") === "true";
  const res = await runAction((user) =>
    id ? updateHotel(user, id, payload) : createHotel(user, payload),
  );
  if (res.ok) revalidatePath("/hoteles");
  return res;
}

export async function archiveHotelAction(id: string, archived: boolean) {
  const res = await runAction((user) => archiveHotel(user, id, archived));
  if (res.ok) revalidatePath("/hoteles");
  return res;
}
