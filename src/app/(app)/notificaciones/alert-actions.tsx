"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAlertInteractionAction } from "./actions";

interface AlertKey {
  alertType: string;
  entityType: string;
  entityId: string;
  referenceDate: string;
}

export function AlertActions({ alert }: { alert: AlertKey }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showSnooze, setShowSnooze] = useState(false);

  const apply = (
    status: "descartada" | "pospuesta",
    snoozeUntil?: string,
  ) => {
    start(async () => {
      await setAlertInteractionAction({ ...alert, status, snoozeUntil });
      router.refresh();
    });
  };

  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs">
      {showSnooze ? (
        <input
          type="date"
          defaultValue={in7}
          disabled={pending}
          onChange={(e) => e.target.value && apply("pospuesta", e.target.value)}
          className="h-7 rounded border border-input bg-surface px-2"
        />
      ) : (
        <button
          disabled={pending}
          onClick={() => setShowSnooze(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          Posponer
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => apply("descartada")}
        className="text-muted-foreground hover:text-danger"
      >
        Descartar
      </button>
    </div>
  );
}
