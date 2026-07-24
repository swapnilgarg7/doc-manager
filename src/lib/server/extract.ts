import "server-only";
import { AzureOpenAI } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import type { DrawingMeta } from "@/lib/types";

export type { DrawingMeta };

// ---------------------------------------------------------------------------
// Deterministic PDF text extraction (pdfjs) — pulls the text from the
// bottom-right title-block region, where drawing titles live.
// ---------------------------------------------------------------------------

interface TextItemLike {
  str: string;
  transform: number[]; // [a, b, c, d, e(x), f(y)]
}

export async function extractTitleBlockText(
  data: Uint8Array
): Promise<{ region: string; full: string }> {
  // Dynamic import so pdfjs only loads in the Node runtime, not the bundle.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs transfers (detaches) the buffer it's given, so hand it a private copy
  // — otherwise the caller's bytes become unusable for later rendering.
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  const doc = await loadingTask.promise;

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const { width, height } = viewport;
    const content = await page.getTextContent();
    // content.items is (TextItem | TextMarkedContent)[]; only TextItems have `str`.
    const items = content.items.filter(
      (it) => "str" in it
    ) as unknown as TextItemLike[];

    // Title block sits in the bottom-right corner. PDF origin is bottom-left,
    // so "bottom" means a small y value.
    const region = items.filter((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      return x >= width * 0.5 && y <= height * 0.45;
    });

    // Reading order: top-to-bottom, then left-to-right.
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

// ---------------------------------------------------------------------------
// Rasterization fallback — for scanned / image-only PDFs that have no text
// layer, render page 1 and crop the bottom-right title block to an image the
// vision model can read (OCR-via-LLM).
// ---------------------------------------------------------------------------

export async function renderTitleBlockImage(
  data: Uint8Array
): Promise<string | null> {
  try {
    // mupdf renders reliably in Node (pure WASM, no worker/canvas transfer),
    // unlike pdfjs's rendering path which breaks once the bundler wraps it.
    const mupdf = await import("mupdf");
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");

    // Use a private copy in case an earlier consumer detached the buffer.
    const doc = mupdf.Document.openDocument(data.slice(), "application/pdf");
    if (doc.countPages() < 1) return null;
    const page = doc.loadPage(0);
    const [x0, y0, x1, y1] = page.getBounds();
    const w = x1 - x0;
    const h = y1 - y0;
    // Render large enough that small title-block text stays legible.
    const scale = Math.min(3, 2600 / Math.max(w, h));
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    );
    const fullPng = Buffer.from(pixmap.asPNG());

    // Crop the bottom-right quadrant (standard title-block location).
    const img = await loadImage(fullPng);
    const sx = Math.floor(img.width * 0.5);
    const sy = Math.floor(img.height * 0.55);
    const sw = img.width - sx;
    const sh = img.height - sy;
    const crop = createCanvas(sw, sh);
    crop.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return crop.toBuffer("image/png").toString("base64");
  } catch (err) {
    console.error("[extract] title-block render failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI classification — turns noisy title-block text into a clean title + tags.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You extract metadata from a construction / engineering drawing.
You are given either raw text scraped from the bottom-right title-block area of a drawing PDF (which may be noisy, duplicated, or out of order) OR an image of that title-block corner, plus the file name.

Return ONLY a JSON object of the form:
{"title": string, "tags": string[]}

Rules:
- "title" = the drawing's title exactly as it appears in the title block (e.g. "Plumbing and Drainage Layout", "Relocation of Cargo ETS", "Foundation Details"). Prefer the human-readable sheet title, NOT the drawing number, scale, date, client, or revision. If the title is genuinely unclear, infer the best title from the available text or the file name.
- "tags" = 1 to 5 short, general classification keywords useful for grouping and search. Prefer standard construction disciplines/systems when they apply: Plumbing, Drainage, Electrical, HVAC, Mechanical, Structural, Foundation, Architectural, Fire Protection, Civil, Landscape, plus a form tag when obvious (Layout, Plan, Section, Elevation, Detail). Use Title Case. Do not invent facts not supported by the text.`;

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().slice(0, 40);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
    if (out.length >= 6) break;
  }
  return out;
}

type UserContent = string | ChatCompletionContentPart[];

async function runClassification(userContent: UserContent): Promise<DrawingMeta> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !apiVersion || !deployment) {
    throw new Error("Azure OpenAI environment variables are not configured.");
  }

  const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

  const response = await client.chat.completions.create({
    model: deployment,
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = parseJson(content) as
    | { title?: unknown; tags?: unknown }
    | null;

  const title =
    parsed && typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 300)
      : null;

  return { title, tags: sanitizeTags(parsed?.tags) };
}

/** Classify from extracted title-block text (vector PDFs with a text layer). */
export async function classifyFromText(
  titleBlockText: string,
  fileName: string
): Promise<DrawingMeta> {
  return runClassification(
    `File name: ${fileName}\n\nTitle-block text:\n"""\n${titleBlockText}\n"""`
  );
}

/** Classify from a rendered title-block image (scanned / image-only PDFs). */
export async function classifyFromImage(
  imageBase64: string,
  fileName: string
): Promise<DrawingMeta> {
  return runClassification([
    {
      type: "text",
      text: `File name: ${fileName}. The image below is the bottom-right corner of a scanned drawing sheet. Read the drawing's title from its title block.`,
    },
    {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${imageBase64}` },
    },
  ]);
}
