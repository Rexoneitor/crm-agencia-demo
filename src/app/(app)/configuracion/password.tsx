"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./password-action";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

/** «Cambiar mi contraseña»: cualquier usuario puede cambiar la suya. */
export function PasswordCard() {
  const [state, action, pending] = useActionState(changePasswordAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar mi contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Contraseña actual" htmlFor="currentPassword" required>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Contraseña nueva" htmlFor="newPassword" required hint="Mínimo 8 caracteres">
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repite la contraseña nueva" htmlFor="confirm" required>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          {state && !state.ok && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">{state.error}</p>
          )}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Cambiar contraseña"}
            </Button>
            <span className="text-xs text-muted-foreground">Al cambiarla se cierran todas tus sesiones y deberás ingresar de nuevo.</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
