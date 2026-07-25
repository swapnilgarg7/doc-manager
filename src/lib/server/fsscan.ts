import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getRoot, getAllMeta, type FileMeta } from "@/lib/server/store";
import type { FolderEntry, FileItem, DirListing, Stats } from "@/lib/types";

/** Depth cap so a symlink cycle can't spin the recursive walk forever. */
const MAX_DEPTH = 64;

export function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

/** Normalize a client-supplied relative path to posix, stripping any escape. */
function normalizeRel(relPath: string | null | undefined): string {
  if (!relPath) return "";
  // Split on either separator, drop empty / "." / ".." segments entirely.
  const parts = relPath
    .split(/[/\\]+/)
    .filter((s) => s && s !== "." && s !== "..");
  return parts.join("/");
}

/**
 * Resolve a client relative path to an absolute path GUARANTEED to live under
 * the configured root. `relPath` is untrusted input driving filesystem access,
 * so we reject anything that escapes (`..`, absolute paths) and re-check the
 * real path to defeat symlink escapes.
 */
export async function resolveWithinRoot(
  relPath: string | null | undefined
): Promise<{ root: string; abs: string; rel: string }> {
  const root = await getRoot();
  if (!root) throw new Error("No folder is configured. Set one first.");

  const rel = normalizeRel(relPath);
  const abs = path.resolve(root, rel);

  // Lexical containment check first (root itself is allowed).
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw new Error("Path escapes the configured folder.");
  }

  // Symlink-escape check: the real path must still be under the real root.
  try {
    const realRoot = await fs.realpath(root);
    const realAbs = await fs.realpath(abs);
    const realRootSep = realRoot.endsWith(path.sep)
      ? realRoot
      : realRoot + path.sep;
    if (realAbs !== realRoot && !realAbs.startsWith(realRootSep)) {
      throw new Error("Path escapes the configured folder.");
    }
  } catch (err) {
    // realpath throws if the target doesn't exist — surface as not-found upstream.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("File or folder does not exist.");
    }
    throw err;
  }

  return { root, abs, rel };
}

function crumbsFor(rel: string): FolderEntry[] {
  if (!rel) return [];
  const parts = rel.split("/");
  const crumbs: FolderEntry[] = [];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    crumbs.push({ name: p, relPath: acc });
  }
  return crumbs;
}

/** Merge stored metadata onto a file, treating changed-on-disk entries as stale. */
function mergeMeta(
  rel: string,
  size: number,
  mtimeMs: number,
  all: Record<string, FileMeta>
): { title: string | null; tags: string[]; stale: boolean } {
  const meta = all[rel];
  if (!meta) return { title: null, tags: [], stale: false };
  // Independent ground-truth check: trust stored metadata only if the file's
  // current size + mtime still match what we saw when we tagged it.
  const fresh = meta.size === size && meta.mtimeMs === mtimeMs;
  if (!fresh) return { title: null, tags: [], stale: true };
  return { title: meta.title, tags: meta.tags, stale: false };
}

/** List one directory (non-recursive): subfolders + files with metadata. */
export async function listDir(relPath: string | null): Promise<DirListing> {
  const { abs, rel } = await resolveWithinRoot(relPath);
  const all = await getAllMeta();

  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const folders: FolderEntry[] = [];
  const files: FileItem[] = [];

  for (const d of dirents) {
    if (d.name.startsWith(".")) continue; // skip hidden/system entries
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      folders.push({ name: d.name, relPath: childRel });
    } else if (d.isFile()) {
      let stat;
      try {
        stat = await fs.stat(path.join(abs, d.name));
      } catch {
        continue; // vanished between readdir and stat
      }
      const merged = mergeMeta(childRel, stat.size, stat.mtimeMs, all);
      files.push({
        name: d.name,
        relPath: childRel,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        isPdf: isPdf(d.name),
        title: merged.title,
        tags: merged.tags,
        stale: merged.stale,
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { path: rel, breadcrumbs: crumbsFor(rel), folders, files };
}

/**
 * Every file under `relPath` (recursively), with metadata. Powers search and
 * the "tag untagged" backfill. Depth-bounded so symlink cycles can't loop.
 */
export async function collectFiles(relPath: string | null): Promise<FileItem[]> {
  const { abs, rel } = await resolveWithinRoot(relPath);
  const all = await getAllMeta();
  const out: FileItem[] = [];

  async function walk(dirAbs: string, dirRel: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    let dirents;
    try {
      dirents = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      const childRel = dirRel ? `${dirRel}/${d.name}` : d.name;
      const childAbs = path.join(dirAbs, d.name);
      if (d.isDirectory()) {
        await walk(childAbs, childRel, depth + 1);
      } else if (d.isFile()) {
        let stat;
        try {
          stat = await fs.stat(childAbs);
        } catch {
          continue;
        }
        const merged = mergeMeta(childRel, stat.size, stat.mtimeMs, all);
        out.push({
          name: d.name,
          relPath: childRel,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isPdf: isPdf(d.name),
          title: merged.title,
          tags: merged.tags,
          stale: merged.stale,
        });
      }
    }
  }

  await walk(abs, rel, 0);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Whole-tree counts for the dashboard, computed in a single walk. */
export async function computeStats(): Promise<Stats> {
  const { abs } = await resolveWithinRoot("");
  const all = await getAllMeta();
  const stats: Stats = { folders: 0, files: 0, pdfs: 0, tagged: 0 };

  async function walk(dirAbs: string, dirRel: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    let dirents;
    try {
      dirents = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      const childRel = dirRel ? `${dirRel}/${d.name}` : d.name;
      const childAbs = path.join(dirAbs, d.name);
      if (d.isDirectory()) {
        stats.folders += 1;
        await walk(childAbs, childRel, depth + 1);
      } else if (d.isFile()) {
        stats.files += 1;
        if (isPdf(d.name)) stats.pdfs += 1;
        let stat;
        try {
          stat = await fs.stat(childAbs);
        } catch {
          continue;
        }
        const merged = mergeMeta(childRel, stat.size, stat.mtimeMs, all);
        if (merged.title || merged.tags.length > 0) stats.tagged += 1;
      }
    }
  }

  await walk(abs, "", 0);
  return stats;
}
