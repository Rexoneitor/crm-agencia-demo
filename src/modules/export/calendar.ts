import "server-only";
import type ExcelJS from "exceljs";
import { env } from "@/config/env";
import { prisma } from "@/core/db/prisma";
import { label } from "@/core/domain/enums";
import { computeBalance } from "@/core/domain/rules";
import { toMajorNumber } from "@/core/money/money";
import { systemClock } from "@/core/time/clock";
import { contractViewInclude, toContractView } from "@/modules/contracts/view";
import {
  getCalendarReservations,
  type CalendarFilters,
  type CalendarReservation,
} from "@/modules/reservations/service";
import { BRAND, Book, COLOR, day, fitWidth, q, ref, type Column } from "./xlsx-kit";
import { K } from "./data";
import { monthList } from "./summary";

/**
 * Calendario en Excel:
 *  · «Agenda por día»: tabla de Excel (filtros, fechas reales, montos como número)
 *    con una fila por reserva, ordenada por fecha de entrada.
 *  · Una hoja por mes: el mismo almanaque de la pantalla Calendario. Cada reserva
 *    es un recuadro en el día de su entrada, del color de su destino; se puede
 *    escribir encima, cambiar de color o moverla a otro día.
 *  · En el archivo suelto, además, «Resumen por mes» con fórmulas sobre la agenda.
 */

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const INK = COLOR.ink;
const MUTED = COLOR.muted;
const NAVY = COLOR.navy;
const PAY_COLOR: Record<string, string> = {
  sin_pagos: "FFDC2626",
  parcial: "FFF59E0B",
  pagado: "FF16A34A",
  liquidado: "FF2563EB",
};
const STATE_MARK: Record<string, string> = {
  confirmada: "✔",
  pendiente_confirmacion: "○",
  requiere_cambio_fecha: "↻",
  cancelada: "✖",
  finalizada: "✔",
};

const SLOT_HEIGHT = 50; // puntos: 3 líneas por reserva
const COL_WIDTH = 30;

/** Reserva del calendario + importes como número (para que Excel pueda sumarlos). */
export interface CalendarItem extends CalendarReservation {
  price: number;
  balance: number;
  currency: string;
}

// ── Utilidades ───────────────────────────────────────────────────────────

/** "#rrggbb" → mezcla con blanco (t=0 blanco, t=1 color puro), en formato ARGB de Excel. */
function tint(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  const h = m ? m[1] : "2563eb";
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixed = ch.map((v) => Math.round(255 + (v - 255) * t));
  return "FF" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const weekday = (iso: string) => WEEKDAYS[(utc(iso).getUTCDay() + 6) % 7];

function chipCell(cell: ExcelJS.Cell, r: CalendarReservation) {
  const cancelled = r.state === "cancelada";
  const pending = r.state === "pendiente_confirmacion";
  const mark = STATE_MARK[r.state] ?? "○";
  const strike = cancelled;
  const ink = cancelled ? MUTED : INK;
  const line2 = [r.destination, r.hotel].filter(Boolean).join(" · ");
  // En el recuadro, etiqueta corta (el punto azul ya indica comisión retenida).
  const pay = r.paymentState === "liquidado" ? "Pagado" : label(r.paymentState);
  cell.value = {
    richText: [
      { text: `${mark} ${r.client}`, font: { bold: true, size: 10, color: { argb: ink }, strike } },
      { text: `\n${line2}`, font: { size: 9, color: { argb: ink }, strike } },
      { text: `\n${r.passengers} pax · `, font: { size: 9, color: { argb: ink }, strike } },
      { text: "●", font: { size: 11, color: { argb: PAY_COLOR[r.paymentState] ?? MUTED } } },
      { text: ` ${pay} · ${r.number}`, font: { size: 9, color: { argb: ink }, strike } },
    ],
  };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  if (!cancelled) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(r.color, 0.16) } };
  const side = { style: pending ? ("dashed" as const) : ("thin" as const), color: { argb: tint(r.color, 0.7) } };
  cell.border = {
    top: side,
    bottom: side,
    right: side,
    left: { style: "thick", color: { argb: tint(r.color, cancelled ? 0.35 : 1) } },
  };
}

// ── Hoja de un mes (almanaque) ───────────────────────────────────────────

function addMonthSheet(book: Book, y: number, m: number, all: CalendarItem[]) {
  const prefix = `${y}-${pad(m + 1)}`;
  const items = all
    .filter((r) => r.checkIn.startsWith(prefix))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.destination.localeCompare(b.destination) || a.client.localeCompare(b.client));
  const byDay = new Map<string, CalendarItem[]>();
  for (const r of items) byDay.set(r.checkIn, [...(byDay.get(r.checkIn) ?? []), r]);

  const ws = book.addSheet(`${MONTHS_SHORT[m]} ${y}`, "calendar", {
    pageSetup: { orientation: "landscape", paperSize: 8 as ExcelJS.PaperSize, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  for (let c = 1; c <= 7; c++) ws.getColumn(c).width = COL_WIDTH;

  // Marca
  book.brandHeader(ws, "Calendario de reservas", 7);
  ws.getCell(2, 1).value = null;
  ws.getRow(2).height = 6;

  // Título del mes
  let row = 3;
  ws.mergeCells(row, 1, row, 7);
  const title = ws.getCell(row, 1);
  title.value = `${MONTHS[m].toUpperCase()} ${y}`;
  title.font = { bold: true, size: 22, color: { argb: NAVY } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 38;

  // Resumen del mes
  row++;
  const count = (st: string) => items.filter((r) => r.state === st).length;
  const pax = items.filter((r) => r.state !== "cancelada").reduce((s, r) => s + r.passengers, 0);
  ws.mergeCells(row, 1, row, 7);
  const sum = ws.getCell(row, 1);
  sum.value = items.length
    ? `${items.length} reserva${items.length === 1 ? "" : "s"}  ·  ${count("confirmada") + count("finalizada")} confirmada(s)  ·  ${count("pendiente_confirmacion")} por confirmar  ·  ${count("cancelada")} cancelada(s)  ·  ${pax} pasajeros`
    : "Sin reservas este mes";
  sum.font = { bold: true, size: 11, color: { argb: INK } };
  sum.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 22;

  // Leyenda de estados
  row++;
  ws.mergeCells(row, 1, row, 7);
  const leg = ws.getCell(row, 1);
  const lf = { size: 9, color: { argb: MUTED } };
  const dot = (state: string) => ({ text: "●", font: { size: 11, color: { argb: PAY_COLOR[state] } } });
  leg.value = {
    richText: [
      { text: "✔ confirmada     ○ por confirmar (borde punteado)     ↻ requiere cambio de fecha     ✖ cancelada (tachada)          Pago:  ", font: lf },
      dot("sin_pagos"), { text: " sin pagos   ", font: lf },
      dot("parcial"), { text: " parcial   ", font: lf },
      dot("pagado"), { text: " pagado   ", font: lf },
      dot("liquidado"), { text: " pagado con comisión retenida", font: lf },
    ],
  };
  leg.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 18;

  // Leyenda de destinos (un recuadro de color por destino del mes)
  const dests = new Map<string, string>();
  for (const r of items) dests.set(r.destination, r.color);
  const destList = [...dests.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 0; i < destList.length; i += 7) {
    row++;
    for (let j = 0; j < 7; j++) {
      const d = destList[i + j];
      if (!d) continue;
      const c = ws.getCell(row, j + 1);
      c.value = d[0];
      c.font = { bold: true, size: 10, color: { argb: INK } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(d[1], 0.25) } };
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.border = { left: { style: "thick", color: { argb: tint(d[1], 1) } } };
    }
    ws.getRow(row).height = 20;
  }

  // Encabezado de días
  row++;
  for (let c = 0; c < 7; c++) {
    const cell = ws.getCell(row, c + 1);
    cell.value = WEEKDAYS[c];
    cell.font = { bold: true, size: 11, color: { argb: COLOR.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c >= 5 ? COLOR.navyCalc : NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  ws.getRow(row).height = 24;
  const headerRow = row;

  // Semanas
  const first = utc(`${prefix}-01`);
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoOf(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const thin = { style: "thin" as const, color: { argb: COLOR.line } };
  for (let w = 0; w < cells.length / 7; w++) {
    const week = cells.slice(w * 7, w * 7 + 7);
    row++;
    // fila con el número del día
    for (let c = 0; c < 7; c++) {
      const iso = week[c];
      const cell = ws.getCell(row, c + 1);
      if (iso) {
        const today = iso === book.today;
        cell.value = Number(iso.slice(-2));
        cell.font = { bold: true, size: 12, color: { argb: today ? COLOR.white : byDay.has(iso) ? NAVY : MUTED } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: today ? "FF2563EB" : c >= 5 ? "FFF3F4F6" : "FFFAFAFA" } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
      }
      cell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      cell.border = { top: thin, left: thin, right: thin };
    }
    ws.getRow(row).height = 20;
    // filas de reservas (tantas como la mayor cantidad en un día de esa semana, mínimo 2)
    const slots = Math.max(2, ...week.map((iso) => (iso ? byDay.get(iso)?.length ?? 0 : 0)));
    for (let s = 0; s < slots; s++) {
      row++;
      ws.getRow(row).height = SLOT_HEIGHT;
      for (let c = 0; c < 7; c++) {
        const iso = week[c];
        const cell = ws.getCell(row, c + 1);
        const r = iso ? byDay.get(iso)?.[s] : undefined;
        if (r) {
          chipCell(cell, r);
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: iso ? "FFFFFFFF" : "FFEDEDED" } };
          cell.border = { left: thin, right: thin, bottom: s === slots - 1 ? thin : undefined };
        }
      }
    }
  }

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow }];
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
}

// ── Agenda por día (tabla) ───────────────────────────────────────────────

function addAgendaSheet(book: Book, all: CalendarItem[]) {
  const rows = [...all].sort(
    (a, b) => a.checkIn.localeCompare(b.checkIn) || a.destination.localeCompare(b.destination) || a.client.localeCompare(b.client),
  );
  const cur = (r: CalendarItem) => r.currency;
  const columns: Column<CalendarItem>[] = [
    { header: "Fecha", kind: "date", get: (r) => day(r.checkIn) },
    { header: "Día", get: (r) => weekday(r.checkIn), width: 10 },
    { header: "Cliente", get: (r) => r.client, width: fitWidth(rows.map((r) => r.client), "Cliente", 18, 34) },
    { header: "Destino", get: (r) => r.destination, width: fitWidth(rows.map((r) => r.destination), "Destino", 12, 22) },
    { header: "Hotel", get: (r) => r.hotel, width: fitWidth(rows.map((r) => r.hotel), "Hotel", 12, 26) },
    { header: "Salida", kind: "date", get: (r) => day(r.checkOut) },
    {
      header: "Noches",
      kind: "int",
      width: 8,
      get: (r) => Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86_400_000),
      formula: `IF(OR([@Fecha]="",[@Salida]=""),"",[@Salida]-[@Fecha])`,
    },
    { header: "Pax", kind: "int", get: (r) => r.passengers, width: 6 },
    { header: "Vendedor", get: (r) => r.seller, width: 16 },
    { header: "Estado reserva", get: (r) => label(r.state), width: 22 },
    { header: "Pago", get: (r) => label(r.paymentState), width: 24 },
    { header: "Precio", kind: "money", get: (r) => r.price, currency: cur, subtotal: true },
    { header: "Saldo", kind: "money", get: (r) => r.balance, currency: cur, subtotal: true },
    { header: "Contrato", get: (r) => r.number, width: 17 },
    { header: "Grupo", get: (r) => r.group, width: 14 },
  ];
  const info = book.tableSheet(
    {
      sheet: "Agenda por día",
      table: "Agenda",
      tab: "calendar",
      rows,
      columns,
      freeze: 3,
      note: "Foto del calendario al descargar (los cambios se hacen en Contratos). Ámbar: por confirmar · Azul: entra en los próximos 15 días · Gris: cancelada · Color del destino a la izquierda.",
      highlights: [
        { when: `{Estado reserva}=${q(K.resCancelada)}`, tone: "muted" },
        { cols: ["Estado reserva"], when: `OR({Estado reserva}=${q(K.resPendiente)},{Estado reserva}=${q(K.resCambio)})`, tone: "amber" },
        { cols: ["Estado reserva"], when: `{Estado reserva}=${q(K.resConfirmada)}`, tone: "green" },
        { cols: ["Fecha", "Día"], when: `AND({Fecha}>=TODAY(),{Fecha}<=TODAY()+15,{Estado reserva}<>${q(K.resCancelada)})`, tone: "blue" },
        { cols: ["Pago"], when: `{Pago}=${q(K.sinPagos)}`, tone: "red" },
        { cols: ["Pago"], when: `{Pago}=${q(K.parcial)}`, tone: "amber" },
        { cols: ["Pago"], when: `LEFT({Pago},6)="Pagado"`, tone: "green" },
        { cols: ["Saldo"], when: `AND({Saldo}>0,{Estado reserva}<>${q(K.resCancelada)})`, tone: "red" },
      ],
    },
  );
  // Franja con el color del destino (como en la pantalla Calendario).
  const destCol = info.colOf("Destino");
  rows.forEach((r, i) => {
    const cell = info.ws.getCell(info.first + i, destCol);
    cell.border = { left: { style: "thick", color: { argb: tint(r.color, r.state === "cancelada" ? 0.35 : 1) } } };
  });
  return info;
}

/** Resumen por mes con fórmulas sobre la tabla Agenda (sólo en el archivo de calendario). */
function addCalendarSummary(book: Book, all: CalendarItem[]) {
  const A = (c: string) => ref("Agenda", c);
  const M = `${A("Fecha")},">="&[@Mes],${A("Fecha")},"<="&EOMONTH([@Mes],0)`;
  const months = monthList(all);
  const inM = (m: string) => all.filter((r) => r.checkIn.slice(0, 7) === m.slice(0, 7));
  const by = (m: string, st: string) => inM(m).filter((r) => label(r.state) === st).length;
  const cur = all[0]?.currency ?? "COP";
  const int = (header: string, get: (m: string) => number, formula: string): Column<string> => ({ header, kind: "int", get, formula, width: 12 });
  book.tableSheet<string>(
    {
      sheet: "Resumen por mes",
      table: "ResumenCalendario",
      tab: "summary",
      rows: months,
      note: "Se calcula con fórmulas sobre la hoja «Agenda por día».",
      columns: [
        { header: "Mes", kind: "month", get: (m) => day(m), width: 12 },
        int("Reservas", (m) => inM(m).length, `COUNTIFS(${M})`),
        int("Confirmadas", (m) => by(m, K.resConfirmada), `COUNTIFS(${M},${A("Estado reserva")},${q(K.resConfirmada)})`),
        int("Por confirmar", (m) => by(m, K.resPendiente), `COUNTIFS(${M},${A("Estado reserva")},${q(K.resPendiente)})`),
        int("Canceladas", (m) => by(m, K.resCancelada), `COUNTIFS(${M},${A("Estado reserva")},${q(K.resCancelada)})`),
        int(
          "Pasajeros",
          (m) => inM(m).filter((r) => r.state !== "cancelada").reduce((s, r) => s + r.passengers, 0),
          `SUMIFS(${A("Pax")},${M},${A("Estado reserva")},${q("<>" + K.resCancelada)})`,
        ),
        {
          header: "Saldo pendiente",
          kind: "money",
          currency: () => cur,
          width: 16,
          subtotal: true,
          get: (m) => inM(m).filter((r) => r.state !== "cancelada" && r.balance > 0).reduce((s, r) => s + r.balance, 0),
          formula: `SUMIFS(${A("Saldo")},${M},${A("Saldo")},">0",${A("Estado reserva")},${q("<>" + K.resCancelada)})`,
        },
      ],
      highlights: [
        { when: `AND({Mes}<=TODAY(),EOMONTH({Mes},0)>=TODAY())`, tone: "blue" },
        { cols: ["Por confirmar"], when: `{Por confirmar}>0`, tone: "amber" },
      ],
    },
    `${all.length} reservas`,
  );
}

// ── API ──────────────────────────────────────────────────────────────────

/** Meses a dibujar: del primero al último con reservas (sin huecos si el rango es razonable). */
function monthsToDraw(items: CalendarItem[]): { y: number; m: number }[] {
  const keys = [...new Set(items.map((r) => r.checkIn.slice(0, 7)))].sort();
  if (keys.length === 0) return [];
  const toIdx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
  const first = toIdx(keys[0]);
  const last = toIdx(keys[keys.length - 1]);
  const idxs: number[] = [];
  if (last - first <= 24) for (let i = first; i <= last; i++) idxs.push(i);
  else idxs.push(...keys.map(toIdx));
  return idxs.map((i) => ({ y: Math.floor(i / 12), m: i % 12 }));
}

/** Agrega al libro la hoja de agenda y una hoja por cada mes con reservas. */
export function addCalendarSheets(book: Book, items: CalendarItem[]) {
  addAgendaSheet(book, items);
  for (const { y, m } of monthsToDraw(items)) addMonthSheet(book, y, m, items);
}

/** Reservas del calendario con precio y saldo como número. */
export async function calendarItems(filters: CalendarFilters = {}): Promise<CalendarItem[]> {
  const items = await getCalendarReservations(filters);
  const rows = await prisma.contract.findMany({
    where: { id: { in: items.map((i) => i.contractId) } },
    include: contractViewInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((i) => {
    const row = byId.get(i.contractId);
    const view = row ? toContractView(row) : null;
    return {
      ...i,
      currency: row?.currency ?? "COP",
      price: view ? toMajorNumber(view.price) : 0,
      balance: view ? toMajorNumber(computeBalance(view)) : 0,
    };
  });
}

export function todayIso(): string {
  return systemClock(env.APP_TIMEZONE).today();
}

/** Descarga sólo el calendario (respeta los filtros que tenga la pantalla Calendario). */
export async function exportCalendarXlsx(
  filters: CalendarFilters = {},
): Promise<{ filename: string; buffer: Buffer }> {
  const items = await calendarItems(filters);
  const book = new Book(true, todayIso());
  book.wb.title = `${BRAND} — Calendario de reservas`;
  addCalendarSummary(book, items);
  addCalendarSheets(book, items);
  return { filename: `DEMO-calendario-reservas-${book.today}.xlsx`, buffer: await book.buffer() };
}

