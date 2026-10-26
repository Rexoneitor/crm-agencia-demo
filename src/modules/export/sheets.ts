import { sortEs, sortedEs, sortActiveThenName } from "@/core/sort";
import "server-only";
import { prisma } from "@/core/db/prisma";
import { label, CONTRACT_LIFECYCLE, CONTRACT_MODALITY, LEDGER_KIND, PAYMENT_METHOD, REFUND_STATE, RESERVATION_STATE } from "@/core/domain/enums";
import { storage } from "@/core/adapters/storage";
import { day, dayOf, fitWidth, q, ref, yes, type Column, type SheetSpec } from "./xlsx-kit";
import { K, REFUND_OPEN_LABELS, major, type ContractRow, type Core, type PaymentRow, type RefundPaymentRow, type RefundRow } from "./data";

/**
 * Definición de cada hoja: columnas, tipo de dato, fórmulas, listas
 * desplegables y colores. Sirve igual para el libro completo, para el Excel
 * suelto de cada pantalla y para los CSV.
 */

// ── Listas desplegables (hoja «Listas») ─────────────────────────────────

export const LST = {
  siNo: "lstSiNo",
  estadoReserva: "lstEstadoReserva",
  estadoContrato: "lstEstadoContrato",
  modalidad: "lstModalidad",
  empresas: "lstEmpresas",
  vendedores: "lstVendedores",
  destinos: "lstDestinos",
  tipoMovimiento: "lstTipoMovimiento",
  metodo: "lstMetodo",
  estadoReembolso: "lstEstadoReembolso",
} as const;

export interface ListDef {
  name: string;
  table: string;
  header: string;
  values: string[];
  /** En el libro completo la lista sale de otra hoja (crece sola al agregar filas allí). */
  liveRef?: string;
}

export async function listDefs(core: Core): Promise<ListDef[]> {
  const [sellers, destinations] = await Promise.all([
    sortedEs(prisma.seller.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { name: "asc" } }), (r) => r.name),
    sortedEs(prisma.destination.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { name: "asc" } }), (r) => r.name),
  ]);
  return [
    { name: LST.estadoReserva, table: "L_EstadoReserva", header: "Estado de reserva", values: RESERVATION_STATE.map(label) },
    { name: LST.estadoContrato, table: "L_EstadoContrato", header: "Estado del contrato", values: CONTRACT_LIFECYCLE.map(label) },
    { name: LST.siNo, table: "L_SiNo", header: "Sí / No", values: ["Sí", "No"] },
    { name: LST.empresas, table: "L_Empresas", header: "Empresa", values: core.issuers },
    { name: LST.modalidad, table: "L_Modalidad", header: "Modalidad", values: CONTRACT_MODALITY.map(label) },
    { name: LST.tipoMovimiento, table: "L_TipoMovimiento", header: "Tipo de movimiento", values: LEDGER_KIND.map(label) },
    { name: LST.metodo, table: "L_Metodo", header: "Método de pago", values: PAYMENT_METHOD.map(label) },
    { name: LST.estadoReembolso, table: "L_EstadoReembolso", header: "Estado de reembolso", values: REFUND_STATE.map(label) },
    {
      name: LST.vendedores,
      table: "L_Vendedores",
      header: "Vendedor",
      values: sellers.map((s) => s.name),
      liveRef: ref("Vendedores", "Vendedor"),
    },
    {
      name: LST.destinos,
      table: "L_Destinos",
      header: "Destino",
      values: destinations.map((d) => d.name),
      liveRef: ref("Destinos", "Destino"),
    },
  ];
}

// ── Contratos ────────────────────────────────────────────────────────────

const P = (col: string) => ref("Pagos", col);
const sumPagos = (...tipos: string[]) =>
  tipos.length === 1
    ? `SUMIFS(${P("Monto")},${P("Contrato")},[@Contrato],${P("Tipo")},${q(tipos[0])})`
    : `SUMPRODUCT(SUMIFS(${P("Monto")},${P("Contrato")},[@Contrato],${P("Tipo")},{${tipos.map(q).join(",")}}))`;

export function contratosSpec(core: Core): SheetSpec<ContractRow> {
  const multi = core.currencies.length > 1;
  const rows = core.contracts;
  const cur = (r: ContractRow) => r.currency;
  const money = (header: string, get: (r: ContractRow) => number, formula?: string, extra: Partial<Column<ContractRow>> = {}): Column<ContractRow> => ({
    header,
    kind: "money",
    get,
    currency: cur,
    formula,
    subtotal: true,
    ...extra,
  });
  const columns: Column<ContractRow>[] = [
    { header: "Contrato", get: (r) => r.number, width: 17 },
    { header: "Cliente", get: (r) => r.client, width: fitWidth(rows.map((r) => r.client), "Cliente", 18, 34) },
    { header: "Teléfono", get: (r) => r.phone, width: 14 },
    { header: "Documento", get: (r) => r.doc, width: 13 },
    { header: "Vendedor", get: (r) => r.seller, list: LST.vendedores, width: fitWidth(rows.map((r) => r.seller), "Vendedor", 12, 22) },
    { header: "Empresa", get: (r) => r.issuer, list: LST.empresas, width: 11 },
    { header: "Destino", get: (r) => r.destination, list: LST.destinos, width: fitWidth(rows.map((r) => r.destination), "Destino", 12, 24) },
    { header: "Hotel", get: (r) => r.hotel, width: fitWidth(rows.map((r) => r.hotel), "Hotel", 12, 28) },
    { header: "Grupo", get: (r) => r.group, width: 14 },
    { header: "Modalidad", get: (r) => r.modality, list: LST.modalidad, width: 13 },
    { header: "Venta", kind: "date", get: (r) => day(r.saleDate) },
    { header: "Entrada", kind: "date", get: (r) => day(r.checkIn) },
    { header: "Salida", kind: "date", get: (r) => day(r.checkOut) },
    { header: "Vigencia desde", kind: "date", get: (r) => day(r.vigFrom) },
    { header: "Vigencia hasta", kind: "date", get: (r) => day(r.vigTo) },
    { header: "Pax", kind: "int", get: (r) => r.pax, width: 6 },
    { header: "Estado reserva", get: (r) => r.resState, list: LST.estadoReserva, width: 22 },
    { header: "Estado contrato", get: (r) => r.lifeState, list: LST.estadoContrato, width: 12 },
    { header: "Ya viajó", kind: "yesno", get: (r) => r.travelled, list: LST.siNo, width: 8 },
    money("Precio", (r) => r.price),
    ...(multi ? [{ header: "Moneda", get: (r: ContractRow) => r.currency, width: 8 } as Column<ContractRow>] : []),
    money("Recibido DEMO", (r) => r.received, sumPagos(K.pago, K.anticipo), { cross: true }),
    money("Retenido vendedor", (r) => r.retained, sumPagos(K.comision), { cross: true }),
    money("Descuentos", (r) => r.discounts, sumPagos(K.descuento, K.castigo), { cross: true }),
    money("Reembolsado", (r) => r.refunded, sumPagos(K.reembolso), { cross: true }),
    money("Saldo", (r) => r.balance, "[@Precio]-[@Recibido DEMO]-[@Retenido vendedor]-[@Descuentos]+[@Reembolsado]"),
    {
      header: "Estado de pago",
      get: (r) => r.payState,
      width: 24,
      formula: `IF([@Precio]-[@Saldo]<=0,${q(K.sinPagos)},IF([@Saldo]>0,${q(K.parcial)},IF([@Recibido DEMO]>=[@Precio],${q(K.pagado)},${q(K.liquidado)})))`,
    },
    { header: "Movimientos", kind: "int", get: (r) => r.payments, width: 12, cross: true, formula: `COUNTIFS(${P("Contrato")},[@Contrato])` },
    {
      header: "Comprobantes completos",
      kind: "yesno",
      get: (r) => r.receiptsOk,
      width: 13,
      cross: true,
      formula: `IF(COUNTIFS(${P("Contrato")},[@Contrato],${P("Tipo")},${q(K.pago)})=0,"Sin pagos",IF(COUNTIFS(${P("Contrato")},[@Contrato],${P("Tipo")},${q(K.pago)},${P("Comprobante")},"No")=0,"Sí","No"))`,
    },
    { header: "Reembolso", get: (r) => r.refundState, width: 12 },
    { header: "Motivo de cancelación", kind: "note", get: (r) => r.cancelReason, width: 26 },
    { header: "Notas", kind: "note", get: (r) => r.notes, width: 46 },
  ];
  const notCancelled = `{Estado contrato}<>${q(K.cancelado)}`;
  return {
    sheet: "Contratos",
    table: "Contratos",
    rows,
    columns,
    freeze: 2,
    note: "Una fila por contrato. Columnas con encabezado azul claro = se calculan solas desde la hoja Pagos (no escribir encima). Rojo: saldo o comprobante pendiente · Ámbar: por confirmar · Verde: pagado / confirmada · Azul: viaja en los próximos 15 días · Gris: cancelado.",
    rowHeight: (r) => ((r.notes?.length ?? 0) > 60 || (r.cancelReason?.length ?? 0) > 40 ? 30 : undefined),
    highlights: [
      { when: `{Estado contrato}=${q(K.cancelado)}`, tone: "muted" },
      { cols: ["Saldo"], when: `AND({Saldo}>0,${notCancelled})`, tone: "red" },
      { cols: ["Estado de pago"], when: `AND({Estado de pago}=${q(K.sinPagos)},{Precio}>0,${notCancelled})`, tone: "red" },
      { cols: ["Estado de pago"], when: `{Estado de pago}=${q(K.parcial)}`, tone: "amber" },
      { cols: ["Estado de pago"], when: `LEFT({Estado de pago},6)="Pagado"`, tone: "green" },
      { cols: ["Estado reserva"], when: `OR({Estado reserva}=${q(K.resPendiente)},{Estado reserva}=${q(K.resCambio)})`, tone: "amber" },
      { cols: ["Estado reserva"], when: `{Estado reserva}=${q(K.resConfirmada)}`, tone: "green" },
      { cols: ["Entrada"], when: `AND({Entrada}<>"",{Entrada}>=TODAY(),{Entrada}<=TODAY()+15,{Estado reserva}<>${q(K.resCancelada)})`, tone: "blue" },
      { cols: ["Ya viajó"], when: `AND({Ya viajó}="No",{Salida}<>"",{Salida}<TODAY(),{Estado contrato}=${q(K.activo)})`, tone: "amber" },
      { cols: ["Ya viajó"], when: `{Ya viajó}="Sí"`, tone: "green" },
      { cols: ["Comprobantes completos"], when: `{Comprobantes completos}="No"`, tone: "red" },
      { cols: ["Vigencia hasta"], when: `AND({Vigencia hasta}<>"",{Vigencia hasta}<TODAY(),{Entrada}="",{Estado contrato}=${q(K.activo)})`, tone: "red" },
    ],
  };
}

/** Contratos archivados: sólo consulta (sus pagos están en «Pagos fuera de cuentas»). */
export function contratosArchivadosSpec(core: Core): SheetSpec<ContractRow> {
  const cur = (r: ContractRow) => r.currency;
  return {
    sheet: "Contratos archivados",
    table: "ContratosArchivados",
    tab: "ref",
    rows: core.archived,
    note: "Contratos sacados de la lista (duplicados, pruebas…). No cuentan en el Resumen.",
    columns: [
      { header: "Contrato", get: (r) => r.number, width: 17 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Vendedor", get: (r) => r.seller },
      { header: "Destino", get: (r) => r.destination },
      { header: "Entrada", kind: "date", get: (r) => day(r.checkIn) },
      { header: "Precio", kind: "money", get: (r) => r.price, currency: cur },
      { header: "Recibido DEMO", kind: "money", get: (r) => r.received, currency: cur },
      { header: "Retenido vendedor", kind: "money", get: (r) => r.retained, currency: cur },
      { header: "Saldo", kind: "money", get: (r) => r.balance, currency: cur },
      { header: "Estado contrato", get: (r) => r.lifeState, width: 12 },
      { header: "Archivado el", kind: "date", get: (r) => dayOf(r.archivedAt) },
      { header: "Notas", kind: "note", get: (r) => r.notes },
    ],
  };
}

// ── Pagos ────────────────────────────────────────────────────────────────

export function pagosSpec(core: Core): SheetSpec<PaymentRow> {
  const multi = core.currencies.length > 1;
  const fx = core.payments.some((p) => p.receivedCurrency !== p.currency);
  const rows = core.payments;
  return {
    sheet: "Pagos",
    table: "Pagos",
    rows,
    freeze: 2,
    note: "Una fila por movimiento vigente (los anulados no están). Para registrar un pago nuevo, escríbelo en la primera fila vacía: Contratos y Resumen se actualizan solos. Rojo: pago sin comprobante.",
    columns: [
      { header: "Fecha", kind: "date", get: (r) => day(r.date) },
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Cliente", get: (r) => r.client, width: fitWidth(rows.map((r) => r.client), "Cliente", 18, 34) },
      { header: "Vendedor", get: (r) => r.seller, list: LST.vendedores, width: 16 },
      { header: "Tipo", get: (r) => r.kind, list: LST.tipoMovimiento, width: 18 },
      { header: "Monto", kind: "money", get: (r) => r.amount, currency: (r) => r.currency, subtotal: true },
      ...(multi ? [{ header: "Moneda", get: (r: PaymentRow) => r.currency, width: 8 } as Column<PaymentRow>] : []),
      ...(fx
        ? ([
            { header: "Recibido (otra moneda)", kind: "money", get: (r) => r.receivedAmount, currency: (r) => r.receivedCurrency },
            { header: "Moneda recibida", get: (r) => r.receivedCurrency, width: 9 },
          ] as Column<PaymentRow>[])
        : []),
      { header: "Método", get: (r) => r.method, list: LST.metodo, width: 13 },
      { header: "Referencia", get: (r) => r.reference, width: 16 },
      { header: "Comprobante", kind: "yesno", get: (r) => r.hasReceipt, list: LST.siNo, width: 12 },
      { header: "Archivo del comprobante", get: (r) => r.receiptFiles, width: 24 },
      { header: "Registrado por", get: (r) => r.createdBy, width: 14 },
      { header: "Motivo / notas", kind: "note", get: (r) => r.notes, width: 40 },
    ],
    highlights: [
      { cols: ["Comprobante"], when: `AND({Comprobante}="No",{Tipo}=${q(K.pago)})`, tone: "red" },
      { cols: ["Tipo"], when: `{Tipo}=${q(K.comision)}`, tone: "amber" },
      { cols: ["Tipo", "Monto"], when: `{Tipo}=${q(K.reembolso)}`, tone: "blue" },
    ],
  };
}

export function pagosFueraSpec(core: Core): SheetSpec<PaymentRow> {
  return {
    sheet: "Pagos fuera de cuentas",
    table: "PagosFuera",
    tab: "ref",
    rows: core.outside,
    note: "Movimientos que NO cuentan en los saldos: anulados o de contratos archivados. Sólo para consulta.",
    columns: [
      { header: "Fecha", kind: "date", get: (r) => day(r.date) },
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Tipo", get: (r) => r.kind, width: 18 },
      { header: "Monto", kind: "money", get: (r) => r.amount, currency: (r) => r.currency },
      { header: "Método", get: (r) => r.method, width: 13 },
      { header: "Referencia", get: (r) => r.reference, width: 16 },
      { header: "Por qué no cuenta", get: (r) => r.why, width: 18 },
      { header: "Motivo", kind: "note", get: (r) => r.notes, width: 44 },
    ],
  };
}

// ── Reembolsos ───────────────────────────────────────────────────────────

const PR = (col: string) => ref("PagosReembolsos", col);

export function reembolsosSpec(core: Core, today: string): SheetSpec<RefundRow> {
  const rows = core.refunds;
  const cur = (r: RefundRow) => r.currency;
  const open = REFUND_OPEN_LABELS.map((s) => `[@Estado]=${q(s)}`).join(",");
  const daysLeft = (r: RefundRow) => {
    if (!r.dueDate || r.pending <= 0) return null;
    return Math.round((Date.parse(r.dueDate) - Date.parse(today)) / 86_400_000);
  };
  return {
    sheet: "Reembolsos",
    table: "Reembolsos",
    rows,
    freeze: 2,
    note: "Devoluciones pedidas por clientes. «Pagado» suma la hoja Pagos de reembolsos; «Pendiente» = acordado (o pedido) − pagado mientras esté abierto. Rojo: plazo vencido o pendiente de pagar.",
    columns: [
      { header: "Número", get: (r) => r.number, width: 14 },
      { header: "Cliente", get: (r) => r.client, width: fitWidth(rows.map((r) => r.client), "Cliente", 18, 34) },
      { header: "Solicitado", kind: "date", get: (r) => day(r.requestedAt) },
      { header: "Teléfono", get: (r) => r.phone, width: 14 },
      { header: "Correo electrónico", get: (r) => r.email, width: 24 },
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Grupo", get: (r) => r.group, width: 12 },
      { header: "Canal", get: (r) => r.channel, width: 14 },
      { header: "Motivo", get: (r) => r.reason, width: 22 },
      { header: "Plazo", kind: "date", get: (r) => day(r.dueDate) },
      {
        header: "Días para el plazo",
        kind: "int",
        width: 10,
        get: daysLeft,
        formula: `IF(OR([@Plazo]="",[@Pendiente]<=0),"",[@Plazo]-TODAY())`,
      },
      ...(core.currencies.length > 1 ? [{ header: "Moneda", get: (r: RefundRow) => r.currency, width: 8 } as Column<RefundRow>] : []),
      { header: "Pide", kind: "money", get: (r) => r.requested, currency: cur, subtotal: true },
      { header: "Acordado", kind: "money", get: (r) => r.agreed, currency: cur, subtotal: true },
      {
        header: "Pagado",
        kind: "money",
        get: (r) => r.paid,
        currency: cur,
        subtotal: true,
        cross: true,
        formula: `SUMIFS(${PR("Monto")},${PR("Reembolso")},[@Número])`,
      },
      {
        header: "Pendiente",
        kind: "money",
        get: (r) => r.pending,
        currency: cur,
        subtotal: true,
        formula: `IF(OR(${open}),MAX(0,IF([@Acordado]<>"",[@Acordado],N([@Pide]))-[@Pagado]),0)`,
      },
      { header: "Estado", get: (r) => r.state, list: LST.estadoReembolso, width: 12 },
      { header: "Cerrado el", kind: "date", get: (r) => dayOf(r.resolvedAt) },
      { header: "Hilo de correo", kind: "link", get: (r) => (r.emailThread ? { text: "Abrir", hyperlink: r.emailThread } : null), width: 9 },
      { header: "Detalle", kind: "note", get: (r) => r.detail, width: 48 },
    ],
    rowHeight: (r) => ((r.detail?.length ?? 0) > 70 ? 30 : undefined),
    highlights: [
      { when: `OR({Estado}="Rechazado",{Estado}="Desistido")`, tone: "muted" },
      { cols: ["Pendiente"], when: `{Pendiente}>0`, tone: "red" },
      { cols: ["Estado"], when: `{Estado}="Pagado"`, tone: "green" },
      { cols: ["Estado"], when: `OR({Estado}="Solicitado",{Estado}="En trámite",{Estado}="Aprobado")`, tone: "amber" },
      { cols: ["Plazo", "Días para el plazo"], when: `AND(ISNUMBER({Días para el plazo}),{Días para el plazo}<0)`, tone: "red" },
      { cols: ["Plazo", "Días para el plazo"], when: `AND(ISNUMBER({Días para el plazo}),{Días para el plazo}>=0,{Días para el plazo}<=5)`, tone: "amber" },
    ],
  };
}

export function reembolsosArchivadosSpec(core: Core): SheetSpec<RefundRow> {
  const cur = (r: RefundRow) => r.currency;
  return {
    sheet: "Reembolsos archivados",
    table: "ReembolsosArchivados",
    tab: "ref",
    rows: core.archivedRefunds,
    note: "Reembolsos archivados: no cuentan en el Resumen.",
    columns: [
      { header: "Número", get: (r) => r.number, width: 14 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Solicitado", kind: "date", get: (r) => day(r.requestedAt) },
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Pide", kind: "money", get: (r) => r.requested, currency: cur },
      { header: "Acordado", kind: "money", get: (r) => r.agreed, currency: cur },
      { header: "Pagado", kind: "money", get: (r) => r.paid, currency: cur },
      { header: "Estado", get: (r) => r.state, width: 12 },
      { header: "Detalle", kind: "note", get: (r) => r.detail },
    ],
  };
}

export function pagosReembolsosSpec(core: Core): SheetSpec<RefundPaymentRow> {
  const rows = core.refundPayments.filter((p) => !p.voided);
  return {
    sheet: "Pagos de reembolsos",
    table: "PagosReembolsos",
    tab: "ref",
    rows,
    note: "Dinero devuelto a clientes. Una fila por pago; la hoja Reembolsos lo suma por número de reembolso.",
    columns: [
      { header: "Fecha", kind: "date", get: (r) => day(r.date) },
      { header: "Reembolso", get: (r) => r.refund, width: 14 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Monto", kind: "money", get: (r) => r.amount, currency: (r) => r.currency, subtotal: true },
      { header: "Método", get: (r) => r.method, list: LST.metodo, width: 13 },
      { header: "Referencia", get: (r) => r.reference, width: 16 },
      { header: "Comprobante", kind: "yesno", get: (r) => r.hasReceipt, list: LST.siNo, width: 12 },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 40 },
    ],
    highlights: [{ cols: ["Comprobante"], when: `{Comprobante}="No"`, tone: "red" }],
  };
}

// ── Vendedores ───────────────────────────────────────────────────────────

interface SellerRow {
  name: string;
  phone: string | null;
  email: string | null;
  active: string;
  retains: string;
  commission: string;
  notes: string | null;
  contracts: number;
  sales: number;
  received: number;
  retained: number;
  owed: number;
  owing: number;
  toConfirm: number;
}

const C = (col: string) => ref("Contratos", col);

export async function vendedoresSpec(core: Core): Promise<SheetSpec<SellerRow>> {
  const sellers = sortActiveThenName(await prisma.seller.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
  const rows: SellerRow[] = sellers.map((s) => {
    const cs = core.contracts.filter((c) => c.seller === s.name);
    const live = cs.filter((c) => c.lifeState !== K.cancelado);
    const owing = live.filter((c) => c.balance > 0);
    const commission =
      s.commissionKind === "percentage"
        ? `${s.commissionValue} %`
        : `${major(BigInt(s.commissionValue || "0"), s.commissionCurrency)?.toLocaleString("es-CO")} ${s.commissionCurrency}`;
    return {
      name: s.name,
      phone: s.phone,
      email: s.email,
      active: yes(s.active && !s.archivedAt),
      retains: yes(s.retainsCommission),
      commission,
      notes: s.notes,
      contracts: cs.length,
      sales: live.reduce((t, c) => t + c.price, 0),
      received: cs.reduce((t, c) => t + c.received, 0),
      retained: cs.reduce((t, c) => t + c.retained, 0),
      owed: owing.reduce((t, c) => t + c.balance, 0),
      owing: owing.length,
      toConfirm: cs.filter((c) => c.resState === K.resPendiente).length,
    };
  });
  const by = `${C("Vendedor")},[@Vendedor]`;
  const notCancelled = `${C("Estado contrato")},${q("<>" + K.cancelado)}`;
  const m = (header: string, get: (r: SellerRow) => number, formula: string): Column<SellerRow> => ({
    header,
    kind: "money",
    get,
    formula,
    cross: true,
    subtotal: true,
  });
  return {
    sheet: "Vendedores",
    table: "Vendedores",
    rows,
    freeze: 1,
    note: "Totales por vendedor calculados desde la hoja Contratos (sin cancelados en ventas y saldo). Un vendedor nuevo escrito aquí aparece en la lista desplegable de Contratos.",
    columns: [
      { header: "Vendedor", get: (r) => r.name, width: fitWidth(rows.map((r) => r.name), "Vendedor", 14, 26) },
      { header: "Teléfono", get: (r) => r.phone, width: 14 },
      { header: "Correo electrónico", get: (r) => r.email, width: 22 },
      { header: "Activo", kind: "yesno", get: (r) => r.active, list: LST.siNo, width: 8 },
      { header: "Retiene comisión", kind: "yesno", get: (r) => r.retains, list: LST.siNo, width: 10 },
      { header: "Comisión", get: (r) => r.commission, width: 11 },
      { header: "Contratos", kind: "int", get: (r) => r.contracts, cross: true, formula: `COUNTIFS(${by})`, width: 10 },
      m("Ventas", (r) => r.sales, `SUMIFS(${C("Precio")},${by},${notCancelled})`),
      m("Recibido DEMO", (r) => r.received, `SUMIFS(${C("Recibido DEMO")},${by})`),
      m("Retenido por el vendedor", (r) => r.retained, `SUMIFS(${C("Retenido vendedor")},${by})`),
      m("Saldo por cobrar", (r) => r.owed, `SUMIFS(${C("Saldo")},${by},${C("Saldo")},">0",${notCancelled})`),
      {
        header: "Con saldo",
        kind: "int",
        get: (r) => r.owing,
        cross: true,
        formula: `COUNTIFS(${by},${C("Saldo")},">0",${notCancelled})`,
        width: 9,
      },
      {
        header: "Por confirmar",
        kind: "int",
        get: (r) => r.toConfirm,
        cross: true,
        formula: `COUNTIFS(${by},${C("Estado reserva")},${q(K.resPendiente)})`,
        width: 10,
      },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
    highlights: [
      { when: `{Activo}="No"`, tone: "muted" },
      { cols: ["Saldo por cobrar"], when: `{Saldo por cobrar}>0`, tone: "red" },
      { cols: ["Por confirmar"], when: `{Por confirmar}>0`, tone: "amber" },
    ],
  };
}

// ── Maestros y consulta ─────────────────────────────────────────────────

interface ClientRow {
  name: string;
  doc: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  count: number;
  numbers: string | null;
  createdAt: Date;
  archived: boolean;
  notes: string | null;
}

export async function clientesSpec(): Promise<SheetSpec<ClientRow>> {
  const list = await prisma.client.findMany({
    include: { contracts: { select: { number: true }, where: { archivedAt: null } } },
    orderBy: { fullName: "asc" },
  });
  const rows: ClientRow[] = list.map((c) => ({
    name: c.fullName,
    doc: c.documentId,
    phone: c.phone,
    email: c.email,
    city: c.city,
    address: c.address,
    count: c.contracts.length,
    numbers: c.contracts.map((x) => x.number).join(", ") || null,
    createdAt: c.createdAt,
    archived: c.archivedAt != null,
    notes: c.notes,
  }));
  const anyArchived = rows.some((r) => r.archived);
  return {
    sheet: "Clientes",
    table: "Clientes",
    tab: "ref",
    rows,
    freeze: 1,
    columns: [
      { header: "Cliente", get: (r) => r.name, width: fitWidth(rows.map((r) => r.name), "Cliente", 18, 34) },
      { header: "Documento", get: (r) => r.doc, width: 13 },
      { header: "Teléfono", get: (r) => r.phone, width: 14 },
      { header: "Correo electrónico", get: (r) => r.email, width: 26 },
      { header: "Ciudad", get: (r) => r.city, width: 13 },
      { header: "Dirección", get: (r) => r.address, width: 22 },
      { header: "Contratos", kind: "int", get: (r) => r.count, width: 9 },
      { header: "Números de contrato", get: (r) => r.numbers, width: 20 },
      { header: "Creado", kind: "date", get: (r) => dayOf(r.createdAt) },
      ...(anyArchived ? [{ header: "Archivado", kind: "yesno", get: (r: ClientRow) => yes(r.archived), width: 9 } as Column<ClientRow>] : []),
      { header: "Observaciones", kind: "note", get: (r) => r.notes, width: 40 },
    ],
  };
}

interface GroupRow {
  name: string;
  count: number;
  numbers: string | null;
  holders: string | null;
  createdAt: Date;
  notes: string | null;
}

export async function gruposSpec(): Promise<SheetSpec<GroupRow>> {
  const list = await prisma.contractGroup.findMany({
    where: { archivedAt: null },
    include: { contracts: { where: { archivedAt: null }, include: { client: { select: { fullName: true } } }, orderBy: { number: "asc" } } },
    orderBy: { name: "asc" },
  });
  return {
    sheet: "Grupos",
    table: "Grupos",
    tab: "ref",
    rows: list.map((g) => ({
      name: g.name,
      count: g.contracts.length,
      numbers: g.contracts.map((c) => c.number).join(", ") || null,
      holders: g.contracts.map((c) => c.client.fullName).join(", ") || null,
      createdAt: g.createdAt,
      notes: g.notes,
    })),
    columns: [
      { header: "Grupo", get: (r) => r.name, width: 24 },
      { header: "Contratos", kind: "int", get: (r) => r.count, width: 9 },
      { header: "Números de contrato", get: (r) => r.numbers, width: 30 },
      { header: "Titulares", kind: "note", get: (r) => r.holders, width: 44 },
      { header: "Creado", kind: "date", get: (r) => dayOf(r.createdAt) },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
  };
}

interface DestRow {
  name: string;
  country: string;
  scope: string;
  active: string;
  contracts: number;
  toConfirm: number;
  notes: string | null;
}

export async function destinosSpec(core: Core): Promise<SheetSpec<DestRow>> {
  const list = sortEs(await prisma.destination.findMany({ orderBy: { name: "asc" } }), (r) => r.name);
  return {
    sheet: "Destinos",
    table: "Destinos",
    tab: "ref",
    note: "Un destino nuevo escrito aquí aparece en la lista desplegable de Contratos.",
    rows: list.map((d) => ({
      name: d.name,
      country: d.country,
      scope: label(d.scope),
      active: yes(d.active && !d.archivedAt),
      contracts: core.contracts.filter((c) => c.destination === d.name).length,
      toConfirm: core.contracts.filter((c) => c.destination === d.name && c.resState === K.resPendiente).length,
      notes: d.notes,
    })),
    columns: [
      { header: "Destino", get: (r) => r.name, width: 22 },
      { header: "País", get: (r) => r.country, width: 12 },
      { header: "Ámbito", get: (r) => r.scope, width: 13 },
      { header: "Activo", kind: "yesno", get: (r) => r.active, list: LST.siNo, width: 8 },
      { header: "Contratos", kind: "int", get: (r) => r.contracts, cross: true, formula: `COUNTIFS(${C("Destino")},[@Destino])`, width: 10 },
      {
        header: "Por confirmar",
        kind: "int",
        get: (r) => r.toConfirm,
        cross: true,
        formula: `COUNTIFS(${C("Destino")},[@Destino],${C("Estado reserva")},${q(K.resPendiente)})`,
        width: 10,
      },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
    highlights: [{ when: `{Activo}="No"`, tone: "muted" }],
  };
}

interface HotelRow {
  name: string;
  destination: string;
  city: string | null;
  active: string;
  contracts: number;
  notes: string | null;
}

export async function hotelesSpec(core: Core): Promise<SheetSpec<HotelRow>> {
  const list = await prisma.hotel.findMany({ include: { destination: true }, orderBy: [{ destination: { name: "asc" } }, { name: "asc" }] });
  return {
    sheet: "Hoteles",
    table: "Hoteles",
    tab: "ref",
    rows: list.map((h) => ({
      name: h.name,
      destination: h.destination.name,
      city: h.city,
      active: yes(h.active && !h.archivedAt),
      contracts: core.contracts.filter((c) => c.hotel === h.name && c.destination === h.destination.name).length,
      notes: h.notes,
    })),
    columns: [
      { header: "Hotel", get: (r) => r.name, width: 28 },
      { header: "Destino", get: (r) => r.destination, list: LST.destinos, width: 20 },
      { header: "Ciudad", get: (r) => r.city, width: 14 },
      { header: "Activo", kind: "yesno", get: (r) => r.active, list: LST.siNo, width: 8 },
      {
        header: "Contratos",
        kind: "int",
        get: (r) => r.contracts,
        cross: true,
        formula: `COUNTIFS(${C("Hotel")},[@Hotel],${C("Destino")},[@Destino])`,
        width: 10,
      },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
    highlights: [{ when: `{Activo}="No"`, tone: "muted" }],
  };
}

interface CommissionRow {
  contract: string;
  client: string;
  seller: string;
  expected: number | null;
  currency: string;
  accrual: string;
  settledAt: Date | null;
  settled: number | null;
  ref: string | null;
  notes: string | null;
}

export async function comisionesSpec(): Promise<SheetSpec<CommissionRow>> {
  const list = await prisma.commission.findMany({
    where: { contract: { archivedAt: null } },
    include: { seller: true, contract: { include: { client: true } } },
    orderBy: { contract: { number: "asc" } },
  });
  const cur = (r: CommissionRow) => r.currency;
  return {
    sheet: "Comisiones",
    table: "Comisiones",
    tab: "ref",
    rows: list.map((c) => ({
      contract: c.contract.number,
      client: c.contract.client.fullName,
      seller: c.seller.name,
      expected: major(c.expectedAmount, c.currency),
      currency: c.currency,
      accrual: label(c.accrual),
      settledAt: c.settledAt,
      settled: major(c.settledAmount, c.currency),
      ref: c.settlementRef,
      notes: c.notes,
    })),
    columns: [
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Vendedor", get: (r) => r.seller, list: LST.vendedores, width: 16 },
      { header: "Comisión esperada", kind: "money", get: (r) => r.expected, currency: cur, subtotal: true },
      { header: "Se causa", get: (r) => r.accrual, width: 18 },
      { header: "Liquidada el", kind: "date", get: (r) => dayOf(r.settledAt) },
      { header: "Monto liquidado", kind: "money", get: (r) => r.settled, currency: cur, subtotal: true },
      { header: "Referencia", get: (r) => r.ref, width: 16 },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
  };
}

interface CupoRow {
  ref: string;
  seller: string;
  destination: string;
  hotel: string | null;
  purchase: string;
  travel: string | null;
  seats: number;
  assigned: number;
  amount: number | null;
  paid: number | null;
  currency: string;
  state: string;
  notes: string | null;
}

export async function cuposSpec(): Promise<SheetSpec<CupoRow>> {
  const list = await prisma.pendingInventory.findMany({
    where: { archivedAt: null },
    include: { seller: true, destination: true, hotel: true, payments: true, assignments: true },
    orderBy: { purchaseDate: "asc" },
  });
  const cur = (r: CupoRow) => r.currency;
  return {
    sheet: "Cupos",
    table: "Cupos",
    tab: "ref",
    rows: list.map((i) => ({
      ref: i.reference ?? i.id.slice(0, 8),
      seller: i.seller.name,
      destination: i.destination.name,
      hotel: i.hotel?.name ?? null,
      purchase: i.purchaseDate,
      travel: i.travelDate,
      seats: i.seats,
      assigned: i.assignments.filter((a) => !a.reversed).reduce((s, a) => s + a.seats, 0),
      amount: major(i.amount, i.currency),
      paid: major(
        i.payments.filter((p) => !p.voided).reduce((s, p) => s + p.amount, 0n),
        i.currency,
      ),
      currency: i.currency,
      state: label(i.state),
      notes: i.notes,
    })),
    columns: [
      { header: "Referencia", get: (r) => r.ref, width: 14 },
      { header: "Vendedor", get: (r) => r.seller, list: LST.vendedores, width: 16 },
      { header: "Destino", get: (r) => r.destination, list: LST.destinos, width: 18 },
      { header: "Hotel", get: (r) => r.hotel, width: 22 },
      { header: "Compra", kind: "date", get: (r) => day(r.purchase) },
      { header: "Viaje", kind: "date", get: (r) => day(r.travel) },
      { header: "Plazas", kind: "int", get: (r) => r.seats },
      { header: "Asignadas", kind: "int", get: (r) => r.assigned },
      { header: "Libres", kind: "int", get: (r) => r.seats - r.assigned, formula: "[@Plazas]-[@Asignadas]" },
      { header: "Valor", kind: "money", get: (r) => r.amount, currency: cur, subtotal: true },
      { header: "Pagado", kind: "money", get: (r) => r.paid, currency: cur, subtotal: true },
      { header: "Estado", get: (r) => r.state, width: 16 },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
  };
}

interface InstallmentRow {
  contract: string;
  client: string;
  seq: number;
  due: string;
  expected: number | null;
  paid: number | null;
  currency: string;
  state: string;
  notes: string | null;
}

export async function cuotasSpec(): Promise<SheetSpec<InstallmentRow>> {
  const list = await prisma.installment.findMany({
    where: { contract: { archivedAt: null } },
    include: { contract: { include: { client: true } }, ledgerEntries: { where: { voided: false } } },
    orderBy: [{ contract: { number: "asc" } }, { sequence: "asc" }],
  });
  const cur = (r: InstallmentRow) => r.currency;
  return {
    sheet: "Plan de cuotas",
    table: "Cuotas",
    tab: "ref",
    rows: list.map((i) => ({
      contract: i.contract.number,
      client: i.contract.client.fullName,
      seq: i.sequence,
      due: i.dueDate,
      expected: major(i.expectedAmount, i.currency),
      paid: major(
        i.ledgerEntries.reduce((s, e) => s + e.appliedAmount, 0n),
        i.currency,
      ),
      currency: i.currency,
      state: label(i.manualState),
      notes: i.notes,
    })),
    columns: [
      { header: "Contrato", get: (r) => r.contract, width: 17 },
      { header: "Cliente", get: (r) => r.client, width: 28 },
      { header: "Cuota", kind: "int", get: (r) => r.seq },
      { header: "Vence", kind: "date", get: (r) => day(r.due) },
      { header: "Monto esperado", kind: "money", get: (r) => r.expected, currency: cur, subtotal: true },
      { header: "Pagado a esta cuota", kind: "money", get: (r) => r.paid, currency: cur, subtotal: true },
      { header: "Estado", get: (r) => r.state, width: 12 },
      { header: "Notas", kind: "note", get: (r) => r.notes, width: 36 },
    ],
    highlights: [{ cols: ["Vence"], when: `AND({Vence}<TODAY(),{Pagado a esta cuota}<{Monto esperado})`, tone: "red" }],
  };
}

// ── Documentos, notas, historial ────────────────────────────────────────

/** Nombre legible de la entidad a la que pertenece un documento/nota/auditoría. */
export async function entityNamer() {
  const [contracts, groups, refunds, clients] = await Promise.all([
    prisma.contract.findMany({ select: { id: true, number: true, client: { select: { fullName: true } } } }),
    prisma.contractGroup.findMany({ select: { id: true, name: true } }),
    prisma.refund.findMany({ select: { id: true, number: true, clientName: true } }),
    prisma.client.findMany({ select: { id: true, fullName: true } }),
  ]);
  const map = new Map<string, { folder: string; name: string }>();
  for (const c of contracts) map.set(`contract:${c.id}`, { folder: "Contratos", name: `${c.number} - ${c.client.fullName}` });
  for (const g of groups) map.set(`contract_group:${g.id}`, { folder: "Grupos", name: g.name });
  for (const r of refunds) map.set(`refund:${r.id}`, { folder: "Reembolsos", name: `${r.number} - ${r.clientName}` });
  for (const c of clients) map.set(`client:${c.id}`, { folder: "Clientes", name: c.fullName });
  return (entityType: string, entityId: string) =>
    map.get(`${entityType}:${entityId}`) ?? { folder: "Otros", name: `${entityType} ${entityId.slice(0, 8)}` };
}

export interface DocIndexRow {
  owner: string;
  folder: string;
  kind: string;
  name: string;
  kb: number;
  createdAt: Date;
  zipPath: string;
  sha256: string;
}

export function documentosSpec(index: DocIndexRow[]): SheetSpec<DocIndexRow> {
  return {
    sheet: "Documentos",
    table: "Documentos",
    tab: "ref",
    rows: index,
    note: "Índice de los PDF y comprobantes. Los archivos están en el paquete .zip, en la ruta indicada.",
    columns: [
      { header: "Pertenece a", get: (r) => r.owner, width: 34 },
      { header: "Tipo de registro", get: (r) => r.folder, width: 12 },
      { header: "Tipo de documento", get: (r) => r.kind, width: 16 },
      { header: "Archivo", get: (r) => r.name, width: 32 },
      { header: "Tamaño KB", kind: "int", get: (r) => r.kb, width: 9 },
      { header: "Subido el", kind: "date", get: (r) => dayOf(r.createdAt) },
      { header: "Ruta en el paquete .zip", get: (r) => r.zipPath, width: 50 },
      { header: "SHA-256", get: (r) => r.sha256, width: 14 },
    ],
  };
}

interface NoteRow {
  owner: string;
  date: Date | null;
  author: string | null;
  source: string;
  priority: string | null;
  content: string;
}

export async function notasSpec(core: Core): Promise<SheetSpec<NoteRow>> {
  const [notes, name] = await Promise.all([
    prisma.note.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }),
    entityNamer(),
  ]);
  const rows: NoteRow[] = [
    ...core.contracts
      .filter((c) => c.notes)
      .map((c) => ({ owner: `${c.number} - ${c.client}`, date: null, author: null, source: "Notas del contrato", priority: null, content: c.notes! })),
    ...notes.map((n) => ({
      owner: name(n.entityType, n.entityId).name,
      date: n.createdAt,
      author: n.author,
      source: n.pinned ? "Nota fijada" : "Nota",
      priority: n.priority === "alta" ? "Alta" : null,
      content: n.content,
    })),
  ];
  return {
    sheet: "Notas",
    table: "Notas",
    tab: "ref",
    rows,
    note: "Todas las notas completas (en Contratos sólo se ve el comienzo).",
    columns: [
      { header: "Pertenece a", get: (r) => r.owner, width: 36 },
      { header: "Fecha", kind: "date", get: (r) => dayOf(r.date) },
      { header: "Tipo", get: (r) => r.source, width: 16 },
      { header: "Autor", get: (r) => r.author, width: 14 },
      { header: "Prioridad", get: (r) => r.priority, width: 9 },
      { header: "Nota", kind: "note", get: (r) => r.content, width: 90 },
    ],
    highlights: [{ cols: ["Prioridad"], when: `{Prioridad}="Alta"`, tone: "red" }],
  };
}

interface AuditRow {
  at: Date;
  user: string;
  owner: string;
  type: string;
  action: string;
  summary: string | null;
}

export async function historialSpec(): Promise<SheetSpec<AuditRow>> {
  const [rows, name] = await Promise.all([
    prisma.auditLog.findMany({ include: { user: { select: { name: true } } }, orderBy: { at: "desc" } }),
    entityNamer(),
  ]);
  return {
    sheet: "Historial de cambios",
    table: "Historial",
    tab: "ref",
    rows: rows.map((a) => ({
      at: a.at,
      user: a.user?.name ?? "sistema",
      owner: name(a.entityType, a.entityId).name,
      type: a.entityType,
      action: label(a.action),
      summary: a.summary,
    })),
    note: "Lo más reciente primero.",
    columns: [
      { header: "Fecha", kind: "date", get: (r) => dayOf(r.at) },
      { header: "Usuario", get: (r) => r.user, width: 14 },
      { header: "Registro", get: (r) => r.owner, width: 36 },
      { header: "Tipo", get: (r) => r.type, width: 14 },
      { header: "Acción", get: (r) => r.action, width: 20 },
      { header: "Detalle", kind: "note", get: (r) => r.summary, width: 70 },
    ],
  };
}

// ── Reservas (Excel suelto de la pantalla Reservas) ──────────────────────

export function reservasSpec(core: Core): SheetSpec<ContractRow> {
  const rows = core.contracts.filter((c) => c.checkIn && c.resState).sort((a, b) => a.checkIn!.localeCompare(b.checkIn!));
  const nights = (r: ContractRow) =>
    r.checkIn && r.checkOut ? Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86_400_000) : null;
  return {
    sheet: "Reservas",
    table: "Reservas",
    rows,
    freeze: 2,
    note: "Una fila por reserva, por fecha de entrada. Ámbar: por confirmar · Azul: entra en los próximos 15 días · Gris: cancelada.",
    columns: [
      { header: "Entrada", kind: "date", get: (r) => day(r.checkIn) },
      { header: "Cliente", get: (r) => r.client, width: fitWidth(rows.map((r) => r.client), "Cliente", 18, 34) },
      { header: "Salida", kind: "date", get: (r) => day(r.checkOut) },
      { header: "Noches", kind: "int", get: nights, formula: `IF(OR([@Entrada]="",[@Salida]=""),"",[@Salida]-[@Entrada])`, width: 8 },
      { header: "Mes", kind: "month", get: (r) => day(r.checkIn!.slice(0, 8) + "01"), formula: `IF([@Entrada]="","",DATE(YEAR([@Entrada]),MONTH([@Entrada]),1))` },
      { header: "Teléfono", get: (r) => r.phone, width: 14 },
      { header: "Destino", get: (r) => r.destination, list: LST.destinos, width: 18 },
      { header: "Hotel", get: (r) => r.hotel, width: 24 },
      { header: "Pax", kind: "int", get: (r) => r.pax, width: 6 },
      { header: "Vendedor", get: (r) => r.seller, list: LST.vendedores, width: 16 },
      { header: "Estado reserva", get: (r) => r.resState, list: LST.estadoReserva, width: 22 },
      { header: "Estado de pago", get: (r) => r.payState, width: 24 },
      { header: "Saldo", kind: "money", get: (r) => r.balance, currency: (r) => r.currency, subtotal: true },
      { header: "Contrato", get: (r) => r.number, width: 17 },
      { header: "Grupo", get: (r) => r.group, width: 14 },
    ],
    highlights: [
      { when: `{Estado reserva}=${q(K.resCancelada)}`, tone: "muted" },
      { cols: ["Estado reserva"], when: `OR({Estado reserva}=${q(K.resPendiente)},{Estado reserva}=${q(K.resCambio)})`, tone: "amber" },
      { cols: ["Estado reserva"], when: `{Estado reserva}=${q(K.resConfirmada)}`, tone: "green" },
      { cols: ["Entrada"], when: `AND({Entrada}>=TODAY(),{Entrada}<=TODAY()+15,{Estado reserva}<>${q(K.resCancelada)})`, tone: "blue" },
      { cols: ["Saldo"], when: `AND({Saldo}>0,{Estado reserva}<>${q(K.resCancelada)})`, tone: "red" },
    ],
  };
}

// ── Comprobantes (fotos dentro del Excel) ────────────────────────────────

export interface ReceiptRow {
  owner: string;
  payment: string | null;
  file: string;
  createdAt: Date;
  note: string | null;
  image?: { buf: Buffer; ext: "jpeg" | "png"; w: number; h: number };
}

/** Ancho/alto de un JPG o PNG leyendo su cabecera (sin dependencias). */
function imageInfo(buf: Buffer): { ext: "jpeg" | "png"; w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { ext: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { ext: "jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export const IMG_MAX_W = 300;
export const IMG_MAX_H = 420;

export async function comprobantesSpec(images: boolean): Promise<SheetSpec<ReceiptRow>> {
  const [docs, name] = await Promise.all([
    prisma.document.findMany({
      where: { archivedAt: null, kind: "comprobante" },
      include: { receipts: { include: { ledgerEntry: true } } },
      orderBy: { createdAt: "asc" },
    }),
    entityNamer(),
  ]);
  const refundPays = await prisma.refundPayment.findMany({
    where: { documentId: { in: docs.map((d) => d.id) } },
    include: { refund: true },
  });
  const refundPayByDoc = new Map(refundPays.map((p) => [p.documentId as string, p]));
  const fmt = (n: number | null, c: string) => `${n?.toLocaleString("es-CO") ?? ""} ${c}`;

  const rows: ReceiptRow[] = [];
  for (const d of docs) {
    const owner = name(d.entityType, d.entityId);
    const e = d.receipts[0]?.ledgerEntry;
    const rp = refundPayByDoc.get(d.id);
    const payment = e
      ? `${label(e.kind)} ${e.valueDate} · ${fmt(major(e.receivedAmount, e.receivedCurrency), e.receivedCurrency)}`
      : rp
        ? `Pago de reembolso ${rp.paidDate} · ${fmt(major(rp.amount, rp.refund.currency), rp.refund.currency)}`
        : null;
    const row: ReceiptRow = { owner: owner.name, payment, file: d.originalName, createdAt: d.createdAt, note: null };
    if (!d.mimeType.startsWith("image/")) row.note = "PDF: se descarga desde el contrato";
    else if (images) {
      try {
        const buf = await storage.read(d.storagePath);
        const info = imageInfo(buf);
        if (info && info.w > 0 && info.h > 0) {
          const k = Math.min(IMG_MAX_W / info.w, IMG_MAX_H / info.h, 1);
          row.image = { buf, ext: info.ext, w: Math.round(info.w * k), h: Math.round(info.h * k) };
        } else row.note = "Formato de imagen no reconocido: se descarga desde el contrato";
      } catch {
        row.note = "No se encontró el archivo";
      }
    }
    rows.push(row);
  }
  return {
    sheet: "Comprobantes",
    table: "Comprobantes",
    tab: "ref",
    rows,
    stripes: false,
    note: images ? "Las fotos de los comprobantes, junto al pago al que corresponden." : "Las fotos están en la carpeta de archivos del respaldo (o en el Excel completo de Sistema).",
    columns: [
      { header: "Pertenece a", get: (r) => r.owner, width: 34 },
      { header: "Pago", get: (r) => r.payment, width: 40 },
      { header: "Archivo", get: (r) => r.file, width: 26 },
      { header: "Subido el", kind: "date", get: (r) => dayOf(r.createdAt) },
      { header: "Imagen", get: (r) => r.note, width: Math.ceil(IMG_MAX_W / 7) + 2 },
    ],
  };
}
