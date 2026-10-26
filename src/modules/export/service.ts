import "server-only";
import path from "node:path";
import { prisma } from "@/core/db/prisma";
import { label } from "@/core/domain/enums";
import { buildZip, type ZipEntry } from "@/core/zip";
import { BRAND, Book, type SheetSpec, type TableInfo } from "./xlsx-kit";
import { loadCore, type Core } from "./data";
import {
  IMG_MAX_W,
  clientesSpec,
  comisionesSpec,
  comprobantesSpec,
  contratosArchivadosSpec,
  contratosSpec,
  cuotasSpec,
  cuposSpec,
  destinosSpec,
  documentosSpec,
  entityNamer,
  gruposSpec,
  historialSpec,
  hotelesSpec,
  listDefs,
  notasSpec,
  pagosFueraSpec,
  pagosReembolsosSpec,
  pagosSpec,
  reembolsosArchivadosSpec,
  reembolsosSpec,
  reservasSpec,
  vendedoresSpec,
  type DocIndexRow,
  type ReceiptRow,
} from "./sheets";
import { addHelpSheet, addListsSheet, addSummarySheet } from "./summary";
import { addCalendarSheets, calendarItems, todayIso } from "./calendar";

/**
 * Exportación (ARQUITECTURA.md §16). Pensada para que, si el CRM algún día deja
 * de funcionar, la agencia siga trabajando con UN solo Excel editable:
 *
 *  · Datos como tablas de Excel reales (filtros, encabezado fijo, fechas y
 *    montos con su tipo, sin celdas combinadas).
 *  · Saldos y totales con FÓRMULAS: al agregar un pago en «Pagos» cambian el
 *    saldo del contrato, los totales por vendedor y la hoja «Resumen».
 *  · Listas desplegables (estado de reserva, vendedor, empresa, Sí/No…) y
 *    colores por estado (formato condicional).
 *
 * Lo que no cabe dentro de un Excel (los PDF de los contratos y la base de datos
 * original) va en el paquete ZIP opcional.
 */
export type EntityKind =
  | "contratos"
  | "contratos_archivados"
  | "reembolsos"
  | "pagos"
  | "comprobantes"
  | "reservas"
  | "clientes"
  | "grupos"
  | "vendedores"
  | "comisiones"
  | "cupos"
  | "destinos"
  | "hoteles"
  | "pagos_reembolsos"
  | "cuotas"
  | "documentos"
  | "notas"
  | "auditoria";

/** Entidades que se pueden descargar sueltas (`/api/export/[kind]`). */
export const ENTITY_KINDS: EntityKind[] = [
  "contratos",
  "reembolsos",
  "pagos",
  "comprobantes",
  "reservas",
  "clientes",
  "grupos",
  "vendedores",
  "comisiones",
  "cupos",
  "destinos",
  "hoteles",
  "pagos_reembolsos",
  "cuotas",
  "contratos_archivados",
  "documentos",
  "notas",
  "auditoria",
];

// ── Hojas ya armadas (independientes del tipo de fila) ───────────────────

interface Built {
  sheet: string;
  count: number;
  /** Hoja que sólo se incluye en el libro completo si tiene filas. */
  optional: boolean;
  usesLists: boolean;
  write(book: Book): TableInfo;
  csv(): string;
}

function built<R>(spec: SheetSpec<R>, opts: { optional?: boolean; after?: (book: Book, info: TableInfo) => void } = {}): Built {
  return {
    sheet: spec.sheet,
    count: spec.rows.length,
    optional: !!opts.optional,
    usesLists: spec.columns.some((c) => c.list),
    write(book) {
      const info = book.tableSheet(spec);
      opts.after?.(book, info);
      return info;
    },
    csv: () => toCsv(spec),
  };
}

function csvValue(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "hyperlink" in v) return String((v as { hyperlink: string }).hyperlink);
  return String(v);
}

function toCsv<R>(spec: SheetSpec<R>): string {
  const cols = spec.columns.filter((c) => !c.hidden);
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => esc(c.header)).join(";")];
  for (const r of spec.rows) lines.push(cols.map((c) => esc(csvValue(c.get?.(r)))).join(";"));
  return "﻿" + lines.join("\r\n");
}

/** Fotos de los comprobantes ancladas en la columna «Imagen». */
function placeImages(rows: ReceiptRow[]) {
  return (book: Book, info: TableInfo) => {
    const col = info.colOf("Imagen") - 1;
    rows.forEach((r, i) => {
      if (!r.image) return;
      const id = book.wb.addImage({ buffer: r.image.buf as unknown as ArrayBuffer, extension: r.image.ext });
      const row0 = info.first - 1 + i; // índice 0-based de la fila
      info.ws.addImage(id, { tl: { col: col + 0.05, row: row0 + 0.05 }, ext: { width: r.image.w, height: r.image.h } });
      info.ws.getRow(info.first + i).height = Math.ceil(r.image.h * 0.75) + 8;
    });
    info.ws.getColumn(col + 1).width = Math.ceil(IMG_MAX_W / 7) + 2;
  };
}

interface Ctx {
  today: string;
  images: boolean;
  core: Core;
}

async function build(kind: EntityKind, ctx: Ctx): Promise<Built> {
  const { core } = ctx;
  switch (kind) {
    case "contratos":
      return built(contratosSpec(core));
    case "contratos_archivados":
      return built(contratosArchivadosSpec(core), { optional: true });
    case "reembolsos":
      return built(reembolsosSpec(core, ctx.today));
    case "pagos":
      return built(pagosSpec(core));
    case "comprobantes": {
      const spec = await comprobantesSpec(ctx.images);
      return built(spec, { after: placeImages(spec.rows) });
    }
    case "reservas":
      return built(reservasSpec(core));
    case "clientes":
      return built(await clientesSpec());
    case "grupos":
      return built(await gruposSpec());
    case "vendedores":
      return built(await vendedoresSpec(core));
    case "comisiones":
      return built(await comisionesSpec());
    case "cupos":
      return built(await cuposSpec(), { optional: true });
    case "destinos":
      return built(await destinosSpec(core));
    case "hoteles":
      return built(await hotelesSpec(core));
    case "pagos_reembolsos":
      return built(pagosReembolsosSpec(core));
    case "cuotas":
      return built(await cuotasSpec(), { optional: true });
    case "documentos":
      return built(documentosSpec(await documentIndex()));
    case "notas":
      return built(await notasSpec(core));
    case "auditoria":
      return built(await historialSpec());
  }
}

const stamp = () => todayIso();

// ── Libro completo ───────────────────────────────────────────────────────

async function fullBook(images: boolean): Promise<{ book: Book; sheets: Built[] }> {
  const today = todayIso();
  const core = await loadCore();
  const ctx: Ctx = { today, images, core };
  const book = new Book(true, today);
  book.wb.title = `${BRAND} — Base completa`;

  const main = await Promise.all((["contratos", "pagos", "reembolsos", "vendedores"] as EntityKind[]).map((k) => build(k, ctx)));
  const reference = await Promise.all(
    (["clientes", "grupos", "destinos", "hoteles", "pagos_reembolsos", "comisiones", "cupos", "cuotas", "comprobantes"] as EntityKind[]).map((k) =>
      build(k, ctx),
    ),
  );
  const archive: Built[] = [
    built(pagosFueraSpec(core), { optional: true }),
    await build("contratos_archivados", ctx),
    built(reembolsosArchivadosSpec(core), { optional: true }),
    await build("documentos", ctx),
    await build("notas", ctx),
    await build("auditoria", ctx),
  ];
  const keep = (b: Built) => !b.optional || b.count > 0;

  addSummarySheet(book, core, today);
  for (const b of main) b.write(book);
  addCalendarSheets(book, await calendarItems());
  // «Pagos de reembolsos» se escribe siempre: la hoja Reembolsos la suma con fórmulas.
  for (const b of [...reference, ...archive].filter(keep)) b.write(book);
  addListsSheet(book, await listDefs(core));
  const sheets = [...main, ...reference, ...archive].filter(keep);
  addHelpSheet(book, sheets.map((s) => ({ sheet: s.sheet, count: s.count })), images);
  book.wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return { book, sheets };
}

// ── API ──────────────────────────────────────────────────────────────────

export async function exportEntityCsv(kind: EntityKind): Promise<{ filename: string; content: string }> {
  const b = await build(kind, { today: todayIso(), images: false, core: await loadCore() });
  return { filename: `${kind}-${stamp()}.csv`, content: b.csv() };
}

/** Excel suelto de una pantalla: la tabla con su formato, colores y listas (sin fórmulas entre hojas). */
export async function exportEntityXlsx(kind: EntityKind): Promise<{ filename: string; buffer: Buffer }> {
  const today = todayIso();
  const core = await loadCore();
  const b = await build(kind, { today, images: true, core });
  const book = new Book(false, today);
  b.write(book);
  if (b.usesLists) addListsSheet(book, await listDefs(core));
  return { filename: `DEMO-${kind}-${today}.xlsx`, buffer: await book.buffer() };
}

/** EL archivo: todo en un solo Excel, con las fotos de los comprobantes dentro. */
export async function exportFullXlsx(): Promise<{ filename: string; buffer: Buffer }> {
  const { book } = await fullBook(true);
  return { filename: `DEMO-base-completa-${book.today}.xlsx`, buffer: await book.buffer() };
}

/** Excel completo SIN fotos, para guardar junto a cada respaldo automático (las fotos ya están en la carpeta de archivos del respaldo). */
export async function fullWorkbookBuffer(): Promise<Buffer> {
  const { book } = await fullBook(false);
  return book.buffer();
}

// ── Paquete ZIP ──────────────────────────────────────────────────────────

function safeName(s: string): string {
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").slice(0, 120) || "sin_nombre";
}

async function documentIndexRaw() {
  const [docs, name] = await Promise.all([
    prisma.document.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
    entityNamer(),
  ]);
  const used = new Set<string>();
  return docs.map((d) => {
    const owner = name(d.entityType, d.entityId);
    const base = safeName(`${label(d.kind)} - ${d.originalName}`);
    let rel = `documentos/${owner.folder}/${safeName(owner.name)}/${base}`;
    let n = 2;
    while (used.has(rel.toLowerCase())) {
      const ext = path.extname(base);
      rel = `documentos/${owner.folder}/${safeName(owner.name)}/${base.slice(0, base.length - ext.length)} (${n++})${ext}`;
    }
    used.add(rel.toLowerCase());
    return { doc: d, owner, zipPath: rel };
  });
}

async function documentIndex(): Promise<DocIndexRow[]> {
  return (await documentIndexRaw()).map(({ doc, owner, zipPath }) => ({
    owner: owner.name,
    folder: owner.folder,
    kind: label(doc.kind),
    name: doc.originalName,
    kb: Math.round(doc.sizeBytes / 1024),
    createdAt: doc.createdAt,
    zipPath,
    sha256: doc.sha256,
  }));
}

const LEEME = (date: string, counts: string) => `PAQUETE COMPLETO — ${BRAND} — ${date}
==========================================================

  CRM-completo.xlsx      EL archivo principal: todo en un solo Excel editable.
                         Hoja Resumen con indicadores (fórmulas), Contratos con
                         saldo calculado, Pagos, Reembolsos, Vendedores,
                         calendario mes por mes, fotos de comprobantes, clientes,
                         grupos, destinos, hoteles, notas e historial.
                         Se abre con Excel, LibreOffice o Google Sheets.

  csv/                   Las mismas hojas en CSV (separador ";", UTF-8), por si
                         hace falta importarlas en otro sistema.


Registros: ${counts}
`;

/**
 * Paquete ZIP (versión web): el Excel completo + las mismas hojas en CSV, generado en
 * memoria (no escribe nada en disco). Los PDF no se incluyen: el disco de Render es
 * efímero y su memoria limitada; viven en Supabase Storage.
 */
export async function exportPackageZip(): Promise<{ filename: string; buffer: Buffer }> {
  const { book, sheets } = await fullBook(true);
  const date = book.today;
  const entries: ZipEntry[] = [];
  entries.push({ name: "CRM-completo.xlsx", data: await book.buffer() });
  const core = await loadCore();
  const csvSheets = [...sheets, built(reservasSpec(core))];
  for (const [i, s] of csvSheets.entries()) {
    entries.push({ name: `csv/${String(i + 1).padStart(2, "0")}-${safeName(s.sheet)}.csv`, data: Buffer.from(s.csv(), "utf8") });
  }
  const counts = sheets.map((s) => `${s.sheet}: ${s.count}`).join(" · ");
  const readme =
    LEEME(date, counts) +
    "\nLos PDF de los contratos y las fotos de comprobantes están en Supabase Storage y se descargan\ndesde cada contrato. Los respaldos de la base de datos los hace Neon automáticamente.\n";
  entries.unshift({ name: "LEEME.txt", data: Buffer.from(readme, "utf8") });
  return { filename: `DEMO-paquete-completo-${date}.zip`, buffer: buildZip(entries) };
}
