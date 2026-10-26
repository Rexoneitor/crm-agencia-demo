import { NextResponse } from "next/server";

/**
 * Comprobación de vida para Render. Pública y SIN tocar la base de datos
 * (así no despierta a Neon ni gasta horas de cómputo en cada comprobación).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
