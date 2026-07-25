import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { getRoot, setRoot } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/config → { root } */
export async function GET() {
  return NextResponse.json({ root: await getRoot() });
}

/**
 * POST /api/config  Body: { root: string }
 * Validates the path exists and is a directory before saving it.
 */
export async function POST(req: Request) {
  try {
    const { root } = await req.json();
    if (typeof root !== "string" || !root.trim()) {
      return NextResponse.json(
        { error: "A folder path is required." },
        { status: 400 }
      );
    }
    const abs = root.trim();
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return NextResponse.json(
        { error: `That path doesn't exist: ${abs}` },
        { status: 400 }
      );
    }
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: "That path is not a folder." },
        { status: 400 }
      );
    }
    await setRoot(abs);
    return NextResponse.json({ root: abs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save folder." },
      { status: 500 }
    );
  }
}
