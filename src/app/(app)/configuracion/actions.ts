"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth";
import { updateSettings } from "@/modules/settings/service";
import { SETTING_DEFS_BY_KEY } from "@/modules/settings/defaults";
import { fail, ok, type ActionResult } from "@/core/errors";

export async function updateSettingsAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const updates: Record<string, unknown> = {};
    for (const [key, raw] of formData.entries()) {
      const def = SETTING_DEFS_BY_KEY[key];
      if (!def) continue;
      const value = String(raw);
      if (def.type === "number") updates[key] = Number(value);
      else if (def.type === "boolean") updates[key] = value === "true" || value === "on";
      else if (def.type === "json") {
        try {
          updates[key] = JSON.parse(value);
        } catch {
          updates[key] = value.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
        }
      } else updates[key] = value;
    }
    await updateSettings(user, updates);
    revalidatePath("/configuracion");
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
