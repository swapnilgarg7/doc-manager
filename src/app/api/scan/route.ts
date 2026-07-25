import { NextResponse } from "next/server";
import { listDir } from "@/lib/server/fsscan";
import { getRoot } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/scan?path=<relPath> → DirListing for one directory. */
export async function GET(req: Request) {
  try {
    if (!(await getRoot())) {
      return NextResponse.json({ error: "no-root" }, { status: 409 });
    }
    const url = new URL(req.url);
    const rel = url.searchParams.get("path");
    const listing = await listDir(rel);
    return NextResponse.json(listing);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to scan folder." },
      { status: 400 }
    );
  }
}
