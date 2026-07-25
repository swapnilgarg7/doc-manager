import type { DrawingMeta } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the local server to extract a PDF's drawing title + tags and save them to
 * the index. The server reads the file from disk and sends only the title-block
 * snippet to Azure — the file itself never leaves the machine.
 *
 * Best-effort: never throws (returns null on any failure) so it can be fired
 * alongside a bulk scan without breaking the flow. Retries transient failures
 * (429 rate-limits, 5xx, network errors) with exponential backoff.
 */
export async function tagDocument(
  relPath: string,
  { retries = 4 }: { retries?: number } = {}
): Promise<DrawingMeta | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath }),
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
