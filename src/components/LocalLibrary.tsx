"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirNode, FileMeta, FileNode, FileView, Stats } from "@/lib/types";
import {
  isFsAccessSupported,
  pickDirectory,
  hasPermission,
  requestPermission,
  walkDirectory,
  findDir,
  collectFiles,
  crumbsFor,
} from "@/lib/fsaccess";
import { loadRootHandle, saveRootHandle, clearRootHandle } from "@/lib/idb";
import { getAllMeta, clearMeta } from "@/lib/metastore";
import { toView, matchesQuery } from "@/lib/search";
import { tagFile } from "@/lib/tags";
import { tagMany } from "@/lib/retag";
import { ConfigNotice } from "./ConfigNotice";
import { TagBadges } from "./TagBadges";
import {
  FolderIcon,
  FileIcon,
  EyeIcon,
  DownloadIcon,
  ChevronRight,
  TagIcon,
  SearchIcon,
  CloseIcon,
  HomeIcon,
  PencilIcon,
} from "./icons";
import { formatBytes, formatDateFromMs, documentDisplayName } from "@/lib/format";

type Phase = "init" | "unsupported" | "empty" | "reconnect" | "scanning" | "ready";

function countDirs(node: DirNode): number {
  let n = node.dirs.length;
  for (const d of node.dirs) n += countDirs(d);
  return n;
}

export function LocalLibrary() {
  const [phase, setPhase] = useState<Phase>("init");
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [rootKey, setRootKey] = useState("");
  const [root, setRoot] = useState<DirNode | null>(null);
  const [meta, setMeta] = useState<Record<string, FileMeta>>({});
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [taggingPath, setTaggingPath] = useState<string | null>(null);
  const [retagging, setRetagging] = useState(false);
  const [retagProgress, setRetagProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [retagMsg, setRetagMsg] = useState<string | null>(null);

  // Fast relPath → FileNode lookup (for updating metadata after tagging).
  const fileByPath = useMemo(() => {
    const map = new Map<string, FileNode>();
    if (root) for (const f of collectFiles(root)) map.set(f.relPath, f);
    return map;
  }, [root]);

  const scan = useCallback(async (h: FileSystemDirectoryHandle) => {
    setPhase("scanning");
    setError(null);
    try {
      const key = h.name;
      const tree = await walkDirectory(h);
      setRootKey(key);
      setRoot(tree);
      setMeta(getAllMeta(key)); // synchronous read from localStorage
      setCurrentPath("");
      setQuery("");
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read folder.");
      setPhase("empty");
    }
  }, []);

  // On mount: detect support, then try to reconnect to a previously picked folder.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!isFsAccessSupported()) {
        if (active) setPhase("unsupported");
        return;
      }
      const stored = await loadRootHandle();
      if (!active) return;
      if (!stored) {
        setPhase("empty");
        return;
      }
      setHandle(stored.handle);
      setRootKey(stored.name);
      if (await hasPermission(stored.handle)) {
        await scan(stored.handle);
      } else {
        setPhase("reconnect"); // needs a click to re-grant permission
      }
    })();
    return () => {
      active = false;
    };
  }, [scan]);

  async function choose() {
    setError(null);
    try {
      const picked = await pickDirectory();
      if (!picked) return; // canceled
      setHandle(picked);
      await saveRootHandle(picked);
      await scan(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open that folder.");
    }
  }

  async function reconnect() {
    if (!handle) return;
    setError(null);
    if (await requestPermission(handle)) {
      await scan(handle);
    } else {
      setError("Permission was denied. Choose the folder again to continue.");
      setPhase("empty");
    }
  }

  async function forget() {
    await clearRootHandle();
    if (rootKey) clearMeta(rootKey);
    setHandle(null);
    setRoot(null);
    setMeta({});
    setRootKey("");
    setPhase("empty");
  }

  function applyMeta(relPath: string, m: FileMeta) {
    setMeta((prev) => ({ ...prev, [relPath]: m }));
  }

  async function tagOne(node: FileNode) {
    setTaggingPath(node.relPath);
    try {
      const res = await tagFile(rootKey, node);
      if (res) {
        applyMeta(node.relPath, {
          title: res.title,
          tags: res.tags,
          size: node.size,
          lastModified: node.lastModified,
          taggedAt: new Date().toISOString(),
        });
      }
    } finally {
      setTaggingPath(null);
    }
  }

  async function handleRetag(scopeDir: DirNode) {
    const pending = collectFiles(scopeDir).filter((f) => {
      if (!f.isPdf) return false;
      const v = toView(f, meta[f.relPath]);
      return !v.tagged || v.stale;
    });
    setRetagging(true);
    setRetagMsg(null);
    setRetagProgress({ done: 0, total: pending.length });
    try {
      const result = await tagMany(
        rootKey,
        pending,
        (relPath, m) => {
          const node = fileByPath.get(relPath);
          if (node)
            applyMeta(relPath, {
              title: m.title,
              tags: m.tags,
              size: node.size,
              lastModified: node.lastModified,
              taggedAt: new Date().toISOString(),
            });
        },
        setRetagProgress
      );
      if (result.total === 0) setRetagMsg("Every PDF here is already tagged.");
      else
        setRetagMsg(
          `Tagged ${result.tagged} of ${result.total} PDF${
            result.total === 1 ? "" : "s"
          }${result.failed ? ` · ${result.failed} still failed (try again)` : ""}.`
        );
    } catch (err) {
      setRetagMsg(err instanceof Error ? err.message : "Tagging failed.");
    } finally {
      setRetagging(false);
      setRetagProgress(null);
    }
  }

  async function openFile(node: FileNode, download = false) {
    try {
      const file = await node.handle.getFile();
      const url = URL.createObjectURL(file);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = node.name;
        a.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      // Give the browser time to load, then release the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Couldn't open that file — it may have moved. Try rescanning.");
    }
  }

  // ---- Render states -------------------------------------------------------

  if (phase === "unsupported") return <ConfigNotice variant="unsupported" />;

  if (phase === "init") {
    return <div className="card h-24 animate-pulse bg-slate-100" />;
  }

  if (phase === "reconnect") {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <FolderIcon width={24} height={24} />
        </span>
        <div>
          <p className="font-medium text-slate-700">
            Reconnect to “{rootKey}”
          </p>
          <p className="text-sm text-slate-400">
            For your security the browser needs permission again to read this
            folder.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={reconnect}>
            <FolderIcon width={16} height={16} />
            Reconnect
          </button>
          <button className="btn-secondary" onClick={choose}>
            Pick a different folder
          </button>
        </div>
        <button
          className="text-xs text-slate-400 underline hover:text-slate-600"
          onClick={forget}
        >
          Forget this folder
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="space-y-6">
        <ConfigNotice variant="unset" />
        <div className="card flex flex-col items-center justify-center gap-3 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FolderIcon width={24} height={24} />
          </span>
          <div>
            <p className="font-medium text-slate-700">Choose a folder to scan</p>
            <p className="text-sm text-slate-400">
              A folder-picker window opens. Local, network, and cloud
              (OneDrive/Dropbox) folders all work.
            </p>
          </div>
          <button className="btn-primary" onClick={choose}>
            <FolderIcon width={16} height={16} />
            Choose folder
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  if (phase === "scanning") {
    return (
      <div className="space-y-4">
        <div className="h-5 w-64 animate-pulse rounded bg-slate-200" />
        <p className="text-sm text-slate-500">Reading “{rootKey}”…</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  // phase === "ready"
  if (!root) return null;
  const currentDir = findDir(root, currentPath) ?? root;
  const crumbs = crumbsFor(currentPath);

  const stats: Stats = (() => {
    const all = collectFiles(root);
    const pdfs = all.filter((f) => f.isPdf).length;
    const tagged = all.filter((f) => toView(f, meta[f.relPath]).tagged).length;
    return { folders: countDirs(root), files: all.length, pdfs, tagged };
  })();

  const currentViews: FileView[] = currentDir.files.map((f) =>
    toView(f, meta[f.relPath])
  );

  const searchViews: FileView[] = query.trim()
    ? collectFiles(currentDir)
        .map((f) => toView(f, meta[f.relPath]))
        .filter((v) => matchesQuery(v, query))
    : [];

  return (
    <div className="space-y-6">
      {/* Folder bar */}
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <FolderIcon width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Scanning folder
          </p>
          <p className="truncate font-mono text-sm text-slate-800">{rootKey}</p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => handle && scan(handle)}
          title="Re-read the folder to pick up added/removed files"
        >
          Rescan
        </button>
        <button className="btn-secondary" onClick={choose}>
          <PencilIcon width={15} height={15} />
          Change
        </button>
      </div>

      <StatsRow stats={stats} />

      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <button
          onClick={() => setCurrentPath("")}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100 hover:text-slate-700"
        >
          <HomeIcon width={15} height={15} />
          {rootKey}
        </button>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={c.relPath} className="flex items-center gap-1">
              <ChevronRight width={14} height={14} className="text-slate-300" />
              {isLast ? (
                <span className="px-1.5 py-1 font-medium text-slate-800">
                  {c.name}
                </span>
              ) : (
                <button
                  onClick={() => setCurrentPath(c.relPath)}
                  className="rounded-md px-1.5 py-1 hover:bg-slate-100 hover:text-slate-700"
                >
                  {c.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {currentPath ? currentDir.name : "All documents"}
        </h1>
        <button
          className="btn-secondary"
          onClick={() => handleRetag(currentDir)}
          disabled={retagging}
          title="Tag every PDF here (and in subfolders) still missing a title/tags"
        >
          <TagIcon width={16} height={16} />
          {retagging
            ? `Tagging… ${retagProgress?.done ?? 0}/${retagProgress?.total ?? 0}`
            : "Tag untagged"}
        </button>
      </div>
      {retagMsg && (
        <p className="-mt-2 text-xs font-medium text-brand-600">{retagMsg}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Search */}
      <div className="relative">
        <SearchIcon
          width={17}
          height={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          className="input pl-9 pr-9"
          placeholder={`Search titles & tags in “${
            currentPath ? currentDir.name : rootKey
          }” (incl. subfolders)…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Clear search"
          >
            <CloseIcon width={15} height={15} />
          </button>
        )}
      </div>

      {query.trim() ? (
        <SearchResults
          views={searchViews}
          query={query}
          onOpen={openFile}
          onTagClick={setQuery}
        />
      ) : (
        <>
          {currentDir.dirs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Folders
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {currentDir.dirs.map((d) => (
                  <button
                    key={d.relPath}
                    onClick={() => setCurrentPath(d.relPath)}
                    className="card group flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <FolderIcon width={18} height={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {d.name}
                    </span>
                    <ChevronRight className="text-slate-300" width={16} height={16} />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Documents
            </h2>
            {currentViews.length === 0 ? (
              <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FileIcon width={22} height={22} />
                </span>
                <p className="font-medium text-slate-700">No files here</p>
                <p className="text-sm text-slate-400">
                  {currentDir.dirs.length > 0
                    ? "Open a folder above."
                    : "This folder is empty."}
                </p>
              </div>
            ) : (
              <div className="card divide-y divide-slate-100">
                {currentViews.map((v) => (
                  <FileRow
                    key={v.relPath}
                    view={v}
                    tagging={taggingPath === v.relPath}
                    onTag={() => tagOne(v)}
                    onOpen={openFile}
                    onTagClick={setQuery}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatsRow({ stats }: { stats: Stats }) {
  const items = [
    { label: "Folders", value: stats.folders },
    { label: "Files", value: stats.files },
    { label: "PDFs", value: stats.pdfs },
    { label: "Tagged", value: stats.tagged },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="card px-4 py-3">
          <div className="text-2xl font-semibold text-slate-900">{it.value}</div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileRow({
  view,
  tagging,
  onTag,
  onOpen,
  onTagClick,
}: {
  view: FileView;
  tagging: boolean;
  onTag: () => void;
  onOpen: (node: FileNode, download?: boolean) => void;
  onTagClick: (tag: string) => void;
}) {
  const display = documentDisplayName(view);
  return (
    <div className="group flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileIcon width={20} height={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpen(view)}
            className="truncate text-left font-medium text-slate-900 hover:text-brand-600 hover:underline"
          >
            {display}
          </button>
          {view.isPdf && !view.tagged && (
            <span className="badge-amber">Untagged</span>
          )}
          {view.stale && <span className="badge-amber">Changed</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {display !== view.name ? `${view.name} · ` : ""}
          {formatBytes(view.size)} · {formatDateFromMs(view.lastModified)}
        </p>
        {view.tags.length > 0 && (
          <div className="mt-1.5">
            <TagBadges tags={view.tags} onClick={onTagClick} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {view.isPdf && (
          <button
            onClick={onTag}
            disabled={tagging}
            className="btn-ghost px-2"
            title={view.tagged ? "Re-tag this drawing" : "Tag this drawing"}
          >
            <TagIcon
              width={17}
              height={17}
              className={tagging ? "animate-pulse text-brand-500" : ""}
            />
          </button>
        )}
        <button
          onClick={() => onOpen(view)}
          className="btn-ghost px-2"
          title="Preview"
        >
          <EyeIcon width={17} height={17} />
        </button>
        <button
          onClick={() => onOpen(view, true)}
          className="btn-ghost px-2"
          title="Download a copy"
        >
          <DownloadIcon width={17} height={17} />
        </button>
      </div>
    </div>
  );
}

function SearchResults({
  views,
  query,
  onOpen,
  onTagClick,
}: {
  views: FileView[];
  query: string;
  onOpen: (node: FileNode, download?: boolean) => void;
  onTagClick: (tag: string) => void;
}) {
  if (views.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-12 text-center">
        <SearchIcon width={22} height={22} className="text-slate-300" />
        <p className="font-medium text-slate-700">No matches for “{query}”</p>
        <p className="text-sm text-slate-400">
          Try a discipline like “Plumbing”, or part of a drawing title.
        </p>
      </div>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {views.length} result{views.length === 1 ? "" : "s"} for “{query}”
      </h2>
      <div className="card divide-y divide-slate-100">
        {views.map((v) => {
          const folder = v.relPath.includes("/")
            ? v.relPath.slice(0, v.relPath.lastIndexOf("/"))
            : "";
          return (
            <div
              key={v.relPath}
              className="flex flex-wrap items-center gap-3 px-4 py-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FileIcon width={20} height={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpen(v)}
                    className="truncate text-left font-medium text-slate-900 hover:text-brand-600 hover:underline"
                  >
                    {documentDisplayName(v)}
                  </button>
                  {folder && (
                    <span className="badge-slate">
                      <FolderIcon width={12} height={12} />
                      {folder}
                    </span>
                  )}
                </div>
                {documentDisplayName(v) !== v.name && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">{v.name}</p>
                )}
                {v.tags.length > 0 && (
                  <div className="mt-1.5">
                    <TagBadges tags={v.tags} onClick={onTagClick} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpen(v)}
                  className="btn-ghost px-2"
                  title="Preview"
                >
                  <EyeIcon width={17} height={17} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
