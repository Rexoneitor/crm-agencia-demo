import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/core/auth";
import { readDocumentForDownload } from "@/modules/documents/service";

/**
 * Entrega de archivos SIEMPRE a través de un endpoint autenticado (§14).
 * Nunca se sirven por ruta directa del sistema de ficheros.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { bytes, mimeType, name } = await readDocumentForDownload(id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
