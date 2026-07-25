import { NextResponse } from "next/server";
import { computeStats } from "@/lib/server/fsscan";
import { getRoot } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/stats → { folders, files, pdfs, tagged } for the whole tree. */
export async function GET() {
  try {
    if (!(await getRoot())) {
      return NextResponse.json({ folders: 0, files: 0, pdfs: 0, tagged: 0 });
    }
    return NextResponse.json(await computeStats());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute stats." },
      { status: 400 }
    );
  }
}
