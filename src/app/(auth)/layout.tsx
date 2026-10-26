import { BRAND } from "@/config/brand";
import { BrandLockup } from "@/shared/ui/brand";

export const metadata = { title: "Ingresar" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca (pantallas grandes) */}
      <aside className="bg-brand-gradient relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <BrandLockup tone="light" size="lg" />
        <div className="relative z-10 max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Cada viaje, en orden.
            <span className="block text-gold-400">De la venta al regreso.</span>
          </h1>
          <p className="text-base text-sidebar-foreground/80">
            Contratos, reservas, pagos, comprobantes y reembolsos de {BRAND.name} en un solo lugar.
          </p>
        </div>
        <p className="relative z-10 text-xs text-sidebar-muted">
          © {new Date().getFullYear()} {BRAND.name} · Uso interno
        </p>
        {/* Horizonte decorativo */}
        <svg
          aria-hidden
          viewBox="0 0 600 300"
          className="pointer-events-none absolute -bottom-10 -right-20 w-[130%] opacity-25"
        >
          <circle cx="430" cy="210" r="120" fill="#f2a516" />
          <path d="M0 210h600v90H0z" fill="#061a33" />
          <path d="M40 240h520M120 265h360" stroke="#2f74e0" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 lg:hidden">
          <BrandLockup size="lg" />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
