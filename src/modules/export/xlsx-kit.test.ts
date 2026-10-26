import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildZip } from "@/core/zip";
import { Book, colLetter, day, expandFormula, moneyFormat, ref } from "./xlsx-kit";
import { patchSheetXml, patchTableXml, patchWorkbookXml, readZip } from "./xlsx-patch";

describe("utilidades del kit de Excel", () => {
  it("letras de columna", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(26)).toBe("Z");
    expect(colLetter(27)).toBe("AA");
    expect(colLetter(31)).toBe("AE");
  });

  it("[@Col] se convierte en la referencia estructurada que Excel guarda en el archivo", () => {
    expect(expandFormula("[@Precio]-[@Recibido DEMO]", "Contratos")).toBe(
      "Contratos[[#This Row],[Precio]]-Contratos[[#This Row],[Recibido DEMO]]",
    );
    expect(ref("Pagos", "Monto")).toBe("Pagos[Monto]");
    // caracteres especiales de las referencias estructuradas se escapan con '
    expect(ref("T", "Nº #1")).toBe("T[Nº '#1]");
  });

  it("fechas puras sin corrimiento de zona y dinero sin decimales", () => {
    expect(day("2026-10-18")?.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(day(null)).toBeNull();
    expect(moneyFormat("COP")).not.toMatch(/0\.00/);
    expect(moneyFormat("USD")).toMatch(/0\.00/);
  });
});

describe("retoques del .xlsx", () => {
  it("agrega calculatedColumnFormula sólo a las columnas indicadas", () => {
    const xml =
      '<table name="Contratos" displayName="Contratos"><tableColumns count="2"><tableColumn id="1" name="Precio" totalsRowFunction="none"/><tableColumn id="2" name="Saldo"/></tableColumns></table>';
    const out = patchTableXml(xml, new Map([["Contratos", new Map([["Saldo", 'A1&"<x>"']])]]));
    expect(out).toContain('<tableColumn id="1" name="Precio" totalsRowFunction="none"/>');
    expect(out).toContain('<tableColumn id="2" name="Saldo"><calculatedColumnFormula>A1&amp;&quot;&lt;x&gt;&quot;</calculatedColumnFormula></tableColumn>');
  });

  it("inserta nombres definidos después de <sheets>", () => {
    const wb = '<workbook><sheets><sheet name="A"/></sheets><calcPr/></workbook>';
    expect(patchWorkbookXml(wb, new Map([["lstSiNo", "L_SiNo[Sí / No]"]]))).toBe(
      '<workbook><sheets><sheet name="A"/></sheets><definedNames><definedName name="lstSiNo">L_SiNo[Sí / No]</definedName></definedNames><calcPr/></workbook>',
    );
    const withNames = '<workbook><sheets/><definedNames><definedName name="x">A!$1:$1</definedName></definedNames></workbook>';
    expect(patchWorkbookXml(withNames, new Map([["y", "T[C]"]]))).toContain('<definedName name="y">T[C]</definedName></definedNames>');
  });

  it("silencia «número almacenado como texto» en el lugar correcto del esquema", () => {
    const xml = '<worksheet><sheetData/><pageMargins/><tableParts count="1"/></worksheet>';
    expect(patchSheetXml(xml)).toBe(
      '<worksheet><sheetData/><pageMargins/><ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors><tableParts count="1"/></worksheet>',
    );
  });

  it("lee lo que escribe buildZip", () => {
    const zip = buildZip([
      { name: "a.txt", data: Buffer.from("hola hola hola hola hola") },
      { name: "b/c.bin", data: Buffer.from([1, 2, 3]) },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b/c.bin"]);
    expect(entries[0].data.toString()).toBe("hola hola hola hola hola");
    expect([...entries[1].data]).toEqual([1, 2, 3]);
  });
});

describe("Book: tabla con fórmulas, listas y colores", () => {
  type Row = { n: string; precio: number; pagado: number };
  const rows: Row[] = [
    { n: "CTR-1", precio: 1000, pagado: 400 },
    { n: "CTR-2", precio: 500, pagado: 500 },
  ];
  const spec = {
    sheet: "Contratos",
    table: "Contratos",
    rows,
    columns: [
      { header: "Contrato", get: (r: Row) => r.n, list: "lstX" },
      { header: "Precio", kind: "money" as const, get: (r: Row) => r.precio, subtotal: true },
      { header: "Pagado", kind: "money" as const, get: (r: Row) => r.pagado, cross: true, formula: "SUMIFS(Pagos[Monto],Pagos[Contrato],[@Contrato])" },
      { header: "Saldo", kind: "money" as const, get: (r: Row) => r.precio - r.pagado, formula: "[@Precio]-[@Pagado]" },
    ],
    highlights: [{ cols: ["Saldo"], when: "{Saldo}>0", tone: "red" as const }],
  };

  it("libro completo: fórmulas con resultado, columna calculada y nombre definido", async () => {
    const book = new Book(true, "2026-10-18");
    const info = book.tableSheet(spec);
    book.defineName("lstX", "Lista[Valor]");
    expect(info.first).toBe(5);
    expect(info.last).toBe(6);
    const saldo = info.ws.getCell(5, info.colOf("Saldo")).value as ExcelJS.CellFormulaValue;
    expect(saldo.formula).toBe("Contratos[[#This Row],[Precio]]-Contratos[[#This Row],[Pagado]]");
    expect(saldo.result).toBe(600);
    expect((info.ws.getCell(5, info.colOf("Pagado")).value as ExcelJS.CellFormulaValue).formula).toContain("SUMIFS(");
    expect(info.ws.getCell(3, info.colOf("Precio")).value).toEqual({ formula: "SUBTOTAL(109,Contratos[Precio])", result: 1500 });
    expect(book.patch.calculated.get("Contratos")?.has("Saldo")).toBe(true);

    const buf = await book.buffer();
    const files = new Map(readZip(buf).map((e) => [e.name, e.data.toString("utf8")]));
    const table = [...files.entries()].find(([n]) => /^xl\/tables\/table\d+\.xml$/.test(n))![1];
    expect(table).toContain("<calculatedColumnFormula>Contratos[[#This Row],[Precio]]-Contratos[[#This Row],[Pagado]]</calculatedColumnFormula>");
    expect(files.get("xl/workbook.xml")).toContain('<definedName name="lstX">Lista[Valor]</definedName>');
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("<dataValidation");
    expect(sheet).toContain("<conditionalFormatting");
    expect(sheet).toContain("numberStoredAsText");
  });

  it("Excel suelto: las fórmulas entre hojas van como valor, las de la propia fila se mantienen", () => {
    const book = new Book(false, "2026-10-18");
    const info = book.tableSheet(spec);
    expect(info.ws.getCell(5, info.colOf("Pagado")).value).toBe(400);
    expect((info.ws.getCell(5, info.colOf("Saldo")).value as ExcelJS.CellFormulaValue).formula).toBeTruthy();
  });

  it("tabla vacía: deja una fila en blanco para que Excel la acepte", () => {
    const book = new Book(true, "2026-10-18");
    const info = book.tableSheet({ ...spec, table: "Vacia", sheet: "Vacía", rows: [] });
    expect(info.count).toBe(0);
    expect(info.last).toBe(info.first);
  });
});
