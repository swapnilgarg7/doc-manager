import { NextResponse } from "next/server";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabase/client";
import { extractTitleBlockText, classifyDrawing } from "@/lib/server/extract";

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

    // Deterministic extraction of the bottom-right title block.
    let text = "";
    try {
      const { region, full } = await extractTitleBlockText(bytes);
      text = region.length >= 8 ? region : full;
    } catch (err) {
      console.error("[extract-tag] PDF parse failed:", err);
    }

    if (!text.trim()) {
      // Likely a scanned/image-only PDF with no text layer.
      return NextResponse.json({ title: null, tags: [], skipped: "no-text" });
    }

    // AI classification.
    const meta = await classifyDrawing(text, name);

    // Persist onto the document.
    const { error: updateError } = await supabase
      .from("documents")
      .update({ drawing_title: meta.title, tags: meta.tags })
      .eq("id", documentId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(meta);
  } catch (err) {
    console.error("[extract-tag] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tagging failed." },
      { status: 500 }
    );
  }
}
