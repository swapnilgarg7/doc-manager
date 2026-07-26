"use client";

// The picked directory handle is stored in IndexedDB so a return visit can offer
// a one-click reconnect (the browser re-asks permission). Handles are the one
// thing that MUST live in IndexedDB — they can't be serialized to localStorage.
// Extracted titles/tags live in localStorage instead (see metastore.ts).

const DB_NAME = "docmanager";
const DB_VERSION = 1;
const HANDLES = "handles";
const LAST_ROOT_KEY = "lastRoot";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
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
