import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para la versión pública (internet).
 * No se define una CSP completa: el lector de capturas (tesseract.js) usa workers
 * y WebAssembly y una política estricta lo rompería. Sí se bloquea el enmarcado
 * (clickjacking) y se limita a dónde puede enviar formularios la página.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // En Render (512 MB) la revisión de tipos y el lint dentro de `next build` agotan la
  // memoria. Ya se corren aparte (`npm run typecheck` y `npm run lint`) antes de subir.
  // Fuera de Render (tu PC) el build sigue siendo estricto.
  ...(process.env.RENDER
    ? { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } }
    : {}),

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // El motor de reglas y los servicios usan Node APIs; nada de esto va al cliente.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client", "exceljs"],

  // Tree-shaking de los barriles grandes (iconos, fechas): menos trabajo de
  // compilación en desarrollo y menos JS en el cliente.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    // Menos memoria al compilar (clave en el plan gratis de Render).
    webpackMemoryOptimizations: true,
    // Un solo proceso al compilar en Render (sin procesos «worker» extra que suman memoria).
    ...(process.env.RENDER
      ? { cpus: 1, webpackBuildWorker: false, workerThreads: false, serverMinification: false }
      : {}),
    // Fotos de comprobantes desde el celular pesan más del 1 MB por defecto.
    serverActions: { bodySizeLimit: "15mb" },
  },

  // Mantener calientes las pantallas ya compiladas: menos esperas de
  // "preparando pantalla" al volver a una vista.
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 30,
    pagesBufferLength: 8,
  },
};

export default nextConfig;
