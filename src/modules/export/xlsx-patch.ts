import { inflateRawSync } from "node:zlib";
import { buildZip, type ZipEntry } from "@/core/zip";

/**
 * Retoques finales al .xlsx que exceljs no sabe escribir:
 *
 *  · `calculatedColumnFormula` en las columnas con fórmula de cada tabla, para
 *    que Excel copie la fórmula sola cuando se agrega una fila nueva.
 *  · Que Excel no marque con triángulo verde los teléfonos y documentos
 *    guardados como texto (es a propósito: no son cantidades).
 *  · Nombres definidos que apuntan a una columna de tabla (p. ej.
 *    `lstVendedores = Vendedores[Vendedor]`): las listas desplegables crecen
 *    solas al agregar un vendedor o un destino.
 *
 * El .xlsx es un ZIP: se abre en memoria, se editan dos XML y se vuelve a armar.
 */

export interface XlsxPatch {
  /** tabla → (columna → fórmula, sin "=") */
  calculated: Map<string, Map<string, string>>;
  /** nombre definido → referencia (p. ej. "Vendedores[Vendedor]") */
  names: Map<string, string>;
}

interface RawEntry {
  name: string;
  data: Buffer;
}

/** Lector ZIP mínimo (directorio central + deflate), suficiente para lo que escribe exceljs. */
export function readZip(buf: Buffer): RawEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no es un ZIP válido");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: RawEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP: directorio central dañado");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`ZIP: método de compresión ${method} no soportado`);
    out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const xmlUnescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Agrega `<calculatedColumnFormula>` a las columnas indicadas de un `xl/tables/tableN.xml`. */
export function patchTableXml(xml: string, calculated: Map<string, Map<string, string>>): string {
  const tableName = /<table\b[^>]*\bname="([^"]+)"/.exec(xml)?.[1];
  const cols = tableName ? calculated.get(xmlUnescape(tableName)) : undefined;
  if (!cols || cols.size === 0) return xml;
  return xml.replace(/<tableColumn\b([^>]*?)\s*\/>/g, (whole, attrs: string) => {
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    const f = name != null ? cols.get(xmlUnescape(name)) : undefined;
    if (!f) return whole;
    return `<tableColumn${attrs}><calculatedColumnFormula>${xmlEscape(f)}</calculatedColumnFormula></tableColumn>`;
  });
}

/** Inserta nombres definidos en `xl/workbook.xml` (después de `</sheets>`, como pide el esquema). */
export function patchWorkbookXml(xml: string, names: Map<string, string>): string {
  if (names.size === 0) return xml;
  const defs = [...names.entries()]
    .map(([n, ref]) => `<definedName name="${xmlEscape(n)}">${xmlEscape(ref)}</definedName>`)
    .join("");
  if (xml.includes("</definedNames>")) return xml.replace("</definedNames>", `${defs}</definedNames>`);
  if (xml.includes("<definedNames/>")) return xml.replace("<definedNames/>", `<definedNames>${defs}</definedNames>`);
  return xml.replace("</sheets>", `</sheets><definedNames>${defs}</definedNames>`);
}

/** Silencia el aviso «número almacenado como texto» en toda la hoja. */
export function patchSheetXml(xml: string): string {
  if (xml.includes("<ignoredErrors")) return xml;
  const tag = '<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>';
  const after = ["<smartTags", "<drawing", "<legacyDrawing", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"];
  const at = Math.min(...after.map((t) => xml.indexOf(t)).filter((i) => i >= 0));
  return Number.isFinite(at) ? xml.slice(0, at) + tag + xml.slice(at) : xml;
}

export function patchXlsx(buf: Buffer, patch: XlsxPatch): Buffer {
  const entries: ZipEntry[] = readZip(buf).map(({ name, data }) => {
    if (/^xl\/tables\/table\d+\.xml$/.test(name)) {
      return { name, data: Buffer.from(patchTableXml(data.toString("utf8"), patch.calculated), "utf8") };
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      return { name, data: Buffer.from(patchSheetXml(data.toString("utf8")), "utf8") };
    }
    if (name === "xl/workbook.xml") {
      return { name, data: Buffer.from(patchWorkbookXml(data.toString("utf8"), patch.names), "utf8") };
    }
    return { name, data };
  });
  return buildZip(entries);
}
