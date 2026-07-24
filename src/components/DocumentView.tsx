"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDocumentWithRevisions,
  getBreadcrumbs,
  getFileUrl,
  uploadRevision,
  deleteRevision,
} from "@/lib/api";
import type {
  DocumentWithRevisions,
  Folder,
  Revision,
} from "@/lib/types";
import { tagDocument } from "@/lib/tags";
import { Breadcrumbs } from "./Breadcrumbs";
import { UploadDialog } from "./UploadDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { FilePreview } from "./FilePreview";
import { TagBadges } from "./TagBadges";
import {
  FileIcon,
  UploadIcon,
  EyeIcon,
  DownloadIcon,
  TrashIcon,
  ClockIcon,
} from "./icons";
import { formatBytes, formatDate, documentDisplayName } from "@/lib/format";

export function DocumentView({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<DocumentWithRevisions | null>(null);
  const [trail, setTrail] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<Revision | null>(null);
  const [deleteRev, setDeleteRev] = useState<Revision | null>(null);
  const [retagging, setRetagging] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getDocumentWithRevisions(documentId);
      const crumbs = await getBreadcrumbs(d.folder_id);
      setError(null);
      setDoc(d);
      setTrail(crumbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    // load() only setStates after awaiting its fetch; safe, intentional suppression.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-72 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="card h-40 animate-pulse bg-slate-100" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <Breadcrumbs trail={[]} />
        <div className="card p-5 text-sm text-red-600">
          {error ?? "Document not found."}
        </div>
      </div>
    );
  }

  const latest = doc.latest;
  const archived = doc.revisions.slice(1); // everything but the newest
  const displayName = documentDisplayName(doc);

  return (
    <div className="space-y-6">
      <Breadcrumbs trail={trail} currentName={displayName} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <FileIcon width={22} height={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {displayName}
            </h1>
            {displayName !== doc.name && (
              <p className="text-sm text-slate-400">{doc.name}</p>
            )}
            <p className="text-sm text-slate-400">
              {doc.revisions.length} revision
              {doc.revisions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {latest && (
            <button
              className="btn-secondary"
              disabled={retagging}
              onClick={async () => {
                setRetagging(true);
                try {
                  await tagDocument(doc.id, latest.file_path, latest.file_name);
                  await load();
                } finally {
                  setRetagging(false);
                }
              }}
              title="Re-run title & tag extraction on the current revision"
            >
              {retagging ? "Tagging…" : "Retag"}
            </button>
          )}
          <button className="btn-primary" onClick={() => setUploadOpen(true)}>
            <UploadIcon width={16} height={16} />
            Upload new revision
          </button>
        </div>
      </div>

      {doc.tags.length > 0 && <TagBadges tags={doc.tags} />}

      {/* Current revision — highlighted */}
      {latest ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Current revision
          </h2>
          <div className="card border-emerald-200 bg-emerald-50/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <FileIcon width={22} height={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="badge-green">
                      Rev {latest.revision_number}
                    </span>
                    <span className="text-xs font-medium text-emerald-700">
                      Main
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium text-slate-900">
                    {latest.file_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(latest.file_size)} · uploaded{" "}
                    {formatDate(latest.created_at)}
                  </p>
                  {latest.notes && (
                    <p className="mt-2 max-w-prose rounded-md bg-white/70 px-3 py-2 text-sm text-slate-600">
                      {latest.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => setPreview(latest)}
                >
                  <EyeIcon width={16} height={16} />
                  Preview
                </button>
                <a
                  href={getFileUrl(latest.file_path)}
                  download={latest.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  <DownloadIcon width={16} height={16} />
                  Download
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-slate-500">
            No revisions uploaded yet for this document.
          </p>
          <button className="btn-primary" onClick={() => setUploadOpen(true)}>
            <UploadIcon width={16} height={16} />
            Upload first revision
          </button>
        </div>
      )}

      {/* Archived revisions */}
      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ClockIcon width={14} height={14} />
            Archived revisions
          </h2>
          <div className="card divide-y divide-slate-100">
            {archived.map((rev) => (
              <div
                key={rev.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="badge-slate shrink-0">
                  Rev {rev.revision_number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {rev.file_name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {formatBytes(rev.file_size)} · {formatDate(rev.created_at)}
                    {rev.notes ? ` · ${rev.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreview(rev)}
                    className="btn-ghost px-2"
                    title="Preview"
                  >
                    <EyeIcon width={16} height={16} />
                  </button>
                  <a
                    href={getFileUrl(rev.file_path)}
                    download={rev.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost px-2"
                    title="Download"
                  >
                    <DownloadIcon width={16} height={16} />
                  </a>
                  <button
                    onClick={() => setDeleteRev(rev)}
                    className="btn-ghost px-2 hover:text-red-600"
                    title="Delete revision"
                  >
                    <TrashIcon width={16} height={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <UploadDialog
        open={uploadOpen}
        title={`New revision · ${doc.name}`}
        submitLabel="Upload revision"
        onClose={() => setUploadOpen(false)}
        onSubmit={async ({ file, notes }) => {
          const rev = await uploadRevision(doc.id, file, notes);
          await tagDocument(doc.id, rev.file_path, file.name);
          await load();
        }}
      />

      <ConfirmDialog
        open={!!deleteRev}
        title="Delete revision"
        message={
          <>
            Delete <strong>Rev {deleteRev?.revision_number}</strong> (
            {deleteRev?.file_name})? This cannot be undone.
          </>
        }
        onClose={() => setDeleteRev(null)}
        onConfirm={async () => {
          if (deleteRev) await deleteRevision(deleteRev);
          await load();
        }}
      />

      <FilePreview
        revision={preview}
        documentName={displayName}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
