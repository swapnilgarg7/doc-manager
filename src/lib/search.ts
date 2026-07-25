import type { FileNode, FileView, FileMeta } from "@/lib/types";

/** Merge a file with its stored metadata, flagging edits-on-disk as stale. */
export function toView(file: FileNode, meta?: FileMeta): FileView {
  if (!meta) return { ...file, title: null, tags: [], tagged: false, stale: false };
  // Independent freshness check: trust metadata only if size + mtime still match.
  const fresh = meta.size === file.size && meta.lastModified === file.lastModified;
  if (!fresh) return { ...file, title: null, tags: [], tagged: false, stale: true };
  const tagged = Boolean(meta.title || meta.tags.length > 0);
  return { ...file, title: meta.title, tags: meta.tags, tagged, stale: false };
}

/** True if a file matches the query by name, extracted title, or any tag. */
export function matchesQuery(v: FileView, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (v.name.toLowerCase().includes(needle)) return true;
  if (v.title?.toLowerCase().includes(needle)) return true;
  return v.tags.some((t) => t.toLowerCase().includes(needle));
}
