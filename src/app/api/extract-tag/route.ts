import { NextResponse } from "next/server";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabase/client";
import {
  extractTitleBlockText,
  renderTitleBlockImage,
  classifyFromText,
  classifyFromImage,
} from "@/lib/server/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/extract-tag
 * Body: { documentId: string, filePath: string, fileName?: string }
 *
 * Downloads the PDF from Supabase Storage, extracts the title-block text
 * deterministically, asks Azure OpenAI for the title + tags, and saves them
 * onto the document row. Returns { title, tags }.
 */
export async function POST(req: Request) {
  try {
    const { documentId, filePath, fileName } = await req.json();
    if (!documentId || !filePath) {
      return NextResponse.json(
        { error: "documentId and filePath are required." },
        { status: 400 }
      );
    }

    const name: string =
      typeof fileName === "string" ? fileName : String(filePath).split("/").pop() ?? "";

    // Only PDFs carry an extractable title block.
    if (!name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ title: null, tags: [], skipped: "not-pdf" });
    }

    // Download the file bytes from storage (bucket is public).
    const dl = await supabase.storage.from(DOCUMENTS_BUCKET).download(filePath);
    if (dl.error || !dl.data) {
      return NextResponse.json(
        { error: `Could not download file: ${dl.error?.message ?? "unknown"}` },
        { status: 404 }
      );
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());

    // 1) Try deterministic text extraction from the bottom-right title block.
    let region = "";
    let full = "";
    try {
      const extracted = await extractTitleBlockText(bytes);
      region = extracted.region;
      full = extracted.full;
    } catch (err) {
      console.error("[extract-tag] PDF text parse failed:", err);
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

    // Persist onto the document.
    const { error: updateError } = await supabase
      .from("documents")
      .update({ drawing_title: meta.title, tags: meta.tags })
      .eq("id", documentId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ...meta, source });
  } catch (err) {
    console.error("[extract-tag] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tagging failed." },
      { status: 500 }
    );
  }
}
