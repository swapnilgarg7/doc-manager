"use client";

import type { DirNode, FileNode } from "@/lib/types";

const MAX_DEPTH = 64;

/** True when this browser supports the File System Access API. */
export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

/** Open the native folder picker and return the chosen directory handle. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ mode: "read" });
  } catch (err) {
    // AbortError = user canceled the picker.
    if ((err as DOMException)?.name === "AbortError") return null;
    throw err;
  }
}

/** Do we already have read permission for this handle (no prompt)? */
export async function hasPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  if (!handle.queryPermission) return true; // older impls grant implicitly
  const state = await handle.queryPermission({ mode: "read" });
  return state === "granted";
}

/** Request read permission — MUST be called from a user gesture (a click). */
export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  if (!handle.requestPermission) return true;
  const state = await handle.requestPermission({ mode: "read" });
  return state === "granted";
}

/**
 * Recursively read a directory handle into an in-memory tree. Hidden/system
 * entries (dot-files) are skipped; each file's size + lastModified are captured
 * (via a cheap getFile) so we can show them and detect edits later.
 */
export async function walkDirectory(
  root: FileSystemDirectoryHandle
): Promise<DirNode> {
  async function walk(
    handle: FileSystemDirectoryHandle,
    relPath: string,
    depth: number
  ): Promise<DirNode> {
    const node: DirNode = {
      kind: "dir",
      name: handle.name,
      relPath,
      dirs: [],
      files: [],
    };
    if (depth > MAX_DEPTH) return node;

    for await (const entry of handle.values()) {
      if (entry.name.startsWith(".")) continue;
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        node.dirs.push(
          await walk(entry as FileSystemDirectoryHandle, childRel, depth + 1)
        );
      } else {
        const fh = entry as FileSystemFileHandle;
        let size = 0;
        let lastModified = 0;
        try {
          const f = await fh.getFile();
          size = f.size;
          lastModified = f.lastModified;
        } catch {
          continue; // unreadable file — skip
        }
        const file: FileNode = {
          kind: "file",
          name: entry.name,
          relPath: childRel,
          handle: fh,
          size,
          lastModified,
          isPdf: isPdf(entry.name),
        };
        node.files.push(file);
      }
    }

    node.dirs.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) => a.name.localeCompare(b.name));
    return node;
  }

  return walk(root, "", 0);
}

/** Find a directory node by its relPath ("" = root). */
export function findDir(root: DirNode, relPath: string): DirNode | null {
  if (!relPath) return root;
  const parts = relPath.split("/");
  let node: DirNode = root;
  for (const part of parts) {
    const next = node.dirs.find((d) => d.name === part);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** All files at or under a directory node (recursive). */
export function collectFiles(node: DirNode): FileNode[] {
  const out: FileNode[] = [];
  const stack: DirNode[] = [node];
  while (stack.length) {
    const d = stack.pop()!;
    out.push(...d.files);
    stack.push(...d.dirs);
  }
  return out;
}

/** Breadcrumb trail (name + relPath) from root to the given path. */
export function crumbsFor(relPath: string): { name: string; relPath: string }[] {
  if (!relPath) return [];
  const parts = relPath.split("/");
  const crumbs: { name: string; relPath: string }[] = [];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    crumbs.push({ name: p, relPath: acc });
  }
  return crumbs;
}
