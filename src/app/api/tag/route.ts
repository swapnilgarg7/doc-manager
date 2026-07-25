import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { resolveWithinRoot, isPdf } from "@/lib/server/fsscan";
import { setMeta } from "@/lib/server/store";
import {
  extractTitleBlockText,
  renderTitleBlockImage,
  classifyFromText,
  classifyFromImage,
} from "@/lib/server/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/tag  Body: { path: string }
 *
 * Reads the file from the local disk (never uploads it anywhere), extracts the
 * bottom-right title block, asks Azure OpenAI for { title, tags } using ONLY
 * that snippet, and saves the result into the local index. Returns { title, tags }.
 */
export async function POST(req: Request) {
  try {
    const { path: relPath } = await req.json();
    if (typeof relPath !== "string" || !relPath) {
      return NextResponse.json({ error: "path is required." }, { status: 400 });
    }

    const { abs, rel } = await resolveWithinRoot(relPath);
    const name = rel.split("/").pop() ?? "";

    // Only PDFs carry an extractable title block.
    if (!isPdf(name)) {
      return NextResponse.json({ title: null, tags: [], skipped: "not-pdf" });
    }

    const stat = await fs.stat(abs);
    const bytes = new Uint8Array(await fs.readFile(abs));

    // 1) Deterministic text extraction from the bottom-right title block.
    let region = "";
    let full = "";
    try {
      const extracted = await extractTitleBlockText(bytes);
      region = extracted.region;
      full = extracted.full;
    } catch (err) {
      console.error("[tag] PDF text parse failed:", err);
    }

    let meta;
    let source: "text" | "image";
    if (full.trim().length >= 20) {
      // Vector PDF with a real text layer.
      const text = region.length >= 8 ? region : full;
      meta = await classifyFromText(text, name);
      source = "text";
    } else {
      // 2) Scanned / image-only PDF — rasterize + OCR via the vision model.
      const image = await renderTitleBlockImage(bytes);
      if (!image) {
        return NextResponse.json({
          title: null,
          tags: [],
          skipped: "no-text-no-render",
        });
      }
      meta = await classifyFromImage(image, name);
      source = "image";
    }

    // Persist onto the local index, stamped with the file's current size/mtime
    // so we can detect later edits and re-tag.
    await setMeta(rel, {
      title: meta.title,
      tags: meta.tags,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      taggedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ...meta, source });
  } catch (err) {
    console.error("[tag] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tagging failed." },
      { status: 500 }
    );
  }
}
