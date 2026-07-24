import { getSubtreeDocuments } from "@/lib/api";
import { tagDocument } from "@/lib/tags";
import { runPool } from "@/lib/pool";

export interface RetagProgress {
  done: number;
  total: number;
}

export interface RetagResult {
  total: number;
  tagged: number;
  failed: number;
}

/**
 * Find every document in `folderId` (and everything nested under it) that is
 * still missing a title or tags, and run them through the tagging pipeline.
 *
 * This is the catch-all for bulk imports that were interrupted or partially
 * throttled: it never matters if a batch didn't finish tagging — one call fills
 * in whatever is still blank. Uses the same bounded pool + retry as import, so
 * it's safe to run over large numbers of documents.
 */
export async function retagUntagged(
  folderId: string,
  onProgress?: (p: RetagProgress) => void
): Promise<RetagResult> {
  const rows = await getSubtreeDocuments(folderId);

  const pending = rows
    .map((r) => r.document)
    .filter((d) => {
      const latest = d.latest;
      if (!latest || !latest.file_name.toLowerCase().endsWith(".pdf")) return false;
      // Missing title OR no tags = still needs processing.
      return !d.drawing_title || d.tags.length === 0;
    });

  const total = pending.length;
  const result: RetagResult = { total, tagged: 0, failed: 0 };
  if (total === 0) return result;

  onProgress?.({ done: 0, total });

  let done = 0;
  const jobs = pending.map((d) => async () => {
    const latest = d.latest!;
    const meta = await tagDocument(d.id, latest.file_path, latest.file_name);
    if (meta && (meta.title || meta.tags.length > 0)) result.tagged += 1;
    else result.failed += 1;
    done += 1;
    onProgress?.({ done, total });
  });

  await runPool(jobs, 3);
  return result;
}
