"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BedDouble,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Search,
  Settings,
  Users,
  Users2,
  UserSquare,
  Wallet,
  Upload,
  ListChecks,
  Database,
  Undo2,
  BarChart3,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { BrandLockup, BrandMark } from "./brand";

export interface NavUser {
  name: string;
  email: string;
  role: string;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
export type SearchFn = (q: string) => Promise<{ ok: true; data: SearchResult[] } | { ok: false; error: string }>;

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/** Menú agrupado por lo que se hace en el día a día de la agencia. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Día a día",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard, exact: true },
      { href: "/revision", label: "Revisión rápida", icon: ListChecks },
      { href: "/comprobantes", label: "Subir comprobante", icon: Upload },
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
    ],
  },
  {
    title: "Ventas",
    items: [
      { href: "/contratos", label: "Contratos", icon: FileText },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/grupos", label: "Grupos", icon: Users2 },
      { href: "/cupos", label: "Cupos", icon: Package },
    ],
  },
  {
    title: "Dinero",
    items: [
      { href: "/pagos", label: "Pagos", icon: Wallet },
      { href: "/reembolsos", label: "Reembolsos", icon: Undo2 },
      { href: "/reportes", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    title: "Catálogos",
    items: [
      { href: "/vendedores", label: "Vendedores", icon: UserSquare },
      { href: "/destinos", label: "Destinos", icon: MapPin },
      { href: "/hoteles", label: "Hoteles", icon: BedDouble },
    ],
  },
];

const NAV_FOOT: NavItem[] = [
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/sistema", label: "Sistema", icon: Database },
];

/** Barra inferior en el celular: lo que más se usa, a un toque. */
const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/revision", label: "Revisión", icon: ListChecks },
  { href: "/comprobantes", label: "Comprobante", icon: Upload },
  { href: "/contratos", label: "Contratos", icon: FileText },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const isActive = useIsActive();

  const item = (n: NavItem) => {
    const Icon = n.icon;
    const active = isActive(n.href, n.exact);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-active text-white"
            : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-white",
        )}
      >
        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-gold-400" aria-hidden />}
        <Icon className={cn("size-4 shrink-0", active ? "text-gold-400" : "text-sidebar-muted group-hover:text-white")} />
        {n.label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((g) => (
        <div key={g.title} className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted/80">{g.title}</p>
          {g.items.map(item)}
        </div>
      ))}
      <div className="mt-auto space-y-0.5 border-t border-sidebar-border pt-3">{NAV_FOOT.map(item)}</div>
    </nav>
  );
}

function SidebarBody({ user, onLogout, onNavigate }: { user: NavUser; onLogout: () => void; onNavigate?: () => void }) {
  return (
    <>
      <NavLinks onNavigate={onNavigate} />
      <UserFooter user={user} onLogout={onLogout} />
    </>
  );
}

export function Sidebar({ user, onLogout }: { user: NavUser; onLogout: () => void }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-gradient-to-b from-sidebar to-sidebar-2 text-sidebar-foreground md:flex">
      <Link href="/" className="flex h-16 items-center border-b border-sidebar-border px-4">
        <BrandLockup tone="light" />
      </Link>
      <SidebarBody user={user} onLogout={onLogout} />
    </aside>
  );
}

function UserFooter({ user, onLogout }: { user: NavUser; onLogout: () => void }) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-brand-950">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

/** Buscador con resultados al instante (sin tildes ni mayúsculas). «/» o Ctrl+K lo enfocan. */
function GlobalSearch({ search }: { search?: SearchFn }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!search || term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await search(term);
      if (cancelled) return;
      setLoading(false);
      setHits(res.ok ? res.data : []);
      setActive(0);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, search]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    router.push(href);
  };

  const showPanel = open && q.trim().length >= 2;

  return (
    <form
      action="/buscar"
      className="relative flex-1 md:max-w-lg"
      onSubmit={(e) => {
        if (hits[active]) {
          e.preventDefault();
          go(hits[active].href);
        }
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        name="q"
        value={q}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Buscar cliente, contrato, cédula, teléfono…"
        aria-label="Buscar"
        className="h-10 w-full rounded-full border border-input bg-surface-muted/60 pl-9 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface px-1.5 text-[10px] font-medium text-muted-foreground sm:block">
        Ctrl K
      </kbd>

      {showPanel && (
        <div className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-lg border border-border bg-surface shadow-raised">
          {loading && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Buscando…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados. Prueba con otra palabra.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {hits.map((h, i) => (
                <li key={`${h.type}-${h.id}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h.href)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left",
                      i === active ? "bg-brand-50 dark:bg-surface-muted" : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h.type}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/buscar?q=${encodeURIComponent(q.trim())}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2 text-xs text-primary hover:bg-surface-muted"
          >
            Ver todos los resultados →
          </Link>
        </div>
      )}
    </form>
  );
}

export function Topbar({
  user,
  onLogout,
  alertCount = 0,
  search,
}: {
  user: NavUser;
  onLogout: () => void;
  alertCount?: number;
  search?: SearchFn;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Cierra el menú del celular al cambiar de página.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:px-6">
      <button
        className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </button>
      <Link href="/" className="md:hidden" aria-label="Inicio">
        <BrandMark className="size-8" />
      </Link>

      <GlobalSearch search={search} />

      <Link
        href="/notificaciones"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        aria-label={alertCount > 0 ? `Notificaciones (${alertCount})` : "Notificaciones"}
      >
        <Bell className="size-5" />
        {alertCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white ring-2 ring-surface">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </Link>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-gradient-to-b from-sidebar to-sidebar-2 text-sidebar-foreground shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <BrandLockup tone="light" />
              <button onClick={() => setOpen(false)} aria-label="Cerrar menú" className="rounded-md p-1 text-sidebar-muted hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <SidebarBody user={user} onLogout={onLogout} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}

/** Barra de pestañas fija abajo, solo en el celular. */
export function MobileTabBar() {
  const isActive = useIsActive();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Accesos rápidos"
    >
      {MOBILE_TABS.map((t) => {
        const Icon = t.icon;
        const active = isActive(t.href, t.exact);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { Button };
