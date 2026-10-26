"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/modules/auth/service";
import { fail, ok, type ActionResult } from "@/core/errors";

export async function loginAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const next = String(formData.get("next") || "/");
  try {
    const h = await headers();
    await login(
      {
        email: formData.get("email"),
        password: formData.get("password"),
      },
      {
        userAgent: h.get("user-agent") ?? undefined,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
      },
    );
  } catch (e) {
    return fail(e);
  }
  redirect(next.startsWith("/") ? next : "/");
  return ok(null);
}
