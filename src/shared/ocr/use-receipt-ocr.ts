"use client";

import { useEffect, useState } from "react";
import type { Worker } from "tesseract.js";
import { parseReceiptText, type ReceiptGuess } from "@/core/ocr/receipt";

/**
 * Lector de capturas EN EL NAVEGADOR (tesseract.js, español). La imagen no sale del
 * equipo: el programa y el idioma se descargan del propio CRM (`/api/ocr/*`), una sola
 * vez, y quedan guardados en el navegador. Se carga de forma perezosa: solo cuando se
 * adjunta la primera captura, para que las páginas sigan abriendo rápido.
 */

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const base = `${window.location.origin}/api/ocr`;
      return createWorker("spa", 1, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
      });
    })().catch((e) => {
      workerPromise = null; // que el siguiente intento vuelva a probar
      throw e;
    });
  }
  return workerPromise;
}

const results = new WeakMap<File, ReceiptGuess | null>();

/** Lee una captura y propone monto, fecha y referencia. `null` si no encontró nada útil. */
export async function readReceipt(file: File): Promise<ReceiptGuess | null> {
  if (!file.type.startsWith("image/")) return null;
  if (results.has(file)) return results.get(file) ?? null;
  const worker = await getWorker();
  const { data } = await worker.recognize(file);
  const guess = parseReceiptText(data.text ?? "", new Date().toLocaleDateString("en-CA"));
  const useful = guess.amount || guess.date || guess.reference ? guess : null;
  results.set(file, useful);
  return useful;
}

export type OcrState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "done"; guess: ReceiptGuess | null }
  | { status: "failed" };

/** Estado de lectura de la captura actual (se reinicia al cambiar de archivo). */
export function useReceiptOcr(file: File | null): OcrState {
  const [state, setState] = useState<{ file: File | null; value: OcrState }>({ file: null, value: { status: "idle" } });

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return;
    let cancelled = false;
    setState({ file, value: { status: "reading" } });
    readReceipt(file)
      .then((guess) => !cancelled && setState({ file, value: { status: "done", guess } }))
      .catch(() => !cancelled && setState({ file, value: { status: "failed" } }));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Si el archivo cambió y el efecto aún no corrió, no mostrar el resultado del anterior.
  return state.file === file ? state.value : { status: file && file.type.startsWith("image/") ? "reading" : "idle" };
}
