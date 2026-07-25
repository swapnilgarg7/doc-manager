"use client";

import { runPool } from "@/lib/pool";
import { tagFile } from "@/lib/tags";
import type { DrawingMeta, FileNode } from "@/lib/types";

export interface RetagResult {
  total: number;
  tagged: number;
  failed: number;
}

/**
 * Tag many PDFs through a bounded pool with retry. `onTagged` fires per file so
 * the UI can update as results stream in; `onProgress` drives the counter.
 */
export async function tagMany(
  rootKey: string,
  nodes: FileNode[],
  onTagged: (relPath: string, meta: DrawingMeta) => void,
  onProgress?: (p: { done: number; total: number }) => void
): Promise<RetagResult> {
  const total = nodes.length;
  const result: RetagResult = { total, tagged: 0, failed: 0 };
  if (total === 0) return result;

  onProgress?.({ done: 0, total });

  let done = 0;
  const jobs = nodes.map((node) => async () => {
    const meta = await tagFile(rootKey, node);
    if (meta && (meta.title || meta.tags.length > 0)) {
      result.tagged += 1;
      onTagged(node.relPath, meta);
    } else {
      result.failed += 1;
    }
    done += 1;
    onProgress?.({ done, total });
  });

  await runPool(jobs, 3);
  return result;
}
