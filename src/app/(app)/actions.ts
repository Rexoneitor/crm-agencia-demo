"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/auth";
import { logout } from "@/modules/auth/service";
import { runAction } from "@/core/forms";
import { globalSearch } from "@/modules/search/service";

export async function logoutAction() {
  const user = await getCurrentUser();
  await logout(user?.id);
  redirect("/login");
}

/** Resultados instantáneos para el buscador de la barra superior. */
export async function quickSearchAction(q: string) {
  return runAction(() => globalSearch(q, { contracts: 6, clients: 4, others: 3 }));
}
