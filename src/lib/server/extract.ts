import "server-only";
import { AzureOpenAI } from "openai";
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
  const loadingTask = pdfjs.getDocument({ data });
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
// AI classification — turns noisy title-block text into a clean title + tags.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You extract metadata from a construction / engineering drawing.
You are given raw text scraped from the bottom-right title-block area of a drawing PDF (it may be noisy, duplicated, or out of order) plus the file name.

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

export async function classifyDrawing(
  titleBlockText: string,
  fileName: string
): Promise<DrawingMeta> {
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
      {
        role: "user",
        content: `File name: ${fileName}\n\nTitle-block text:\n"""\n${titleBlockText}\n"""`,
      },
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
