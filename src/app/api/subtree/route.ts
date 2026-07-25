import { NextResponse } from "next/server";
import { collectFiles } from "@/lib/server/fsscan";
import { getRoot } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/subtree?path=<relPath> → { files: FileItem[] } (recursive). */
export async function GET(req: Request) {
  try {
    if (!(await getRoot())) {
      return NextResponse.json({ error: "no-root" }, { status: 409 });
    }
    const url = new URL(req.url);
    const rel = url.searchParams.get("path");
    const files = await collectFiles(rel);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read folder." },
      { status: 400 }
    );
  }
}
