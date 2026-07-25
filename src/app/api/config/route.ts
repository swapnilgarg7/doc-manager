import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRoot, setRoot } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * Clean up a path the user typed or pasted before we use it:
 *  - trims whitespace / stray newlines
 *  - strips surrounding quotes ("…" or '…')
 *  - un-escapes shell-escaped spaces ("\ " → " ") from terminal drag-and-drop
 *  - expands a leading ~ to the home directory
 *  - resolves to an absolute, normalized path (this also strips any TRAILING
 *    slash — a trailing slash used to make the containment check reject the
 *    folder itself).
 */
export function normalizeRootInput(input: string): string {
  let p = input.trim();
  if (
    p.length >= 2 &&
    ((p.startsWith('"') && p.endsWith('"')) ||
      (p.startsWith("'") && p.endsWith("'")))
  ) {
    p = p.slice(1, -1);
  }
  p = p.replace(/\\ /g, " ").trim();
  if (p === "~") p = os.homedir();
  else if (p.startsWith("~/") || p.startsWith("~\\")) {
    p = path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

/** GET /api/config → { root } */
export async function GET() {
  return NextResponse.json({ root: await getRoot() });
}

/**
 * POST /api/config  Body: { root: string }
 * Normalizes then validates the path (exists + is a directory + is readable)
 * before saving it.
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
    const abs = normalizeRootInput(root);

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
        { error: "That path is a file, not a folder. Pick the folder it's in." },
        { status: 400 }
      );
    }
    // Confirm we can actually list it — surfaces macOS permission prompts early.
    try {
      await fs.readdir(abs);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        return NextResponse.json(
          {
            error:
              "Permission denied reading that folder. On macOS, grant your terminal (or the app running this) Full Disk Access in System Settings › Privacy & Security, then try again.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Couldn't read that folder: ${(err as Error).message}` },
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
