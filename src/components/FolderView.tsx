"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getFolderContents,
  createFolder,
  renameFolder,
  deleteFolder,
  createDocumentWithFirstRevision,
  renameDocument,
  deleteDocument,
  uploadRevision,
  getFileUrl,
  getSubtreeDocuments,
  matchesQuery,
  type SearchResult,
} from "@/lib/api";
import type {
  Folder,
  FolderContents,
  DocumentWithRevisions,
  Revision,
} from "@/lib/types";
import { Breadcrumbs } from "./Breadcrumbs";
import { NameDialog } from "./NameDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { UploadDialog } from "./UploadDialog";
import { FilePreview } from "./FilePreview";
import { ImportDialog } from "./ImportDialog";
import {
  getDroppedEntries,
  buildImportTree,
  type ImportNode,
} from "@/lib/import";
import { tagDocument } from "@/lib/tags";
import { retagUntagged } from "@/lib/retag";
import { TagBadges } from "./TagBadges";
import { SearchIcon, CloseIcon } from "./icons";
import {
  FolderIcon,
  FileIcon,
  PlusIcon,
  UploadIcon,
  PencilIcon,
  TrashIcon,
  ChevronRight,
  EyeIcon,
  DownloadIcon,
  ClockIcon,
  TagIcon,
} from "./icons";
import { formatBytes, formatDateShort, documentDisplayName } from "@/lib/format";

export function FolderView({ folderId }: { folderId: string }) {
  const [data, setData] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [newSub, setNewSub] = useState(false);
  const [renameSub, setRenameSub] = useState<Folder | null>(null);
  const [deleteSub, setDeleteSub] = useState<Folder | null>(null);
  const [newDoc, setNewDoc] = useState(false);
  const [renameDoc, setRenameDoc] = useState<DocumentWithRevisions | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentWithRevisions | null>(null);
  const [uploadTo, setUploadTo] = useState<DocumentWithRevisions | null>(null);
  const [preview, setPreview] = useState<{
    rev: Revision;
    name: string;
  } | null>(null);

  // Folder drag-and-drop import
  const [dragging, setDragging] = useState(false);
  const [importRoot, setImportRoot] = useState<ImportNode | null>(null);
  const [reading, setReading] = useState(false);
  const dragDepth = useRef(0);

  // Search (scoped to this folder + everything nested under it)
  const [query, setQuery] = useState("");
  const [subtree, setSubtree] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // "Tag untagged" — backfill any docs in this subtree still missing tags.
  const [retagging, setRetagging] = useState(false);
  const [retagProgress, setRetagProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [retagMsg, setRetagMsg] = useState<string | null>(null);

  async function handleRetag() {
    setRetagging(true);
    setRetagMsg(null);
    setRetagProgress({ done: 0, total: 0 });
    try {
      const res = await retagUntagged(folderId, setRetagProgress);
      if (res.total === 0) {
        setRetagMsg("Everything here is already tagged.");
      } else {
        setRetagMsg(
          `Tagged ${res.tagged} of ${res.total} document${
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

  async function onSearchChange(value: string) {
    setQuery(value);
    // Lazily fetch the subtree the first time the user searches.
    if (value.trim() && subtree === null && !searching) {
      setSearching(true);
      try {
        setSubtree(await getSubtreeDocuments(folderId));
      } finally {
        setSearching(false);
      }
    }
  }

  const load = useCallback(async () => {
    try {
      const contents = await getFolderContents(folderId);
      setError(null);
      setData(contents);
      setSubtree(null); // invalidate search cache; refetched on next search
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folder.");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    // load() only setStates after awaiting its fetch — safe to call in effect.
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-64 animate-pulse rounded bg-slate-200" />
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
        <Breadcrumbs trail={[]} />
        <div className="card p-5 text-sm text-red-600">
          {error ?? "Folder not found."}
        </div>
      </div>
    );
  }

  const { folder, breadcrumbs, subfolders, documents } = data;

  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }
  async function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    // Read entries synchronously — the DataTransfer is only valid during the event.
    const entries = getDroppedEntries(e.dataTransfer);
    if (entries.length === 0) return;
    setReading(true);
    try {
      const root = await buildImportTree(entries);
      setImportRoot(root);
    } finally {
      setReading(false);
    }
  }

  return (
    <div
      className="relative space-y-6"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {(dragging || reading) && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadIcon width={32} height={32} className="text-brand-600" />
            <p className="text-sm font-semibold text-brand-700">
              {reading
                ? "Reading folder…"
                : `Drop to import into “${folder?.name}”`}
            </p>
            <p className="text-xs text-brand-600">
              Subfolders and files are recreated automatically
            </p>
          </div>
        </div>
      )}
      <Breadcrumbs trail={breadcrumbs} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FolderIcon width={22} height={22} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {folder?.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={handleRetag}
            disabled={retagging}
            title="Find every document here (and in subfolders) still missing a title/tags and tag it"
          >
            <TagIcon width={16} height={16} />
            {retagging
              ? `Tagging… ${retagProgress?.done ?? 0}/${
                  retagProgress?.total ?? 0
                }`
              : "Tag untagged"}
          </button>
          <button className="btn-secondary" onClick={() => setNewSub(true)}>
            <PlusIcon width={16} height={16} />
            New category
          </button>
          <button className="btn-primary" onClick={() => setNewDoc(true)}>
            <UploadIcon width={16} height={16} />
            Upload document
          </button>
        </div>
      </div>

      <p className="-mt-2 text-xs text-slate-400">
        Tip: drag a folder from your computer anywhere onto this page to import
        its whole structure at once.
        {retagMsg && (
          <span className="ml-1 font-medium text-brand-600">{retagMsg}</span>
        )}
      </p>

      {/* Search — matches document names, parsed titles, and AI tags */}
      <div className="relative">
        <SearchIcon
          width={17}
          height={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          className="input pl-9 pr-9"
          placeholder={`Search drawings & tags in “${folder?.name}” (incl. subfolders)…`}
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
          onPreview={(rev, name) => setPreview({ rev, name })}
          onTagClick={(t) => onSearchChange(t)}
        />
      ) : (
        <>
          {/* Subfolders / categories */}
          {subfolders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Categories
              </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((f) => (
              <div
                key={f.id}
                className="card group relative flex items-center gap-3 p-4 transition-shadow hover:shadow-md"
              >
                <Link
                  href={`/folders/${f.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <FolderIcon width={18} height={18} />
                  </span>
                  <span className="truncate font-medium text-slate-800">
                    {f.name}
                  </span>
                </Link>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setRenameSub(f)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Rename"
                  >
                    <PencilIcon width={15} height={15} />
                  </button>
                  <button
                    onClick={() => setDeleteSub(f)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    title="Delete"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
                <ChevronRight
                  className="text-slate-300"
                  width={16}
                  height={16}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Documents
        </h2>

        {documents.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <FileIcon width={22} height={22} />
            </span>
            <div>
              <p className="font-medium text-slate-700">No documents here yet</p>
              <p className="text-sm text-slate-400">
                Upload a drawing (PDF) or add a category to organize further.
              </p>
            </div>
            <button className="btn-primary" onClick={() => setNewDoc(true)}>
              <UploadIcon width={16} height={16} />
              Upload document
            </button>
          </div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onPreview={(rev) => setPreview({ rev, name: documentDisplayName(doc) })}
                onUpload={() => setUploadTo(doc)}
                onRename={() => setRenameDoc(doc)}
                onDelete={() => setDeleteDoc(doc)}
                onTagClick={(t) => onSearchChange(t)}
              />
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {/* Dialogs */}
      <NameDialog
        open={newSub}
        title="New category"
        label="Category name"
        placeholder="e.g. Foundation, Switches, Plumbing…"
        submitLabel="Create"
        onClose={() => setNewSub(false)}
        onSubmit={async (name) => {
          await createFolder(name, folderId);
          await load();
        }}
      />
      <NameDialog
        open={!!renameSub}
        title="Rename category"
        label="Category name"
        initialValue={renameSub?.name ?? ""}
        onClose={() => setRenameSub(null)}
        onSubmit={async (name) => {
          if (renameSub) await renameFolder(renameSub.id, name);
          await load();
        }}
      />
      <ConfirmDialog
        open={!!deleteSub}
        title="Delete category"
        message={
          <>
            Delete <strong>{deleteSub?.name}</strong> and everything inside it?
            This cannot be undone.
          </>
        }
        onClose={() => setDeleteSub(null)}
        onConfirm={async () => {
          if (deleteSub) await deleteFolder(deleteSub.id);
          await load();
        }}
      />

      <UploadDialog
        open={newDoc}
        title="Upload document"
        withName
        submitLabel="Create & upload"
        onClose={() => setNewDoc(false)}
        onSubmit={async ({ file, notes, name }) => {
          const doc = await createDocumentWithFirstRevision(
            folderId,
            name,
            file,
            notes
          );
          if (doc.latest)
            await tagDocument(doc.id, doc.latest.file_path, file.name);
          await load();
        }}
      />
      <UploadDialog
        open={!!uploadTo}
        title={`New revision · ${uploadTo?.name ?? ""}`}
        submitLabel="Upload revision"
        onClose={() => setUploadTo(null)}
        onSubmit={async ({ file, notes }) => {
          if (uploadTo) {
            const rev = await uploadRevision(uploadTo.id, file, notes);
            await tagDocument(uploadTo.id, rev.file_path, file.name);
          }
          await load();
        }}
      />
      <NameDialog
        open={!!renameDoc}
        title="Rename document"
        label="Document name"
        initialValue={renameDoc?.name ?? ""}
        onClose={() => setRenameDoc(null)}
        onSubmit={async (name) => {
          if (renameDoc) await renameDocument(renameDoc.id, name);
          await load();
        }}
      />
      <ConfirmDialog
        open={!!deleteDoc}
        title="Delete document"
        message={
          <>
            Delete <strong>{deleteDoc?.name}</strong> and all{" "}
            {deleteDoc?.revisions.length} revision(s)? This cannot be undone.
          </>
        }
        onClose={() => setDeleteDoc(null)}
        onConfirm={async () => {
          if (deleteDoc) await deleteDocument(deleteDoc.id);
          await load();
        }}
      />

      <FilePreview
        revision={preview?.rev ?? null}
        documentName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />

      <ImportDialog
        root={importRoot}
        targetName={folder?.name ?? ""}
        targetFolderId={folderId}
        onClose={() => setImportRoot(null)}
        onDone={load}
      />
    </div>
  );
}

function DocumentRow({
  doc,
  onPreview,
  onUpload,
  onRename,
  onDelete,
  onTagClick,
}: {
  doc: DocumentWithRevisions;
  onPreview: (rev: Revision) => void;
  onUpload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}) {
  const latest = doc.latest;
  const olderCount = Math.max(0, doc.revisions.length - 1);

  return (
    <div className="group flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileIcon width={20} height={20} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/documents/${doc.id}`}
            className="truncate font-medium text-slate-900 hover:text-brand-600 hover:underline"
          >
            {documentDisplayName(doc)}
          </Link>
          {latest ? (
            <span className="badge-green">Rev {latest.revision_number}</span>
          ) : (
            <span className="badge-amber">No file</span>
          )}
          {olderCount > 0 && (
            <span className="badge-slate">
              <ClockIcon width={12} height={12} />
              {olderCount} archived
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {latest
            ? `${latest.file_name} · ${formatBytes(
                latest.file_size
              )} · ${formatDateShort(latest.created_at)}`
            : "No revisions uploaded yet"}
        </p>
        {doc.tags.length > 0 && (
          <div className="mt-1.5">
            <TagBadges tags={doc.tags} onClick={onTagClick} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {latest && (
          <>
            <button
              onClick={() => onPreview(latest)}
              className="btn-ghost px-2"
              title="Preview current revision"
            >
              <EyeIcon width={17} height={17} />
            </button>
            <a
              href={getFileUrl(latest.file_path)}
              download={latest.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost px-2"
              title="Download current revision"
            >
              <DownloadIcon width={17} height={17} />
            </a>
          </>
        )}
        <button
          onClick={onUpload}
          className="btn-ghost px-2"
          title="Upload new revision"
        >
          <UploadIcon width={17} height={17} />
        </button>
        <div className="ml-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onRename}
            className="btn-ghost px-2"
            title="Rename document"
          >
            <PencilIcon width={16} height={16} />
          </button>
          <button
            onClick={onDelete}
            className="btn-ghost px-2 hover:text-red-600"
            title="Delete document"
          >
            <TrashIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  rows,
  query,
  loading,
  onPreview,
  onTagClick,
}: {
  rows: SearchResult[] | null;
  query: string;
  loading: boolean;
  onPreview: (rev: Revision, name: string) => void;
  onTagClick: (tag: string) => void;
}) {
  if (loading && rows === null) {
    return (
      <div className="card h-24 animate-pulse bg-slate-100" />
    );
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
        {results.map(({ document: doc, folderName }) => {
          const latest = doc.latest;
          return (
            <div
              key={doc.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <FileIcon width={20} height={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="truncate font-medium text-slate-900 hover:text-brand-600 hover:underline"
                  >
                    {documentDisplayName(doc)}
                  </Link>
                  {latest && (
                    <span className="badge-green">
                      Rev {latest.revision_number}
                    </span>
                  )}
                  <span className="badge-slate">
                    <FolderIcon width={12} height={12} />
                    {folderName}
                  </span>
                </div>
                {documentDisplayName(doc) !== doc.name && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {doc.name}
                  </p>
                )}
                {doc.tags.length > 0 && (
                  <div className="mt-1.5">
                    <TagBadges tags={doc.tags} onClick={onTagClick} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {latest && (
                  <>
                    <button
                      onClick={() => onPreview(latest, documentDisplayName(doc))}
                      className="btn-ghost px-2"
                      title="Preview current revision"
                    >
                      <EyeIcon width={17} height={17} />
                    </button>
                    <a
                      href={getFileUrl(latest.file_path)}
                      download={latest.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-2"
                      title="Download current revision"
                    >
                      <DownloadIcon width={17} height={17} />
                    </a>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
