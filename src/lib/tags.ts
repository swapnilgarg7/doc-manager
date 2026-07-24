import type { DrawingMeta } from "@/lib/types";

/**
 * Ask the server to extract the drawing title + tags for an uploaded PDF and
 * save them onto the document. Best-effort: never throws (returns null on any
 * failure) so it can be fired alongside uploads without breaking the flow.
 */
export async function tagDocument(
  documentId: string,
  filePath: string,
  fileName: string
): Promise<DrawingMeta | null> {
  try {
    const res = await fetch("/api/extract-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, filePath, fileName }),
    });
    if (!res.ok) return null;
    return (await res.json()) as DrawingMeta;
  } catch {
    return null;
  }
}
