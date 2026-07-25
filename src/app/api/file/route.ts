import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolveWithinRoot } from "@/lib/server/fsscan";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  dwg: "application/acad",
  dxf: "application/dxf",
};

function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * GET /api/file?path=<relPath>[&download=1]
 * Streams a file from local disk for inline preview or download. The path is
 * resolved strictly within the configured root (traversal/symlink guarded).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rel = url.searchParams.get("path");
    const download = url.searchParams.get("download") === "1";

    const { abs } = await resolveWithinRoot(rel);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      return new Response("Not a file", { status: 400 });
    }

    const name = abs.split(/[/\\]/).pop() ?? "file";
    const disposition = download ? "attachment" : "inline";
    // RFC 5987 filename* handles non-ASCII names safely.
    const encoded = encodeURIComponent(name);

    const webStream = Readable.toWeb(
      createReadStream(abs)
    ) as unknown as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentTypeFor(name),
        "Content-Length": String(stat.size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read file.";
    const status = message.includes("does not exist") ? 404 : 400;
    return new Response(message, { status });
  }
}
