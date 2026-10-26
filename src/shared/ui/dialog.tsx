"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Modal accesible basado en el elemento nativo <dialog>. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50",
        className,
      )}
    >
      <div className="flex items-start justify-between border-b border-border p-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

/** Confirmación de acción destructiva/sensible con motivo opcional. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  requireReason = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  requireReason?: boolean;
  pending?: boolean;
}) {
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      {requireReason && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)"
          className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          rows={3}
        />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="h-9 rounded-md border border-input px-4 text-sm hover:bg-surface-muted"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(reason)}
          disabled={pending || (requireReason && reason.trim().length < 3)}
          className="h-9 rounded-md bg-danger px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
