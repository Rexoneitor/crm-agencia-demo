"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { createContractAction } from "../actions";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { ComboBox } from "@/shared/ui/combobox";
import { Input, Select, Textarea } from "@/shared/ui/input";
import { Field } from "@/shared/ui/label";

interface Opt {
  id: string;
  name: string;
}
interface Dest extends Opt {
  scope: string;
}
interface Hotel extends Opt {
  destinationId: string;
}

export function NewContractForm({
  clients,
  sellers,
  destinations,
  hotels,
  groups,
}: {
  clients: { id: string; fullName: string }[];
  sellers: Opt[];
  destinations: Dest[];
  hotels: Hotel[];
  groups: Opt[];
}) {
  const [state, action, pending] = useActionState(createContractAction, null);
  const [modality, setModality] = useState<"fecha_cerrada" | "fecha_abierta">("fecha_cerrada");
  const [destinationId, setDestinationId] = useState("");
  const [tripType, setTripType] = useState<"nacional" | "internacional">("nacional");

  // Si el destino elegido ya existe, filtramos sus hoteles; si es nuevo o no
  // hay, mostramos todos (el usuario elige o crea uno).
  const filteredHotels = useMemo(
    () => (destinationId ? hotels.filter((h) => h.destinationId === destinationId) : hotels),
    [hotels, destinationId],
  );

  const fe = (state && !state.ok && "fieldErrors" in state && state.fieldErrors) || {};
  const err = (k: string) => fe[k]?.[0];

  return (
    <form action={action} className="space-y-5">
      {state && !state.ok && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="clientId" required error={err("client")}>
            <ComboBox
              name="client"
              required
              placeholder="Escribe el nombre del cliente…"
              options={clients.map((c) => ({ id: c.id, label: c.fullName }))}
            />
          </Field>
          <Field label="Vendedor" htmlFor="sellerId" error={err("seller")}>
            <ComboBox
              name="seller"
              placeholder="Escribe o elige (opcional)…"
              options={sellers.map((s) => ({ id: s.id, label: s.name }))}
            />
          </Field>

          <Field label="Modalidad" htmlFor="modality" required>
            <Select
              id="modality"
              name="modality"
              value={modality}
              onChange={(e) => setModality(e.target.value as typeof modality)}
            >
              <option value="fecha_cerrada">Fecha cerrada (ya hay fechas de viaje)</option>
              <option value="fecha_abierta">Fecha abierta (ventana de vigencia)</option>
            </Select>
          </Field>
          <Field label="Ámbito" htmlFor="tripType" required error={err("tripType")}>
            <Select
              id="tripType"
              name="tripType"
              value={tripType}
              onChange={(e) => setTripType(e.target.value as typeof tripType)}
            >
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </Select>
          </Field>

          <Field label="Destino" htmlFor="destinationId" required error={err("destination")}>
            <ComboBox
              name="destination"
              required
              placeholder="Escribe o elige el destino…"
              options={destinations.map((d) => ({ id: d.id, label: d.name, hint: d.scope }))}
              onChange={({ id }) => setDestinationId(id)}
            />
          </Field>
          <Field label="Hotel" htmlFor="hotelId">
            <ComboBox
              name="hotel"
              placeholder="Escribe o elige (opcional)…"
              options={filteredHotels.map((h) => ({ id: h.id, label: h.name }))}
            />
          </Field>

          <Field label="Fecha de venta" htmlFor="saleDate">
            <Input id="saleDate" name="saleDate" type="date" />
          </Field>
          <Field
            label="Grupo de viaje (opcional)"
            htmlFor="groupId"
            hint="varias personas, mismo viaje, cada una con su contrato"
          >
            <ComboBox
              name="group"
              placeholder="Escribe o elige un grupo…"
              options={groups.map((g) => ({ id: g.id, label: g.name }))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {modality === "fecha_cerrada" ? "Fechas de viaje" : "Ventana de vigencia"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {modality === "fecha_cerrada" ? (
            <>
              <Field label="Fecha de viaje" htmlFor="travelDate" required error={err("travelDate")}>
                <Input id="travelDate" name="travelDate" type="date" />
              </Field>
              <Field label="Fecha de regreso" htmlFor="returnDate" error={err("returnDate")}>
                <Input id="returnDate" name="returnDate" type="date" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Vigencia desde" htmlFor="vigenciaStart" required error={err("vigenciaStart")}>
                <Input id="vigenciaStart" name="vigenciaStart" type="date" />
              </Field>
              <Field label="Vigencia hasta" htmlFor="vigenciaEnd" required error={err("vigenciaEnd")}>
                <Input id="vigenciaEnd" name="vigenciaEnd" type="date" />
              </Field>
            </>
          )}
          <Field label="Días" htmlFor="days">
            <Input id="days" name="days" type="number" min={0} defaultValue={4} />
          </Field>
          <Field label="Noches" htmlFor="nights">
            <Input id="nights" name="nights" type="number" min={0} defaultValue={3} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precio y pasajeros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio total" htmlFor="priceMajor" required error={err("priceMajor")}>
            <Input id="priceMajor" name="priceMajor" type="number" min={0} step="0.01" required />
          </Field>
          <Field label="Moneda" htmlFor="currency" required>
            <Select id="currency" name="currency" defaultValue="COP">
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <div />
          <Field label="Adultos" htmlFor="adults">
            <Input id="adults" name="adults" type="number" min={0} defaultValue={2} />
          </Field>
          <Field label="Niños" htmlFor="children">
            <Input id="children" name="children" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Infantes" htmlFor="infants">
            <Input id="infants" name="infants" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Packs" htmlFor="packs">
            <Input id="packs" name="packs" type="number" min={1} defaultValue={1} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PDF del contrato (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            name="pdf"
            accept="application/pdf,image/jpeg,image/png"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-1.5 file:text-sm"
          />
          <Field label="Notas" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear contrato"}
        </Button>
      </div>
    </form>
  );
}
