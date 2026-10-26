/**
 * Lectura de comprobantes de pago (Bancolombia, Nequi, Daviplata, transferencias…)
 * a partir del texto que saca el lector de imágenes. Es PURO: recibe el texto y la
 * fecha de hoy, devuelve lo que cree haber encontrado. Nada se guarda solo: la
 * pantalla lo propone y la persona revisa y pulsa Guardar.
 */

export interface ReceiptGuess {
  /** Monto en pesos (unidades mayores), si se encontró uno creíble. */
  amount?: number;
  /** Fecha del pago "YYYY-MM-DD". */
  date?: string;
  /** Número de referencia / aprobación / comprobante. */
  reference?: string;
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4, apr: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8, aug: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12, dec: 12,
};

const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palabras que acompañan al monto pagado. */
const AMOUNT_HINT = /(valor|monto|total|cu[aá]nto|enviaste|enviado|transferiste|transferido|pagaste|pagado|recibiste|importe|cantidad|abono|consignaci[oó]n|consignado)/i;
/** Líneas que NO son el monto pagado (saldo de la cuenta, costo de la transacción, etc.). */
const AMOUNT_AVOID = /(saldo|costo|comisi[oó]n|cuota de manejo|iva|gmf|4x1000|disponible|cupo)/i;

/** Convierte «700.000», «700.000,00», «1,250,000.00», «700000» a número. */
export function parseCopAmount(raw: string): number | null {
  const isInt = (x: string) => /^\d{1,3}([.,]\d{3})+$|^\d+$/.test(x);
  let s = raw.replace(/\s/g, "");
  // Centavos al final («,00» / «.00»): se descartan si lo de antes es un entero válido.
  const dec = s.match(/^(.+)[.,](\d{2})$/);
  if (dec && isInt(dec[1])) s = dec[1];
  if (!isInt(s)) return null;
  const n = Number(s.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Busca el monto más probable del pago. */
export function findAmount(text: string): number | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates: { value: number; score: number; index: number }[] = [];
  const re = /(\$|S\/?|COP|cop)?\s?(?<![\d.,])(\d{1,3}(?:[.,]\s?\d{3})+(?:[.,]\d{2})?|\d{4,9}(?:[.,]\d{2})?)(?![\d])/g;

  lines.forEach((line, i) => {
    const prev = lines[i - 1] ?? "";
    for (const m of line.matchAll(re)) {
      const prefix = m[1] ?? "";
      const raw = m[2];
      // «S» solo vale como «$» mal leído si va pegado a un número con miles.
      if (prefix.startsWith("S") && !/[.,]\d{3}/.test(raw)) continue;
      const value = parseCopAmount(raw);
      if (value == null || value < 1000 || value > 500_000_000) continue;
      // Números largos sin separadores suelen ser cuentas, referencias o teléfonos.
      if (!/[.,]/.test(raw) && raw.length >= 8) continue;
      // Parece una fecha u hora pegada (2026, 10:22…).
      if (!prefix && /^(19|20)\d{2}$/.test(raw)) continue;
      let score = 0;
      if (prefix === "$" || prefix.toUpperCase() === "COP" || prefix.startsWith("S")) score += 3;
      if (/[.,]\d{3}/.test(raw)) score += 1;
      if (AMOUNT_HINT.test(line)) score += 3;
      else if (AMOUNT_HINT.test(prev)) score += 2;
      if (AMOUNT_AVOID.test(line) || (AMOUNT_AVOID.test(prev) && !AMOUNT_HINT.test(line))) score -= 5;
      candidates.push({ value, score, index: i });
    }
  });
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0].score >= 3 ? candidates[0].value : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number, today: string): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const t = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(t) || new Date(t).getUTCDate() !== d) return undefined;
  const now = Date.parse(today + "T00:00:00Z");
  // Un comprobante no es del futuro (1 día de margen) ni de hace más de ~2 años.
  if (t > now + 86_400_000 || t < now - 2 * 366 * 86_400_000) return undefined;
  return iso;
}

/** Busca la fecha del pago en formatos comunes de bancos colombianos. */
export function findDate(text: string, today: string): string | undefined {
  const t = deaccent(text).toLowerCase();
  const year = Number(today.slice(0, 4));

  // 18 oct 2026 · 18 de octubre de 2026 · 18 oct. 2026 · 18 octubre (sin año)
  const named = /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|del\s+)?(\d{4})?\b/g;
  for (const m of t.matchAll(named)) {
    const month = MONTHS[m[2]];
    if (!month) continue;
    const d = Number(m[1]);
    const y = m[3] ? Number(m[3]) : year;
    const ok = validDate(y, month, d, today) ?? (m[3] ? undefined : validDate(year - 1, month, d, today));
    if (ok) return ok;
  }
  // 2026-10-18 · 2026/10/18
  for (const m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const ok = validDate(Number(m[1]), Number(m[2]), Number(m[3]), today);
    if (ok) return ok;
  }
  // 18/10/2026 · 18-10-26 (día primero, como en Colombia)
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const ok = validDate(y, Number(m[2]), Number(m[1]), today);
    if (ok) return ok;
  }
  return undefined;
}

/** Referencia / número de aprobación / comprobante. */
export function findReference(text: string): string | undefined {
  const t = deaccent(text);
  const m = t.match(
    /(referencia|comprobante|aprobacion|no\.?\s*de\s*transaccion|transaccion|operacion|autorizacion)\s*(?:no\.?|n[°º]|#|:)?\s*[:#]?\s*([A-Z0-9-]{5,24})/i,
  );
  if (!m) return undefined;
  const ref = m[2].replace(/-+$/, "");
  return /\d/.test(ref) ? ref : undefined;
}

export function parseReceiptText(text: string, today: string): ReceiptGuess {
  return { amount: findAmount(text), date: findDate(text, today), reference: findReference(text) };
}
