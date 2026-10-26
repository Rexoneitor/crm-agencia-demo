import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

/**
 * Logotipo de Agencia Demo: un sol dorado que asoma tras el
 * horizonte con la estela de un avión, sobre azul océano. SVG en línea
 * (cero descargas, nítido a cualquier tamaño).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} role="img" aria-label={BRAND.name}>
      {/* Sin degradados con id: así se ve igual aunque haya varios logos en la página. */}
      <rect width="40" height="40" rx="10" fill="#1559c9" />
      <circle cx="20" cy="25" r="9" fill="#f2a516" />
      <path d="M0 25.5h40V30c0 5.5-4.5 10-10 10H10C4.5 40 0 35.5 0 30z" fill="#0a2547" />
      <path d="M5 25.6h30" stroke="#f7bd45" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 30h22M12 33.5h16" stroke="#2f74e0" strokeWidth="1.2" strokeLinecap="round" />
      {/* avión */}
      <g transform="translate(19.5 4) scale(0.68)" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      </g>
      <path d="M7 19.5c3.6-3 7.6-5 12-6" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.4 2.2" opacity="0.65" fill="none" />
    </svg>
  );
}

/** Logotipo + nombre. `tone="light"` para fondos oscuros (barra lateral, login). */
export function BrandLockup({
  tone = "dark",
  size = "md",
  className,
}: {
  tone?: "light" | "dark";
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark className={size === "lg" ? "size-12" : "size-9"} />
      <div className="min-w-0 leading-tight">
        <p
          className={cn(
            "truncate font-semibold tracking-tight",
            size === "lg" ? "text-lg" : "text-sm",
            tone === "light" ? "text-white" : "text-foreground",
          )}
        >
          Agencia <span className={tone === "light" ? "text-gold-400" : "text-primary"}>Demo</span>
        </p>
        <p
          className={cn(
            "truncate text-[11px] uppercase tracking-[0.14em]",
            tone === "light" ? "text-sidebar-muted" : "text-muted-foreground",
          )}
        >
          {BRAND.short} · {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
