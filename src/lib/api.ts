import type {
  AppConfig,
  DirListing,
  FileItem,
  SearchRow,
  Stats,
} from "@/lib/types";

/**
 * Thin client over the local API routes. Everything lives on the user's own
 * machine — these calls hit the localhost Next.js server, which reads the real
 * filesystem. No files are ever uploaded.
 */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

// ---------------------------------------------------------------------------
// Config (the scanned root folder)
// ---------------------------------------------------------------------------

export async function getConfig(): Promise<AppConfig> {
  return getJson<AppConfig>("/api/config");
}

export async function setRoot(root: string): Promise<AppConfig> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Failed to save folder.");
  return body as AppConfig;
}

/**
 * Open the OS-native "choose folder" dialog on the local machine.
 * Resolves to the chosen absolute path, or null if the user canceled.
 * Throws { unsupported } handling to the caller via a typed result.
 */
export async function pickFolder(): Promise<
  { path: string } | { canceled: true } | { unsupported: true; error: string }
> {
  const res = await fetch("/api/pick-folder", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 501)
    return { unsupported: true, error: body?.error ?? "Not supported." };
  if (!res.ok) throw new Error(body?.error || "Folder picker failed.");
  if (body?.canceled) return { canceled: true };
  return { path: body.path as string };
}

// ---------------------------------------------------------------------------
// Browsing + search
// ---------------------------------------------------------------------------

/** List one directory (relPath ""/undefined = root). */
export async function scan(relPath: string): Promise<DirListing> {
  const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : "";
  return getJson<DirListing>(`/api/scan${qs}`);
}

/** Every file under a folder (recursive) — powers scoped search + retag. */
export async function getSubtree(relPath: string): Promise<SearchRow[]> {
  const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : "";
  const { files } = await getJson<{ files: FileItem[] }>(`/api/subtree${qs}`);
  return files.map((file) => {
    const slash = file.relPath.lastIndexOf("/");
    const folderPath = slash >= 0 ? file.relPath.slice(0, slash) : "";
    const folderName = folderPath.split("/").pop() || "Home";
    return { file, folderPath, folderName };
  });
}

export async function getStats(): Promise<Stats> {
  return getJson<Stats>("/api/stats");
}

// ---------------------------------------------------------------------------
// File URLs (preview / download) — served from disk by /api/file
// ---------------------------------------------------------------------------

export function fileUrl(relPath: string, download = false): string {
  return `/api/file?path=${encodeURIComponent(relPath)}${
    download ? "&download=1" : ""
  }`;
}

// ---------------------------------------------------------------------------
// Search matching (name / extracted title / tag)
// ---------------------------------------------------------------------------

export function matchesQuery(row: SearchRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const { file } = row;
  if (file.name.toLowerCase().includes(needle)) return true;
  if (file.title?.toLowerCase().includes(needle)) return true;
  return file.tags.some((t) => t.toLowerCase().includes(needle));
}
