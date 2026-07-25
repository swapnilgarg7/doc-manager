"use client";

import type { DrawingMeta, FileNode } from "@/lib/types";
import {
  extractTitleBlockText,
  renderTitleBlockImage,
} from "@/lib/extract-client";
import { setMeta } from "@/lib/idb";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Post a title-block snippet to the server and get back { title, tags }. */
async function postSnippet(
  body: { fileName: string; text?: string; imageBase64?: string },
  retries: number
): Promise<DrawingMeta | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("/api/extract-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as DrawingMeta;
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) return null;
    } catch {
      if (attempt >= retries) return null;
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
  { retries = 4 }: { retries?: number } = {}
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

  const meta = await postSnippet(body, retries);
  if (meta) {
    await setMeta(rootKey, node.relPath, {
      title: meta.title,
      tags: meta.tags,
      size: node.size,
      lastModified: node.lastModified,
      taggedAt: new Date().toISOString(),
    });
  }
  return meta;
}
