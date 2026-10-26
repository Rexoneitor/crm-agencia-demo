"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "./actions";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

interface Item {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "json";
  value: unknown;
  isDefault: boolean;
}

export function SettingsForm({
  groups,
  editable,
}: {
  groups: { key: string; label: string; items: Item[] }[];
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);

  return (
    <form action={action} className="space-y-5">
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader>
            <CardTitle>{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {g.items.map((it) => (
              <Field
                key={it.key}
                label={it.label}
                htmlFor={it.key}
                hint={it.isDefault ? "valor por defecto" : undefined}
              >
                <Input
                  id={it.key}
                  name={it.key}
                  type={it.type === "number" ? "number" : "text"}
                  defaultValue={
                    it.type === "json"
                      ? JSON.stringify(it.value)
                      : String(it.value ?? "")
                  }
                  disabled={!editable}
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      ))}

      {state && !state.ok && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">
          Configuración guardada.
        </p>
      )}

      {editable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}
    </form>
  );
}
