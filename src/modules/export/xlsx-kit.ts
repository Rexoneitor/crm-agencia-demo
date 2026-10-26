import ExcelJS from "exceljs";
import { patchXlsx, type XlsxPatch } from "./xlsx-patch";

/**
 * Kit común de los Excel que descarga el CRM: marca, paleta, tablas de Excel
 * reales (con filtro y encabezado fijo), formatos por tipo de dato, fórmulas,
 * listas desplegables y formato condicional. Todas las hojas se ven igual.
 *
 * Convenciones de cada hoja de datos:
 *   fila 1  franja azul con «Agencia Demo · <hoja>»
 *   fila 2  una línea corta de ayuda (qué significan los colores)
 *   fila 3  «Suma de lo visible»: SUBTOTAL de las columnas de dinero (respeta filtros)
 *   fila 4  encabezado de la tabla (congelado)
 *   fila 5+ datos
 */

export const BRAND = "Agencia Demo";

export const COLOR = {
  navy: "FF1E3A5F",
  navyCalc: "FF3D6A9E", // encabezado de columna calculada
  ink: "FF1F2937",
  muted: "FF6B7280",
  faint: "FF9CA3AF",
  line: "FFD1D5DB",
  band: "FFF1F5F9",
  white: "FFFFFFFF",
  tabMain: "FF1E3A5F",
  tabSummary: "FFB45309",
  tabCalendar: "FF0F766E",
  tabRef: "FF94A3B8",
} as const;

/** Estilos de formato condicional (fondo suave + texto oscuro del mismo tono). */
export const TONE = {
  red: { bg: "FFFDE2E1", fg: "FF9B1C1C" },
  green: { bg: "FFDCFCE7", fg: "FF166534" },
  amber: { bg: "FFFEF3C7", fg: "FF92400E" },
  blue: { bg: "FFDBEAFE", fg: "FF1E40AF" },
} as const;
export type Tone = keyof typeof TONE | "muted";

export const HEADER_ROW = 4;
export const FIRST_ROW = HEADER_ROW + 1;

export type ColKind = "text" | "date" | "month" | "money" | "int" | "yesno" | "note" | "link";
export type Val = string | number | Date | null | undefined | { text: string; hyperlink: string };

export interface Column<R> {
  header: string;
  kind?: ColKind;
  width?: number;
  /** Valor de la celda; si la columna tiene fórmula, es el resultado ya calculado (lo que se ve sin recalcular). */
  get?: (r: R) => Val;
  /** Fórmula de columna calculada, sin "=". `[@Col]` = la columna Col de la misma fila. */
  formula?: string;
  /** La fórmula usa otras tablas: en un Excel suelto (una sola hoja) se escribe sólo el valor. */
  cross?: boolean;
  /** Nombre definido de la lista desplegable (hoja Listas). */
  list?: string;
  hidden?: boolean;
  /** Moneda de la fila (formato $ / US$). Por defecto COP. */
  currency?: (r: R) => string;
  /** Mostrar la suma de lo visible arriba del encabezado. */
  subtotal?: boolean;
}

export interface Highlight {
  /** Encabezados a colorear; vacío = toda la fila. */
  cols?: string[];
  /** Fórmula (sin "=") con `{Columna}` = celda de esa columna en la fila. */
  when: string;
  tone: Tone;
}

export interface TableSpec<R> {
  /** Nombre de la tabla de Excel (sin espacios). */
  table: string;
  columns: Column<R>[];
  rows: R[];
  highlights?: Highlight[];
  rowHeight?: (r: R) => number | undefined;
  stripes?: boolean;
  /** No tocar el ancho de las columnas (tabla dentro de una hoja con otro diseño). */
  keepWidths?: boolean;
}

export interface SheetSpec<R> extends TableSpec<R> {
  sheet: string;
  /** Línea corta bajo el título. */
  note?: string;
  /** Columnas fijas a la izquierda al desplazarse. */
  freeze?: number;
  tab?: keyof typeof TAB;
}

const TAB = { main: COLOR.tabMain, summary: COLOR.tabSummary, calendar: COLOR.tabCalendar, ref: COLOR.tabRef };

export interface TableInfo {
  ws: ExcelJS.Worksheet;
  table: string;
  first: number;
  last: number;
  count: number;
  colOf: (header: string) => number;
  letterOf: (header: string) => string;
}

// ── Utilidades ───────────────────────────────────────────────────────────

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "YYYY-MM-DD" → fecha de Excel (medianoche UTC, sin corrimiento de zona). */
export function day(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return new Date(iso.slice(0, 10) + "T00:00:00Z");
}
/** Marca de tiempo del sistema → sólo el día (UTC). */
export function dayOf(d: Date | null | undefined): Date | null {
  return d ? day(d.toISOString().slice(0, 10)) : null;
}
export const yes = (b: boolean) => (b ? "Sí" : "No");

/** Formato de dinero sin decimales para COP (y con 2 para USD). */
export function moneyFormat(currency = "COP"): string {
  if (currency === "USD") return '"US$" #,##0.00;[Red]-"US$" #,##0.00;"US$" 0.00';
  if (currency === "COP") return '"$" #,##0;[Red]-"$" #,##0;"$" 0';
  return `#,##0.00 "${currency}";[Red]-#,##0.00 "${currency}"`;
}
export const DATE_FMT = "dd/mm/yyyy";
export const MONTH_FMT = "[$-240A]mmm yyyy";

/** Escapa un nombre de columna dentro de una referencia estructurada. */
const esc = (h: string) => h.replace(/['#[\]]/g, (c) => `'${c}`);
/** Referencia a una columna de tabla: Tabla[Columna]. */
export const ref = (table: string, header: string) => `${table}[${esc(header)}]`;
/** `[@Col]` → `Tabla[[#This Row],[Col]]` (forma que Excel guarda en el archivo). */
export function expandFormula(formula: string, table: string): string {
  return formula.replace(/\[@([^\]]+)\]/g, (_m, h: string) => `${table}[[#This Row],[${esc(h)}]]`);
}
/** Texto para una fórmula: "Hola" → "\"Hola\"". */
export const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

const DEFAULT_WIDTH: Record<ColKind, number> = {
  text: 18,
  date: 12,
  month: 11,
  money: 15,
  int: 8,
  yesno: 10,
  note: 48,
  link: 14,
};

// ── Libro ────────────────────────────────────────────────────────────────

export class Book {
  readonly wb = new ExcelJS.Workbook();
  readonly patch: XlsxPatch = { calculated: new Map(), names: new Map() };
  private priority = 1;

  /**
   * @param live  true = libro completo (las fórmulas entre hojas funcionan);
   *              false = Excel suelto de una sola hoja (esas columnas van como valor).
   */
  constructor(readonly live: boolean, readonly today: string) {
    this.wb.creator = BRAND;
    this.wb.company = BRAND;
    this.wb.created = new Date();
    this.wb.calcProperties.fullCalcOnLoad = true;
  }

  /** Lista desplegable con nombre (la referencia suele ser una columna de tabla). */
  defineName(name: string, reference: string) {
    this.patch.names.set(name, reference);
  }

  addSheet(name: string, tab: keyof typeof TAB = "main", opts: Partial<ExcelJS.AddWorksheetOptions> = {}) {
    return this.wb.addWorksheet(name.slice(0, 31), {
      properties: { tabColor: { argb: TAB[tab] } },
      views: [{ showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      ...opts,
    });
  }

  /** Franja de marca (fila 1) y nota corta (fila 2). */
  brandHeader(ws: ExcelJS.Worksheet, title: string, width: number, note?: string, detail?: string) {
    const r1 = ws.getRow(1);
    r1.height = 30;
    for (let c = 1; c <= Math.max(width, 2); c++) {
      ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.navy } };
    }
    const a1 = ws.getCell(1, 1);
    a1.value = {
      richText: [
        { text: BRAND.toUpperCase(), font: { bold: true, size: 14, color: { argb: COLOR.white } } },
        { text: `   ${title}`, font: { size: 13, color: { argb: "FFDBE4EF" } } },
        ...(detail ? [{ text: `   ·  ${detail}`, font: { size: 10, color: { argb: "FFB8C7DA" } } }] : []),
      ],
    };
    a1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    if (note) {
      const a2 = ws.getCell(2, 1);
      a2.value = note;
      a2.font = { size: 9, italic: true, color: { argb: COLOR.muted } };
      a2.alignment = { vertical: "middle", indent: 1 };
      ws.getRow(2).height = 18;
    }
  }

  /** Hoja con una sola tabla, título de marca, totales visibles y encabezado congelado. */
  tableSheet<R>(spec: SheetSpec<R>, detail?: string): TableInfo {
    const ws = this.addSheet(spec.sheet, spec.tab ?? "main", {
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });
    const info = this.writeTable(ws, HEADER_ROW, 1, spec);
    this.brandHeader(ws, spec.sheet, spec.columns.filter((c) => !c.hidden).length, spec.note, detail ?? countLabel(info.count));
    this.subtotals(info, spec);
    ws.views = [{ state: "frozen", xSplit: spec.freeze ?? 0, ySplit: HEADER_ROW, showGridLines: false }];
    ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
    return info;
  }

  /** Escribe una tabla de Excel con encabezado en (headerRow, col). */
  writeTable<R>(ws: ExcelJS.Worksheet, headerRow: number, col: number, spec: TableSpec<R>): TableInfo {
    const { columns } = spec;
    const rows = spec.rows;
    const tableFormulas = new Map<string, string>();
    const isFormula = (c: Column<R>) => !!c.formula && (this.live || !c.cross);

    const data = (rows.length ? rows : [null]).map((r) =>
      columns.map((c) => {
        const v = r == null ? null : c.get ? c.get(r) : null;
        if (isFormula(c)) {
          const f = expandFormula(c.formula!, spec.table);
          tableFormulas.set(c.header, f);
          const result = v instanceof Date ? v : v != null && typeof v === "object" ? undefined : v ?? undefined;
          return result === undefined ? { formula: f } : { formula: f, result };
        }
        // Celda vacía de verdad (no texto ""), para que CONTAR.SI.CONJUNTO(…;"") la cuente como vacía.
        return v === "" || v === undefined ? null : v;
      }),
    );

    ws.addTable({
      name: spec.table,
      ref: `${colLetter(col)}${headerRow}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: "TableStyleLight1", showRowStripes: spec.stripes ?? true },
      columns: columns.map((c) => ({ name: c.header, filterButton: true })),
      rows: data as unknown as ExcelJS.CellValue[][],
    });
    if (tableFormulas.size) this.patch.calculated.set(spec.table, tableFormulas);

    const first = headerRow + 1;
    const last = headerRow + data.length;
    const colOf = (h: string) => {
      const i = columns.findIndex((c) => c.header === h);
      if (i < 0) throw new Error(`Columna desconocida «${h}» en la tabla ${spec.table}`);
      return col + i;
    };
    const letterOf = (h: string) => colLetter(colOf(h));

    // Encabezado
    const head = ws.getRow(headerRow);
    head.height = 32;
    columns.forEach((c, i) => {
      const cell = head.getCell(col + i);
      cell.font = { bold: true, size: 10, color: { argb: COLOR.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isFormula(c) ? COLOR.navyCalc : COLOR.navy } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { right: { style: "thin", color: { argb: "FF4B6A8F" } } };
    });

    // Formato de cada columna
    columns.forEach((c, i) => {
      const kind = c.kind ?? "text";
      const column = ws.getColumn(col + i);
      if (!spec.keepWidths) column.width = c.width ?? DEFAULT_WIDTH[kind];
      if (c.hidden) column.hidden = true;
      for (let r = first; r <= last; r++) {
        const cell = ws.getCell(r, col + i);
        const src = rows[r - first];
        cell.font = { size: 10, color: { argb: isFormula(c) ? "FF1E3A5F" : COLOR.ink } };
        switch (kind) {
          case "date":
            cell.numFmt = DATE_FMT;
            cell.alignment = { horizontal: "center", vertical: "middle" };
            break;
          case "month":
            cell.numFmt = MONTH_FMT;
            cell.alignment = { horizontal: "center", vertical: "middle" };
            break;
          case "money":
            cell.numFmt = moneyFormat(src && c.currency ? c.currency(src) : "COP");
            cell.alignment = { vertical: "middle" };
            break;
          case "int":
            cell.numFmt = "#,##0";
            cell.alignment = { horizontal: "center", vertical: "middle" };
            break;
          case "yesno":
            cell.alignment = { horizontal: "center", vertical: "middle" };
            break;
          case "note":
            cell.font = { size: 9, color: { argb: COLOR.muted } };
            cell.alignment = { wrapText: true, vertical: "top" };
            break;
          case "link":
            cell.font = { size: 10, underline: true, color: { argb: "FF1D4ED8" } };
            cell.alignment = { vertical: "middle" };
            break;
          default:
            cell.alignment = { vertical: "middle" };
        }
      }
      if (c.list) {
        rangeValidations(ws).add(`${colLetter(col + i)}${first}:${colLetter(col + i)}${last}`, {
          type: "list",
          allowBlank: true,
          formulae: [c.list],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Valor fuera de la lista",
          error: "Ese valor no está en la hoja Listas. ¿Usarlo de todas formas?",
        });
      }
    });

    if (spec.rowHeight) {
      rows.forEach((r, i) => {
        const h = spec.rowHeight!(r);
        if (h) ws.getRow(first + i).height = h;
      });
    }

    // Formato condicional
    const lastCol = colLetter(col + columns.length - 1);
    for (const h of spec.highlights ?? []) {
      const formula = h.when.replace(/\{([^}]+)\}/g, (_m, name: string) => `$${letterOf(name)}${first}`);
      const refs = h.cols?.length
        ? h.cols.map((name) => `${letterOf(name)}${first}:${letterOf(name)}${last}`)
        : [`${colLetter(col)}${first}:${lastCol}${last}`];
      for (const range of refs) this.highlight(ws, range, formula, h.tone);
    }

    return { ws, table: spec.table, first, last, count: rows.length, colOf, letterOf };
  }

  /** Formato condicional por fórmula sobre un rango. */
  highlight(ws: ExcelJS.Worksheet, range: string, formula: string, tone: Tone) {
    ws.addConditionalFormatting({
      ref: range,
      rules: [{ type: "expression", priority: this.priority++, formulae: [formula], style: toneStyle(tone) }],
    });
  }

  /** Fila 3: suma de lo visible (SUBTOTAL 109) sobre cada columna marcada. */
  subtotals<R>(info: TableInfo, spec: TableSpec<R>) {
    const cols = spec.columns.filter((c) => c.subtotal);
    if (!cols.length) return;
    const row = HEADER_ROW - 1;
    const label = info.ws.getCell(row, 1);
    label.value = "Suma de lo visible ▸";
    label.font = { size: 9, italic: true, color: { argb: COLOR.muted } };
    label.alignment = { vertical: "middle", indent: 1 };
    for (const c of cols) {
      const result = spec.rows.reduce((s, r) => {
        const v = c.get?.(r);
        return s + (typeof v === "number" ? v : 0);
      }, 0);
      const cell = info.ws.getCell(row, info.colOf(c.header));
      cell.value = { formula: `SUBTOTAL(109,${ref(info.table, c.header)})`, result };
      cell.numFmt = moneyFormat(spec.rows[0] && c.currency ? c.currency(spec.rows[0]) : "COP");
      cell.font = { bold: true, size: 10, color: { argb: COLOR.navy } };
      cell.border = { bottom: { style: "thin", color: { argb: COLOR.navy } } };
      cell.alignment = { vertical: "middle" };
    }
    info.ws.getRow(row).height = 20;
  }

  async buffer(): Promise<Buffer> {
    const raw = Buffer.from(await this.wb.xlsx.writeBuffer());
    return patchXlsx(raw, this.patch);
  }
}

/** exceljs admite validaciones por rango («E5:E400») aunque sus tipos no lo declaren. */
function rangeValidations(ws: ExcelJS.Worksheet) {
  return (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
}

export function toneStyle(tone: Tone): Partial<ExcelJS.Style> {
  if (tone === "muted") return { font: { color: { argb: COLOR.faint }, italic: true } };
  const t = TONE[tone];
  return {
    fill: { type: "pattern", pattern: "solid", bgColor: { argb: t.bg } },
    font: { color: { argb: t.fg } },
  };
}

export function countLabel(n: number): string {
  return `${n.toLocaleString("es-CO")} registro${n === 1 ? "" : "s"}`;
}

/** Ancho razonable para una columna de texto según su contenido (con tope). */
export function fitWidth(values: (string | null | undefined)[], header: string, min = 10, max = 40): number {
  let w = Math.min(header.length + 2, 16);
  for (const v of values) {
    const len = (v ?? "").length + 2;
    if (len > w) w = len;
  }
  return Math.max(min, Math.min(w, max));
}
