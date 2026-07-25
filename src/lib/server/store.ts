import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local, on-disk state for the app. This is the ONLY thing the app writes:
 *   - `root`  — the absolute path of the folder the user chose to scan.
 *   - `files` — extracted { title, tags } per file, keyed by path RELATIVE to
 *               `root`, plus the file's size/mtime at tag time so we can tell
 *               when a file changed on disk and its metadata went stale.
 *
 * The company's actual files are never modified — only this sidecar is.
 * Stored as a single JSON file in a gitignored `.data/` dir next to the app.
 */

export interface FileMeta {
  title: string | null;
  tags: string[];
  /** File size (bytes) when this metadata was computed. */
  size: number;
  /** File mtime (ms) when this metadata was computed. */
  mtimeMs: number;
  taggedAt: string;
}

interface StoreShape {
  root: string | null;
  files: Record<string, FileMeta>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// In-memory cache of the whole store. The Next.js dev/prod server is a single
// Node process, so one in-memory copy + serialized writes is enough to keep the
// many concurrent tag jobs from clobbering each other's updates.
let cache: StoreShape | null = null;
let loading: Promise<StoreShape> | null = null;

async function load(): Promise<StoreShape> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await fs.readFile(INDEX_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      cache = {
        root: typeof parsed.root === "string" ? parsed.root : null,
        files: parsed.files ?? {},
      };
    } catch {
      // Missing/corrupt index — start fresh.
      cache = { root: null, files: {} };
    }
    return cache;
  })();
  return loading;
}

// Serialize every write through a single promise chain so concurrent callers
// (e.g. a pool of tag jobs each saving their result) can't interleave and drop
// each other's entries.
let writeChain: Promise<void> = Promise.resolve();

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    if (!cache) return;
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${INDEX_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
    await fs.rename(tmp, INDEX_PATH); // atomic replace
  });
  return writeChain;
}

export async function getRoot(): Promise<string | null> {
  return (await load()).root;
}

export async function setRoot(absPath: string): Promise<void> {
  const store = await load();
  store.root = absPath;
  await persist();
}

export async function getMeta(relPath: string): Promise<FileMeta | undefined> {
  return (await load()).files[relPath];
}

export async function getAllMeta(): Promise<Record<string, FileMeta>> {
  return (await load()).files;
}

export async function setMeta(relPath: string, meta: FileMeta): Promise<void> {
  const store = await load();
  store.files[relPath] = meta;
  await persist();
}
