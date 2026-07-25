"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { scan, getSubtree, fileUrl, matchesQuery } from "@/lib/api";
import type { DirListing, FileItem, SearchRow } from "@/lib/types";
import { tagDocument } from "@/lib/tags";
import { retagUntagged } from "@/lib/retag";
import { Breadcrumbs } from "./Breadcrumbs";
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
} from "./icons";
import {
  formatBytes,
  formatDateFromMs,
  documentDisplayName,
  browseHref,
} from "@/lib/format";

export function FolderView({
  relPath,
  atRoot = false,
}: {
  relPath: string;
  atRoot?: boolean;
}) {
  const [data, setData] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search (scoped to this folder + everything nested under it)
  const [query, setQuery] = useState("");
  const [subtree, setSubtree] = useState<SearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  // "Tag untagged" backfill
  const [retagging, setRetagging] = useState(false);
  const [retagProgress, setRetagProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [retagMsg, setRetagMsg] = useState<string | null>(null);

  // Per-file tagging (single file)
  const [taggingPath, setTaggingPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const listing = await scan(relPath);
      setError(null);
      setData(listing);
      setSubtree(null); // invalidate search cache; refetched on next search
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folder.");
    } finally {
      setLoading(false);
    }
  }, [relPath]);

  useEffect(() => {
    // load() only setStates after awaiting its fetch; safe, intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function onSearchChange(value: string) {
    setQuery(value);
    if (value.trim() && subtree === null && !searching) {
      setSearching(true);
      try {
        setSubtree(await getSubtree(relPath));
      } catch {
        setSubtree([]);
      } finally {
        setSearching(false);
      }
    }
  }

  async function handleRetag() {
    setRetagging(true);
    setRetagMsg(null);
    setRetagProgress({ done: 0, total: 0 });
    try {
      const res = await retagUntagged(relPath, setRetagProgress);
      if (res.total === 0) {
        setRetagMsg("Every PDF here is already tagged.");
      } else {
        setRetagMsg(
          `Tagged ${res.tagged} of ${res.total} PDF${
            res.total === 1 ? "" : "s"
          }${res.failed ? ` · ${res.failed} still failed (try again)` : ""}.`
        );
      }
      await load();
    } catch (err) {
      setRetagMsg(err instanceof Error ? err.message : "Tagging failed.");
    } finally {
      setRetagging(false);
      setRetagProgress(null);
    }
  }

  async function handleTagOne(file: FileItem) {
    setTaggingPath(file.relPath);
    try {
      await tagDocument(file.relPath);
      await load();
    } finally {
      setTaggingPath(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {!atRoot && <div className="h-5 w-64 animate-pulse rounded bg-slate-200" />}
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        {!atRoot && <Breadcrumbs trail={[]} />}
        <div className="card p-5 text-sm text-red-600">
          {error ?? "Folder not found."}
        </div>
      </div>
    );
  }

  const { breadcrumbs, folders, files } = data;
  const currentName = atRoot
    ? "Home"
    : breadcrumbs[breadcrumbs.length - 1]?.name ?? "Home";

  return (
    <div className="space-y-6">
      {!atRoot && <Breadcrumbs trail={breadcrumbs} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!atRoot ? (
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FolderIcon width={22} height={22} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {currentName}
            </h1>
          </div>
        ) : (
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Files
          </h2>
        )}
        <button
          className="btn-secondary"
          onClick={handleRetag}
          disabled={retagging}
          title="Find every PDF here (and in subfolders) still missing a title/tags and tag it"
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

      {/* Search — matches file names, extracted titles, and AI tags */}
      <div className="relative">
        <SearchIcon
          width={17}
          height={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          className="input pl-9 pr-9"
          placeholder={`Search titles & tags in “${currentName}” (incl. subfolders)…`}
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
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
          rows={subtree}
          query={query}
          loading={searching}
          onTagClick={(t) => onSearchChange(t)}
        />
      ) : (
        <>
          {folders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Folders
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <Link
                    key={f.relPath}
                    href={browseHref(f.relPath)}
                    className="card group flex items-center gap-3 p-4 transition-shadow hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <FolderIcon width={18} height={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {f.name}
                    </span>
                    <ChevronRight className="text-slate-300" width={16} height={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Documents
            </h2>
            {files.length === 0 ? (
              <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <FileIcon width={22} height={22} />
                </span>
                <div>
                  <p className="font-medium text-slate-700">No files here</p>
                  <p className="text-sm text-slate-400">
                    This folder has no files — open a subfolder above.
                  </p>
                </div>
              </div>
            ) : (
              <div className="card divide-y divide-slate-100">
                {files.map((file) => (
                  <FileRow
                    key={file.relPath}
                    file={file}
                    tagging={taggingPath === file.relPath}
                    onTag={() => handleTagOne(file)}
                    onTagClick={(t) => onSearchChange(t)}
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

function FileRow({
  file,
  tagging,
  onTag,
  onTagClick,
}: {
  file: FileItem;
  tagging: boolean;
  onTag: () => void;
  onTagClick: (tag: string) => void;
}) {
  const display = documentDisplayName(file);
  return (
    <div className="group flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileIcon width={20} height={20} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={fileUrl(file.relPath)}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-medium text-slate-900 hover:text-brand-600 hover:underline"
          >
            {display}
          </a>
          {file.isPdf && !file.title && (
            <span className="badge-amber">Untagged</span>
          )}
          {file.stale && <span className="badge-amber">Changed</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {display !== file.name ? `${file.name} · ` : ""}
          {formatBytes(file.size)} · {formatDateFromMs(file.mtimeMs)}
        </p>
        {file.tags.length > 0 && (
          <div className="mt-1.5">
            <TagBadges tags={file.tags} onClick={onTagClick} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {file.isPdf && (
          <button
            onClick={onTag}
            disabled={tagging}
            className="btn-ghost px-2"
            title={file.title ? "Re-tag this drawing" : "Tag this drawing"}
          >
            <TagIcon
              width={17}
              height={17}
              className={tagging ? "animate-pulse text-brand-500" : ""}
            />
          </button>
        )}
        <a
          href={fileUrl(file.relPath)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost px-2"
          title="Preview"
        >
          <EyeIcon width={17} height={17} />
        </a>
        <a
          href={fileUrl(file.relPath, true)}
          className="btn-ghost px-2"
          title="Download a copy"
        >
          <DownloadIcon width={17} height={17} />
        </a>
      </div>
    </div>
  );
}

function SearchResults({
  rows,
  query,
  loading,
  onTagClick,
}: {
  rows: SearchRow[] | null;
  query: string;
  loading: boolean;
  onTagClick: (tag: string) => void;
}) {
  if (loading && rows === null) {
    return <div className="card h-24 animate-pulse bg-slate-100" />;
  }

  const results = (rows ?? []).filter((r) => matchesQuery(r, query));

  if (results.length === 0) {
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
        {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
      </h2>
      <div className="card divide-y divide-slate-100">
        {results.map(({ file, folderName }) => (
          <div
            key={file.relPath}
            className="flex flex-wrap items-center gap-3 px-4 py-3.5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <FileIcon width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <a
                  href={fileUrl(file.relPath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-slate-900 hover:text-brand-600 hover:underline"
                >
                  {documentDisplayName(file)}
                </a>
                <span className="badge-slate">
                  <FolderIcon width={12} height={12} />
                  {folderName}
                </span>
              </div>
              {documentDisplayName(file) !== file.name && (
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {file.name}
                </p>
              )}
              {file.tags.length > 0 && (
                <div className="mt-1.5">
                  <TagBadges tags={file.tags} onClick={onTagClick} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <a
                href={fileUrl(file.relPath)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-2"
                title="Preview"
              >
                <EyeIcon width={17} height={17} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
