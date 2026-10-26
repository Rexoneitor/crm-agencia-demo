"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";
import { BRAND } from "@/config/brand";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <Card className="shadow-raised">
      <CardHeader className="gap-1 p-6 pb-4">
        <CardTitle className="text-xl font-semibold tracking-tight">Bienvenido</CardTitle>
        <p className="text-sm text-muted-foreground">Ingresa con tu correo de {BRAND.short} para continuar.</p>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Correo" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="tucorreo@demo.com"
              required
              autoFocus
            />
          </Field>
          <Field label="Contraseña" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {state && !state.ok && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
