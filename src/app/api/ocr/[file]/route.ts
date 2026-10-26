import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/core/auth";

/**
 * Archivos del lector de capturas (tesseract.js) servidos DESDE ESTE EQUIPO, sin CDN:
 * la imagen del comprobante se lee en el navegador y nunca sale del CRM.
 * Solo se entregan los archivos de esta lista (nada de rutas libres).
 */
const NM = path.join(process.cwd(), "node_modules");
const CORE = path.join(NM, "tesseract.js-core");
const FILES: Record<string, { file: string; type: string }> = {
  "worker.min.js": { file: path.join(NM, "tesseract.js", "dist", "worker.min.js"), type: "text/javascript" },
  "spa.traineddata.gz": {
    file: path.join(NM, "@tesseract.js-data", "spa", "4.0.0_best_int", "spa.traineddata.gz"),
    type: "application/octet-stream",
  },
};
for (const v of ["", "-simd", "-relaxedsimd"]) {
  for (const l of ["", "-lstm"]) {
    const name = `tesseract-core${v}${l}.wasm.js`;
    FILES[name] = { file: path.join(CORE, name), type: "text/javascript" };
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  // Solo con sesión válida (el middleware solo comprueba que exista la cookie).
  if (!(await getCurrentUser())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { file } = await params;
  const entry = FILES[file];
  if (!entry) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  try {
    const bytes = await readFile(entry.file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": entry.type,
        // Versionados con el paquete: el navegador los guarda y no los vuelve a pedir.
        "Cache-Control": "private, max-age=2592000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Lector de capturas no instalado (npm install)" }, { status: 404 });
  }
}
