import type { DrawingMeta } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the server to extract the drawing title + tags for an uploaded PDF and
 * save them onto the document. Best-effort: never throws (returns null on any
 * failure) so it can be fired alongside uploads without breaking the flow.
 *
 * Retries transient failures (429 rate-limits, 5xx, network errors) with
 * exponential backoff — this is what makes bulk imports of many PDFs reliable,
 * since Azure OpenAI throttles bursts of concurrent requests.
 */
export async function tagDocument(
  documentId: string,
  filePath: string,
  fileName: string,
  { retries = 4 }: { retries?: number } = {}
): Promise<DrawingMeta | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/extract-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, filePath, fileName }),
      });
      if (res.ok) return (await res.json()) as DrawingMeta;
      // Retry throttling / transient server errors; give up on client errors.
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) return null;
    } catch {
      // Network/abort error — retry unless we've exhausted attempts.
      if (attempt >= retries) return null;
    }
    // Exponential backoff with jitter: ~0.8s, 1.6s, 3.2s, 6.4s.
    await sleep(800 * 2 ** attempt + Math.random() * 400);
  }
}
