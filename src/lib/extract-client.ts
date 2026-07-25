"use client";

// Title-block extraction that runs entirely IN THE BROWSER with pdfjs. The PDF
// bytes never leave the page — only the extracted snippet (text, or a cropped
// image) is later posted to the server for Azure classification.

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Worker is served as a static asset from /public (same version as the lib).
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

interface TextItemLike {
  str: string;
  transform: number[]; // [a, b, c, d, e(x), f(y)]
}

/**
 * Pull text from the bottom-right title-block region of page 1, where drawing
 * titles live. Returns both that region and the full-page text (for fallback).
 */
export async function extractTitleBlockText(
  file: File
): Promise<{ region: string; full: string }> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter(
      (it) => "str" in it
    ) as unknown as TextItemLike[];

    // PDF origin is bottom-left, so "bottom" is a small y value.
    const region = items.filter((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      return x >= width * 0.5 && y <= height * 0.45;
    });
    region.sort(
      (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
    );

    const clean = (arr: TextItemLike[]) =>
      arr
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    return { region: clean(region), full: clean(items) };
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * For scanned / image-only PDFs (no text layer): render page 1 to a canvas and
 * crop the bottom-right title-block corner to a base64 PNG the vision model can
 * read. Returns base64 (no data: prefix), or null if rendering fails.
 */
export async function renderTitleBlockImage(file: File): Promise<string | null> {
  try {
    const pdfjs = await getPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      // Render large enough that small title-block text stays legible.
      const scale = Math.min(3, 2600 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      // Crop the bottom-right quadrant (standard title-block location).
      const sx = Math.floor(canvas.width * 0.5);
      const sy = Math.floor(canvas.height * 0.55);
      const sw = canvas.width - sx;
      const sh = canvas.height - sy;
      const crop = document.createElement("canvas");
      crop.width = sw;
      crop.height = sh;
      crop.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const dataUrl = crop.toDataURL("image/png");
      return dataUrl.split(",")[1] ?? null;
    } finally {
      await loadingTask.destroy();
    }
  } catch (err) {
    console.error("[extract-client] render failed:", err);
    return null;
  }
}
