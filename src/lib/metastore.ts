"use client";

import type { FileMeta } from "@/lib/types";

// Per-file metadata (titles/tags) is persisted in localStorage, keyed by root.
//
// Why localStorage and not IndexedDB: it's synchronous and single-threaded, so a
// tag result is written the instant it completes with no transactions, no
// connection juggling, and no read-modify-write races between concurrent tag
// jobs. Metadata is tiny (a title + a few tags per file), so the ~5MB budget
// comfortably holds thousands of files. (The directory handle still lives in
// IndexedDB — see idb.ts — because handles can't be serialized here.)

const PREFIX = "docmanager:meta:";

const storeKey = (rootKey: string) => `${PREFIX}${rootKey}`;

function safeParse(raw: string | null): Record<string, FileMeta> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, FileMeta>) : {};
  } catch {
    return {};
  }
}

/** All metadata for one root, as a { relPath: FileMeta } map. */
export function getAllMeta(rootKey: string): Record<string, FileMeta> {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(storeKey(rootKey)));
}

/**
 * Save one file's metadata. Synchronous read-modify-write is atomic here (no
 * await in the middle), so concurrent tag jobs can't clobber each other.
 */
export function setMeta(rootKey: string, relPath: string, meta: FileMeta): void {
  if (typeof window === "undefined") return;
  const all = getAllMeta(rootKey);
  all[relPath] = meta;
  try {
    window.localStorage.setItem(storeKey(rootKey), JSON.stringify(all));
  } catch (err) {
    // QuotaExceededError on a very large library — keep going, best-effort.
    console.error("[metastore] could not persist metadata:", err);
  }
}

/** Forget all metadata for a root. */
export function clearMeta(rootKey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storeKey(rootKey));
}
