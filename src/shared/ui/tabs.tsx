"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: { key: string; label: string; count?: number }[];
  children: (active: string) => React.ReactNode;
  initial?: string;
}

export function Tabs({ tabs, children, initial }: TabsProps) {
  const [active, setActive] = React.useState(initial ?? tabs[0]?.key);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 text-xs tabular-nums">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}
