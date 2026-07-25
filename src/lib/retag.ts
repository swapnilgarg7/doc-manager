import { getSubtree } from "@/lib/api";
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
 * Find every PDF in `relPath` (and everything nested under it) that is still
 * missing a title/tags — including files whose metadata went stale because they
 * changed on disk — and run them through the tagging pipeline.
 *
 * Uses a bounded pool + retry, so it's safe over large numbers of files and is
 * the catch-all for interrupted or throttled runs: one call fills in whatever is
 * still blank.
 */
export async function retagUntagged(
  relPath: string,
  onProgress?: (p: RetagProgress) => void
): Promise<RetagResult> {
  const rows = await getSubtree(relPath);

  const pending = rows
    .map((r) => r.file)
    .filter((f) => f.isPdf && (!f.title || f.tags.length === 0 || f.stale));

  const total = pending.length;
  const result: RetagResult = { total, tagged: 0, failed: 0 };
  if (total === 0) return result;

  onProgress?.({ done: 0, total });

  let done = 0;
  const jobs = pending.map((f) => async () => {
    const meta = await tagDocument(f.relPath);
    if (meta && (meta.title || meta.tags.length > 0)) result.tagged += 1;
    else result.failed += 1;
    done += 1;
    onProgress?.({ done, total });
  });

  await runPool(jobs, 3);
  return result;
}
