import { NextResponse } from "next/server";
import { classifyFromText, classifyFromImage } from "@/lib/server/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const present = (v?: string) => Boolean(v && v.trim());

/**
 * GET /api/extract-tag — health check. Reports which Azure env vars are present
 * (booleans only, never the values) so the UI can warn clearly when tagging
 * isn't configured on the server (the common cause of 500s after deploying
 * without setting env vars).
 */
export async function GET() {
  const azure = {
    endpoint: present(process.env.AZURE_OPENAI_ENDPOINT),
    apiKey: present(process.env.AZURE_OPENAI_API_KEY),
    apiVersion: present(process.env.AZURE_OPENAI_API_VERSION),
    deployment: present(process.env.AZURE_OPENAI_DEPLOYMENT),
  };
  const configured = Object.values(azure).every(Boolean);
  return NextResponse.json({ configured, azure });
}

/**
 * POST /api/extract-tag
 * Body: { fileName: string, text?: string, imageBase64?: string }
 *
 * Receives ONLY a title-block snippet that the browser extracted from the PDF
 * (either the scraped bottom-right text, or a cropped image of that corner) and
 * asks Azure OpenAI for { title, tags }. The full PDF is never sent here — it
 * stays in the user's browser. This is what makes the app safe to deploy.
 */
export async function POST(req: Request) {
  try {
    const { fileName, text, imageBase64 } = await req.json();
    const name = typeof fileName === "string" ? fileName : "drawing.pdf";

    if (typeof text === "string" && text.trim().length >= 8) {
      const meta = await classifyFromText(text, name);
      return NextResponse.json({ ...meta, source: "text" });
    }

    if (typeof imageBase64 === "string" && imageBase64.length > 0) {
      const meta = await classifyFromImage(imageBase64, name);
      return NextResponse.json({ ...meta, source: "image" });
    }

    return NextResponse.json(
      { title: null, tags: [], skipped: "no-snippet" },
      { status: 200 }
    );
  } catch (err) {
    console.error("[extract-tag] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tagging failed." },
      { status: 500 }
    );
  }
}
