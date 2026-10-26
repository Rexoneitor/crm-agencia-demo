"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  id: string;
  label: string;
  /** Texto secundario opcional (p. ej. el ámbito de un destino). */
  hint?: string;
}

/**
 * Campo "elige de la lista O escribe uno nuevo".
 *
 * Emite dos inputs ocultos:
 *   - `${name}Id`  → id de una opción existente (vacío si es nuevo)
 *   - `${name}New` → texto escrito cuando se va a crear uno nuevo (vacío si existente)
 *
 * El servidor decide: si viene `Id`, lo usa; si viene `New`, crea el registro.
 */
export function ComboBox({
  name,
  options,
  defaultId = "",
  placeholder = "Escribe o elige…",
  required = false,
  allowCreate = true,
  disabled = false,
  onChange,
}: {
  name: string;
  options: ComboOption[];
  defaultId?: string;
  placeholder?: string;
  required?: boolean;
  allowCreate?: boolean;
  disabled?: boolean;
  /** Notifica el id elegido ("" si es nuevo o está vacío). Útil para dependencias (destino→hotel). */
  onChange?: (value: { id: string; newName: string }) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = options.find((o) => o.id === defaultId);
  const [text, setText] = useState(initial?.label ?? "");
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Si cambian las opciones (p. ej. se filtran hoteles por destino) y el
  // seleccionado ya no está, se limpia.
  useEffect(() => {
    if (selectedId && !options.some((o) => o.id === selectedId)) {
      setSelectedId("");
      setText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const trimmed = text.trim();
  const exact = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  const filtered = useMemo(() => {
    if (!trimmed) return options.slice(0, 50);
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50);
  }, [options, trimmed]);

  const showCreate = allowCreate && trimmed.length > 0 && !exact;
  const rows: ({ kind: "opt"; opt: ComboOption } | { kind: "create" })[] = [
    ...filtered.map((opt) => ({ kind: "opt" as const, opt })),
    ...(showCreate ? [{ kind: "create" as const }] : []),
  ];

  // Valores que van al formulario: si el texto coincide con una opción
  // existente preferimos su id; si no, y se permite crear, es un nombre nuevo.
  const resolvedId = selectedId || (exact ? exact.id : "");
  const resolvedNew = resolvedId ? "" : trimmed && allowCreate ? trimmed : "";

  useEffect(() => {
    onChange?.({ id: resolvedId, newName: resolvedNew });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId, resolvedNew]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(row: (typeof rows)[number]) {
    if (row.kind === "opt") {
      setSelectedId(row.opt.id);
      setText(row.opt.label);
    } else {
      setSelectedId("");
      // el texto se queda tal cual: es el nombre nuevo
    }
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={`${name}Id`} value={resolvedId} />
      <input type="hidden" name={`${name}New`} value={resolvedNew} />
      {/* validación nativa: si es obligatorio, exige texto */}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSelectedId("");
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, rows.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && rows[highlight]) {
            e.preventDefault();
            pick(rows[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {open && rows.length > 0 && (
        <ul
          id={listId}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
        >
          {rows.map((row, i) => {
            const active = i === highlight;
            if (row.kind === "create") {
              return (
                <li key="__create__">
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(row)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-medium text-primary",
                      active && "bg-surface-muted",
                    )}
                  >
                    <Plus className="size-4" /> Crear «{trimmed}»
                  </button>
                </li>
              );
            }
            const selected = row.opt.id === resolvedId;
            return (
              <li key={row.opt.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(row)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left",
                    active && "bg-surface-muted",
                  )}
                >
                  <span>
                    {row.opt.label}
                    {row.opt.hint && (
                      <span className="ml-1 text-xs text-muted-foreground">({row.opt.hint})</span>
                    )}
                  </span>
                  {selected && <Check className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {resolvedNew && (
        <p className="mt-1 text-xs text-primary">Se creará «{resolvedNew}» al guardar.</p>
      )}
    </div>
  );
}
