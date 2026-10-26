import "server-only";
import type ExcelJS from "exceljs";
import { label, RESERVATION_STATE } from "@/core/domain/enums";
import { BRAND, COLOR, HEADER_ROW, TONE, day, moneyFormat, q, ref, type Book, type Column } from "./xlsx-kit";
import { K, REFUND_OPEN_LABELS, operationNumbers, summaryNumbers, type ContractRow, type Core } from "./data";
import type { ListDef } from "./sheets";

/**
 * Hoja «Resumen» (indicadores con fórmulas sobre las tablas, se actualizan
 * solos al editar), hoja «Listas» (valores de los desplegables) y hoja
 * «Cómo usar».
 */

const C = (col: string) => ref("Contratos", col);
const P = (col: string) => ref("Pagos", col);
const R = (col: string) => ref("Reembolsos", col);

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function section(ws: ExcelJS.Worksheet, row: number, col: number, width: number, text: string) {
  for (let c = col; c < col + width; c++) {
    ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.navyCalc } };
  }
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: COLOR.white } };
  cell.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(row).height = 22;
}

interface Kpi {
  label: string;
  formula: string;
  result: number;
  kind: "money" | "int";
  hint?: string;
  tone?: keyof typeof TONE;
  currency?: string;
}

function kpiRows(book: Book, ws: ExcelJS.Worksheet, start: number, items: Kpi[]): number {
  let row = start;
  items.forEach((k, i) => {
    const a = ws.getCell(row, 1);
    const b = ws.getCell(row, 2);
    const c = ws.getCell(row, 3);
    a.value = k.label;
    a.font = { size: 10, color: { argb: COLOR.ink } };
    a.alignment = { vertical: "middle", indent: 1 };
    b.value = { formula: k.formula, result: k.result };
    b.numFmt = k.kind === "money" ? moneyFormat(k.currency) : "#,##0";
    b.font = { bold: true, size: 12, color: { argb: COLOR.navy } };
    b.alignment = { vertical: "middle", horizontal: "right" };
    if (k.hint) {
      c.value = k.hint;
      c.font = { size: 8, italic: true, color: { argb: COLOR.faint } };
      c.alignment = { vertical: "middle", wrapText: true };
    }
    const fill = i % 2 === 0 ? COLOR.band : COLOR.white;
    for (const cell of [a, b, c]) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = { bottom: { style: "hair", color: { argb: COLOR.line } } };
    }
    if (k.tone) book.highlight(ws, `A${row}:B${row}`, `$B${row}>0`, k.tone);
    ws.getRow(row).height = 21;
    row++;
  });
  return row;
}

interface MonthRow {
  month: string;
  total: number;
  confirmed: number;
  toConfirm: number;
  cancelled: number;
  travelled: number;
  pax: number;
  value: number;
  owed: number;
}

export function addSummarySheet(book: Book, core: Core, today: string) {
  const ws = book.addSheet("Resumen", "summary", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [44, 18, 16, 3].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  book.brandHeader(
    ws,
    "Resumen",
    14,
    "Todo se calcula con fórmulas sobre las hojas Contratos, Pagos y Reembolsos: si editas o agregas filas allí, este resumen se actualiza solo. Ayuda en la hoja «Cómo usar».",
    `al ${longDate(today)}`,
  );

  const multi = core.currencies.length > 1;
  let row = HEADER_ROW;
  const notCancelled = `${C("Estado contrato")},${q("<>" + K.cancelado)}`;

  for (const cur of core.currencies) {
    const n = summaryNumbers(core, today, cur);
    const cc = multi ? `,${C("Moneda")},${q(cur)}` : "";
    const pc = multi ? `,${P("Moneda")},${q(cur)}` : "";
    const sum = (col: string) => (multi ? `SUMIFS(${C(col)}${cc})` : `SUM(${C(col)})`);
    section(ws, row, 1, 3, multi ? `Dinero (${cur})` : "Dinero");
    row = kpiRows(book, ws, row + 1, [
      { label: "Ventas (precio de los contratos)", formula: `SUMIFS(${C("Precio")},${notCancelled}${cc})`, result: n.sales, kind: "money", hint: "sin cancelados", currency: cur },
      { label: "Cobrado por DEMO", formula: sum("Recibido DEMO"), result: n.received, kind: "money", hint: "lo que entró a la agencia", currency: cur },
      { label: "Retenido por los vendedores", formula: sum("Retenido vendedor"), result: n.retained, kind: "money", hint: "se lo quedó el vendedor", currency: cur },
      { label: "Descuentos y castigos", formula: sum("Descuentos"), result: n.discounts, kind: "money", currency: cur },
      { label: "Reembolsado a clientes (en contratos)", formula: sum("Reembolsado"), result: n.refunded, kind: "money", currency: cur },
      {
        label: "Saldo por cobrar",
        formula: `SUMIFS(${C("Saldo")},${C("Saldo")},">0",${notCancelled}${cc})`,
        result: n.owed,
        kind: "money",
        tone: "red",
        hint: "contratos no cancelados",
        currency: cur,
      },
      { label: "Contratos con saldo pendiente", formula: `COUNTIFS(${C("Saldo")},">0",${notCancelled}${cc})`, result: n.owingCount, kind: "int" },
      {
        label: "Pagos recibidos este mes",
        formula: `SUMIFS(${P("Monto")},${P("Tipo")},${q(K.pago)},${P("Fecha")},">="&(EOMONTH(TODAY(),-1)+1)${pc})`,
        result: n.receivedThisMonth,
        kind: "money",
        hint: "hoja Pagos",
        currency: cur,
      },
      {
        label: "Reembolsos pendientes de pagar",
        formula: multi ? `SUMIFS(${R("Pendiente")},${R("Moneda")},${q(cur)})` : `SUM(${R("Pendiente")})`,
        result: n.refundsPending,
        kind: "money",
        tone: "red",
        currency: cur,
      },
    ]);
    row++;
  }

  const o = operationNumbers(core, today);
  section(ws, row, 1, 3, "Reservas y pendientes");
  row = kpiRows(book, ws, row + 1, [
    { label: "Contratos en la lista", formula: `COUNTA(${C("Contrato")})`, result: o.contracts, kind: "int" },
    { label: "Activos", formula: `COUNTIFS(${C("Estado contrato")},${q(K.activo)})`, result: o.active, kind: "int" },
    { label: "Ya viajaron", formula: `COUNTIFS(${C("Ya viajó")},"Sí")`, result: o.travelled, kind: "int" },
    { label: "Cancelados", formula: `COUNTIFS(${C("Estado contrato")},${q(K.cancelado)})`, result: o.cancelled, kind: "int" },
    {
      label: "Viajan en los próximos 15 días",
      formula: `COUNTIFS(${C("Entrada")},">="&TODAY(),${C("Entrada")},"<="&(TODAY()+15),${C("Estado reserva")},${q("<>" + K.resCancelada)})`,
      result: o.next15,
      kind: "int",
      tone: "blue",
    },
    {
      label: "Reservas por confirmar",
      formula: `COUNTIFS(${C("Estado reserva")},${q(K.resPendiente)},${notCancelled})`,
      result: o.toConfirm,
      kind: "int",
      tone: "amber",
    },
    {
      label: "Requieren cambio de fecha",
      formula: `COUNTIFS(${C("Estado reserva")},${q(K.resCambio)},${notCancelled})`,
      result: o.dateChange,
      kind: "int",
      tone: "amber",
    },
    {
      label: "Fecha de viaje pasada sin marcar «Ya viajó»",
      formula: `COUNTIFS(${C("Salida")},"<"&TODAY(),${C("Ya viajó")},"No",${C("Estado contrato")},${q(K.activo)},${C("Estado reserva")},${q("<>" + K.resCancelada)})`,
      result: o.pastNotMarked,
      kind: "int",
      tone: "amber",
    },
    { label: "Contratos sin vendedor", formula: `COUNTIFS(${C("Vendedor")},"",${notCancelled})`, result: o.noSeller, kind: "int", tone: "amber", hint: "sin cancelados" },
    {
      label: "Pagos sin comprobante",
      formula: `COUNTIFS(${P("Tipo")},${q(K.pago)},${P("Comprobante")},"No")`,
      result: o.paymentsNoReceipt,
      kind: "int",
      tone: "red",
    },
    {
      label: "Reembolsos abiertos",
      formula: `SUMPRODUCT(COUNTIFS(${R("Estado")},{${REFUND_OPEN_LABELS.map(q).join(",")}}))`,
      result: o.refundsOpen,
      kind: "int",
      hint: "solicitado, en trámite o aprobado",
    },
    {
      label: "Reembolsos con plazo vencido",
      formula: `COUNTIFS(${R("Pendiente")},">0",${R("Plazo")},"<"&TODAY())`,
      result: o.refundsOverdue,
      kind: "int",
      tone: "red",
    },
  ]);
  row++;

  // Por estado de reserva
  const states = RESERVATION_STATE.map((s) => label(s));
  title(ws, row, 1, "Por estado de reserva");
  const byState = (s: string) => core.contracts.filter((c) => c.resState === s);
  const stInfo = book.writeTable(ws, row + 1, 1, {
    table: "ResumenEstados",
    rows: states,
    keepWidths: true,
    columns: [
      { header: "Estado de reserva", get: (s) => s },
      { header: "Contratos", kind: "int", get: (s) => byState(s).length, formula: `COUNTIFS(${C("Estado reserva")},[@Estado de reserva])` },
      {
        header: "Pasajeros",
        kind: "int",
        get: (s) => byState(s).reduce((t, c) => t + (c.pax ?? 0), 0),
        formula: `SUMIFS(${C("Pax")},${C("Estado reserva")},[@Estado de reserva])`,
      },
    ],
  });
  row = stInfo.last + 2;

  // Por empresa
  title(ws, row, 1, multi ? `Por empresa (${core.currencies[0]})` : "Por empresa");
  const main = core.currencies[0];
  const cs = (issuer: string) => core.contracts.filter((c) => c.issuer === issuer && (!multi || c.currency === main));
  const mc = multi ? `,${C("Moneda")},${q(main)}` : "";
  const empInfo = book.writeTable(ws, row + 1, 1, {
    table: "ResumenEmpresas",
    rows: core.issuers,
    keepWidths: true,
    columns: [
      { header: "Empresa", get: (s) => s },
      { header: "Contratos", kind: "int", get: (s) => cs(s).length, formula: `COUNTIFS(${C("Empresa")},[@Empresa]${mc})` },
      {
        header: "Saldo por cobrar",
        kind: "money",
        currency: () => main,
        get: (s) => cs(s).filter((c) => c.lifeState !== K.cancelado && c.balance > 0).reduce((t, c) => t + c.balance, 0),
        formula: `SUMIFS(${C("Saldo")},${C("Empresa")},[@Empresa],${C("Saldo")},">0",${notCancelled}${mc})`,
      },
    ],
  });
  row = empInfo.last + 1;

  // Reservas por mes (a la derecha)
  const months = monthList(core.contracts);
  const inMonth = (c: ContractRow, m: string) => !!c.checkIn && c.checkIn >= m && c.checkIn <= endOfMonth(m);
  const monthRows: MonthRow[] = months.map((m) => {
    const xs = core.contracts.filter((c) => inMonth(c, m));
    const value = xs.filter((c) => c.lifeState !== K.cancelado && (!multi || c.currency === main));
    return {
      month: m,
      total: xs.length,
      confirmed: xs.filter((c) => c.resState === K.resConfirmada).length,
      toConfirm: xs.filter((c) => c.resState === K.resPendiente).length,
      cancelled: xs.filter((c) => c.resState === K.resCancelada).length,
      travelled: xs.filter((c) => c.travelled === "Sí").length,
      pax: xs.filter((c) => c.resState !== K.resCancelada).reduce((t, c) => t + (c.pax ?? 0), 0),
      value: value.reduce((t, c) => t + c.price, 0),
      owed: value.filter((c) => c.balance > 0).reduce((t, c) => t + c.balance, 0),
    };
  });
  const M = `${C("Entrada")},">="&[@Mes],${C("Entrada")},"<="&EOMONTH([@Mes],0)`;
  const int = (header: string, get: (r: MonthRow) => number, formula: string): Column<MonthRow> => ({ header, kind: "int", get, formula, width: 11 });
  title(ws, HEADER_ROW, 5, multi ? `Reservas por mes de entrada (valores en ${main})` : "Reservas por mes de entrada");
  const mInfo = book.writeTable(ws, HEADER_ROW + 1, 5, {
    table: "ResumenMeses",
    rows: monthRows,
    columns: [
      { header: "Mes", kind: "month", get: (r) => day(r.month), width: 11 },
      int("Reservas", (r) => r.total, `COUNTIFS(${M})`),
      int("Confirmadas", (r) => r.confirmed, `COUNTIFS(${M},${C("Estado reserva")},${q(K.resConfirmada)})`),
      int("Por confirmar", (r) => r.toConfirm, `COUNTIFS(${M},${C("Estado reserva")},${q(K.resPendiente)})`),
      int("Canceladas", (r) => r.cancelled, `COUNTIFS(${M},${C("Estado reserva")},${q(K.resCancelada)})`),
      int("Ya viajaron", (r) => r.travelled, `COUNTIFS(${M},${C("Ya viajó")},"Sí")`),
      int("Pasajeros", (r) => r.pax, `SUMIFS(${C("Pax")},${M},${C("Estado reserva")},${q("<>" + K.resCancelada)})`),
      {
        header: "Valor",
        kind: "money",
        currency: () => main,
        get: (r) => r.value,
        formula: `SUMIFS(${C("Precio")},${M},${notCancelled}${mc})`,
        width: 15,
      },
      {
        header: "Saldo pendiente",
        kind: "money",
        currency: () => main,
        get: (r) => r.owed,
        formula: `SUMIFS(${C("Saldo")},${M},${C("Saldo")},">0",${notCancelled}${mc})`,
        width: 15,
      },
    ],
    highlights: [
      { when: `AND({Mes}<=TODAY(),EOMONTH({Mes},0)>=TODAY())`, tone: "blue" },
      { cols: ["Por confirmar"], when: `{Por confirmar}>0`, tone: "amber" },
      { cols: ["Saldo pendiente"], when: `{Saldo pendiente}>0`, tone: "red" },
    ],
  });
  // Alto de fila parejo en todo el bloque (KPIs a la izquierda, meses a la derecha).
  for (let r = HEADER_ROW + 1; r <= Math.max(row, mInfo.last); r++) {
    const h = ws.getRow(r).height;
    if (!h || h < 20) ws.getRow(r).height = 20;
  }
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  return { months: monthRows, lastRow: Math.max(row, mInfo.last) };
}

function title(ws: ExcelJS.Worksheet, row: number, col: number, text: string) {
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: COLOR.navy } };
  cell.alignment = { vertical: "bottom" };
  ws.getRow(row).height = Math.max(ws.getRow(row).height ?? 15, 20);
}

const endOfMonth = (m: string) => {
  const d = new Date(m + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

/** Primer día de cada mes entre la primera y la última entrada (sólo meses con datos si el rango es enorme). */
export function monthList(rows: { checkIn: string | null }[]): string[] {
  const keys = [...new Set(rows.map((r) => r.checkIn?.slice(0, 7)).filter((k): k is string => !!k))].sort();
  if (!keys.length) return [];
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
  const first = idx(keys[0]);
  const last = idx(keys[keys.length - 1]);
  const list = last - first <= 36 ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : keys.map(idx);
  return list.map((i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`);
}

// ── Listas ───────────────────────────────────────────────────────────────

export function addListsSheet(book: Book, lists: ListDef[]) {
  const ws = book.addSheet("Listas", "ref");
  book.brandHeader(
    ws,
    "Listas",
    lists.length * 2,
    book.live
      ? "Valores de las listas desplegables. Para agregar uno, escríbelo debajo del último de su columna. Vendedores y destinos se toman de sus propias hojas."
      : "Valores de las listas desplegables. Para agregar uno, escríbelo debajo del último de su columna.",
  );
  let col = 1;
  for (const l of lists) {
    if (book.live && l.liveRef) {
      book.defineName(l.name, l.liveRef);
      continue;
    }
    book.writeTable(ws, HEADER_ROW, col, {
      table: l.table,
      rows: l.values,
      columns: [{ header: l.header, get: (v) => v, width: Math.max(14, Math.min(30, Math.max(l.header.length, ...l.values.map((v) => v.length)) + 3)) }],
    });
    book.defineName(l.name, ref(l.table, l.header));
    ws.getColumn(col + 1).width = 3;
    col += 2;
  }
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }];
}

// ── Cómo usar ────────────────────────────────────────────────────────────

export function addHelpSheet(book: Book, counts: { sheet: string; count: number }[], withImages: boolean) {
  const ws = book.addSheet("Cómo usar", "ref");
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 100;
  book.brandHeader(ws, "Cómo usar este Excel", 2);
  let row = 3;
  const put = (a: string, b: string, opts: { head?: boolean; tone?: keyof typeof TONE } = {}) => {
    const ca = ws.getCell(row, 1);
    const cb = ws.getCell(row, 2);
    ca.value = a;
    cb.value = b;
    ca.font = { bold: true, size: opts.head ? 11 : 10, color: { argb: opts.head ? COLOR.white : COLOR.ink } };
    cb.font = { size: 10, color: { argb: opts.head ? COLOR.white : COLOR.ink }, bold: !!opts.head };
    cb.alignment = { wrapText: true, vertical: "top" };
    ca.alignment = { vertical: "top", indent: 1 };
    if (opts.head) for (const c of [ca, cb]) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.navy } };
    if (opts.tone) ca.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TONE[opts.tone].bg } };
    if (opts.tone) ca.font = { bold: true, size: 10, color: { argb: TONE[opts.tone].fg } };
    row++;
  };
  put("Qué es", "", { head: true });
  put(BRAND, "Copia completa y editable del CRM. Se puede seguir trabajando sólo con este archivo (Excel, LibreOffice o Google Sheets).");
  put("Lo importante", "Contratos, Pagos y Reembolsos son las hojas «madre». Resumen, Vendedores y los totales de Contratos se calculan solos con fórmulas.");
  row++;
  put("Tareas frecuentes", "", { head: true });
  put("Registrar un pago", "Hoja Pagos → escribe en la primera fila vacía (fecha, contrato, tipo «Pago recibido», monto, ¿comprobante?). El saldo del contrato y el Resumen cambian solos.");
  put("Lo que se quedó el vendedor", "Otra fila en Pagos con tipo «Comisión retenida» y el monto que se quedó.");
  put("Contrato nuevo", "Hoja Contratos → primera fila vacía. Las columnas de encabezado azul claro (Recibido, Saldo, Estado de pago…) se llenan solas.");
  put("Confirmar / ya viajó", "Cambia «Estado reserva» o «Ya viajó» con la lista desplegable de la celda.");
  put("Filtrar", "Flechas del encabezado de cada tabla (por vendedor, estado, mes…). La fila «Suma de lo visible» suma sólo lo filtrado.");
  put("Listas desplegables", "Sus valores están en la hoja Listas (vendedores y destinos en sus propias hojas): agrega allí y aparecen en las listas.");
  row++;
  put("Colores", "", { head: true });
  put("Rojo", "Falta algo: saldo por cobrar, pago sin comprobante, plazo vencido.", { tone: "red" });
  put("Ámbar", "Por revisar: reserva por confirmar, pago parcial, viaje pasado sin marcar «Ya viajó».", { tone: "amber" });
  put("Verde", "Listo: pagado, confirmada, ya viajó.", { tone: "green" });
  put("Azul", "Viaja en los próximos 15 días / mes en curso.", { tone: "blue" });
  put("Gris", "Cancelado, inactivo o sólo de consulta.");
  row++;
  put("Además", "", { head: true });
  put("Calendario", "«Agenda por día» y una hoja por mes: el almanaque con cada reserva en su día, del color de su destino (es una foto al descargar; los cambios se hacen en Contratos).");
  put("Comprobantes", withImages ? "Las fotos de los pagos están en la hoja Comprobantes." : "Las fotos de los pagos están en la carpeta de archivos del respaldo.");
  put("PDF de los contratos", "No caben en un Excel: están en el paquete .zip (Sistema → paquete completo).");
  row++;
  put("Hoja", "Registros", { head: true });
  for (const c of counts) put(c.sheet, c.count.toLocaleString("es-CO"));
}
