"use client";

import type { FileMeta } from "@/lib/types";

// All persistence is browser-local (IndexedDB). Two stores:
//   - "handles": the last picked directory handle, so a return visit can offer a
//     one-click reconnect (the browser re-asks permission).
//   - "meta": extracted { title, tags, size, lastModified } per file, keyed by
//     `${rootKey}::${relPath}` so each write is a single put() with no
//     read-modify-write race across concurrent tag jobs.

const DB_NAME = "docmanager";
const DB_VERSION = 1;
const HANDLES = "handles";
const META = "meta";
const LAST_ROOT_KEY = "lastRoot";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

// ---------------------------------------------------------------------------
// Directory handle (for one-click reconnect on return)
// ---------------------------------------------------------------------------

export interface StoredRoot {
  name: string;
  handle: FileSystemDirectoryHandle;
}

export async function saveRootHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await tx(HANDLES, "readwrite", (s) =>
    s.put({ name: handle.name, handle }, LAST_ROOT_KEY)
  );
}

export async function loadRootHandle(): Promise<StoredRoot | null> {
  try {
    const v = await tx<StoredRoot | undefined>(HANDLES, "readonly", (s) =>
      s.get(LAST_ROOT_KEY)
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function clearRootHandle(): Promise<void> {
  await tx(HANDLES, "readwrite", (s) => s.delete(LAST_ROOT_KEY));
}

// ---------------------------------------------------------------------------
// Per-file metadata
// ---------------------------------------------------------------------------

const metaKey = (rootKey: string, relPath: string) => `${rootKey}::${relPath}`;

export async function setMeta(
  rootKey: string,
  relPath: string,
  meta: FileMeta
): Promise<void> {
  await tx(META, "readwrite", (s) => s.put(meta, metaKey(rootKey, relPath)));
}

/** All metadata for one root, as a { relPath: FileMeta } map. */
export async function getAllMeta(
  rootKey: string
): Promise<Record<string, FileMeta>> {
  const db = await openDb();
  try {
    return await new Promise<Record<string, FileMeta>>((resolve, reject) => {
      const out: Record<string, FileMeta> = {};
      const prefix = `${rootKey}::`;
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const t = db.transaction(META, "readonly");
      const req = t.objectStore(META).openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const relPath = String(cursor.key).slice(prefix.length);
          out[relPath] = cursor.value as FileMeta;
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
