"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/core/forms";
import { setAlertInteraction } from "@/modules/alerts/service";

export async function setAlertInteractionAction(payload: {
  alertType: string;
  entityType: string;
  entityId: string;
  referenceDate: string;
  status: "nueva" | "leida" | "pospuesta" | "descartada";
  snoozeUntil?: string;
}) {
  const res = await runAction((user) => setAlertInteraction(user, payload));
  if (res.ok) {
    revalidatePath("/notificaciones");
    revalidatePath("/");
  }
  return res;
}
