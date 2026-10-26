import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/core/auth";
import { exportCalendarXlsx } from "@/modules/export/calendar";
import {
  ENTITY_KINDS,
  exportEntityCsv,
  exportEntityXlsx,
  exportFullXlsx,
  exportPackageZip,
  type EntityKind,
} from "@/modules/export/service";

const KINDS: EntityKind[] = ENTITY_KINDS;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !can(user, "export.run")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { kind } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";

  if (kind === "full") {
    const { filename, buffer } = await exportFullXlsx();
    return fileResponse(buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  if (kind === "calendario") {
    // Mismos filtros que la pantalla Calendario.
    const q = req.nextUrl.searchParams;
    const conf = q.get("confirmacion");
    const { filename, buffer } = await exportCalendarXlsx({
      destinationId: q.get("destino") || undefined,
      hotelId: q.get("hotel") || undefined,
      scope: q.get("ambito") || undefined,
      sellerId: q.get("vendedor") || undefined,
      confirmation: conf === "confirmada" || conf === "pendiente" ? conf : undefined,
      paymentState: q.get("pago") || undefined,
    });
    return fileResponse(buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  if (kind === "paquete") {
    const { filename, buffer } = await exportPackageZip();
    return fileResponse(buffer, filename, "application/zip");
  }

  if (!KINDS.includes(kind as EntityKind)) {
    return NextResponse.json({ error: "Entidad desconocida" }, { status: 404 });
  }

  if (format === "csv") {
    const { filename, content } = await exportEntityCsv(kind as EntityKind);
    return fileResponse(Buffer.from(content, "utf8"), filename, "text/csv; charset=utf-8");
  }
  const { filename, buffer } = await exportEntityXlsx(kind as EntityKind);
  return fileResponse(buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function fileResponse(buffer: Buffer, filename: string, contentType: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
