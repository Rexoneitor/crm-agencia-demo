"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/auth";
import { destroySession } from "@/core/auth/session";
import { changePassword } from "@/modules/auth/service";
import { fail, ok, type ActionResult } from "@/core/errors";

export async function changePasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar.", code: "NO_SESSION" };
    await changePassword(user, {
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirm: formData.get("confirm"),
    });
  } catch (e) {
    return fail(e);
  }
  // Las sesiones ya se invalidaron en la base; se limpia también la cookie.
  await destroySession();
  redirect("/login");
  return ok(null);
}
