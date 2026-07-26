"use client";

import type { DrawingMeta, FileNode } from "@/lib/types";
import {
  extractTitleBlockText,
  renderTitleBlockImage,
} from "@/lib/extract-client";
import { setMeta } from "@/lib/metastore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-request ceiling so a hung Azure call can't block a pool worker forever. */
const REQUEST_TIMEOUT_MS = 45_000;

/** Is AI tagging configured on the server? Reports missing Azure env vars. */
export async function checkTaggingConfig(): Promise<{
  configured: boolean;
  missing: string[];
}> {
  try {
    const res = await fetch("/api/extract-tag", { method: "GET" });
    if (!res.ok) return { configured: false, missing: ["server unreachable"] };
    const data = (await res.json()) as {
      configured: boolean;
      azure: Record<string, boolean>;
    };
    const missing = Object.entries(data.azure ?? {})
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    return { configured: Boolean(data.configured), missing };
  } catch {
    return { configured: false, missing: ["network error"] };
  }
}

/** Post a title-block snippet to the server and get back { title, tags }. */
async function postSnippet(
  body: { fileName: string; text?: string; imageBase64?: string },
  retries: number,
  onServerError?: (message: string) => void
): Promise<DrawingMeta | null> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/extract-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return (await res.json()) as DrawingMeta;
      // Capture the server's error message (e.g. missing Azure config, bad key)
      // so the UI can show *why* tagging failed instead of a silent 500.
      const errText = await res
        .json()
        .then((b) => (b && typeof b.error === "string" ? b.error : ""))
        .catch(() => "");
      if (errText) onServerError?.(errText);
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) return null;
    } catch {
      // Timeout/abort or network error — retry unless attempts exhausted.
      if (attempt >= retries) return null;
    } finally {
      clearTimeout(timer);
    }
    // Exponential backoff with jitter: ~0.8s, 1.6s, 3.2s, 6.4s.
    await sleep(800 * 2 ** attempt + Math.random() * 400);
  }
}

/**
 * Tag one PDF: read it from disk in the browser, extract the title-block snippet
 * locally, post ONLY that snippet for Azure classification, and save the result
 * to IndexedDB. The PDF bytes never leave the browser. Best-effort — returns
 * null on any failure so it's safe to fire in a batch.
 */
export async function tagFile(
  rootKey: string,
  node: FileNode,
  {
    retries = 4,
    onServerError,
  }: { retries?: number; onServerError?: (message: string) => void } = {}
): Promise<DrawingMeta | null> {
  if (!node.isPdf) return null;

  let file: File;
  try {
    file = await node.handle.getFile();
  } catch {
    return null;
  }

  // Try the deterministic text layer first; fall back to a rendered crop.
  let region = "";
  let full = "";
  try {
    ({ region, full } = await extractTitleBlockText(file));
  } catch {
    /* no text layer / parse failure — fall through to image */
  }

  let body: { fileName: string; text?: string; imageBase64?: string };
  if (full.trim().length >= 20) {
    body = { fileName: node.name, text: region.length >= 8 ? region : full };
  } else {
    const image = await renderTitleBlockImage(file);
    if (!image) return null;
    body = { fileName: node.name, imageBase64: image };
  }

  const meta = await postSnippet(body, retries, onServerError);
  if (meta) {
    // Synchronous localStorage write — persisted the instant this file is tagged.
    setMeta(rootKey, node.relPath, {
      title: meta.title,
      tags: meta.tags,
      size: node.size,
      lastModified: node.lastModified,
      taggedAt: new Date().toISOString(),
    });
  }
  return meta;
}
