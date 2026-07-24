"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getRootFolders,
  getStats,
  createFolder,
  renameFolder,
  deleteFolder,
  type Stats,
} from "@/lib/api";
import type { Folder } from "@/lib/types";
import { ConfigNotice } from "@/components/ConfigNotice";
import { NameDialog } from "@/components/NameDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  FolderIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronRight,
} from "@/components/icons";
import { formatDateShort } from "@/lib/format";

export default function HomePage() {
  const [sections, setSections] = useState<Folder[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [folders, s] = await Promise.all([getRootFolders(), getStats()]);
      setSections(folders);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <ConfigNotice />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Document Library
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse by section. Open a section to add categories and upload
          drawings with automatic revision control.
        </p>
      </div>

      {stats && <StatsRow stats={stats} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sections
          </h2>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon width={16} height={16} />
            New section
          </button>
        </div>

        {error && (
          <div className="card p-4 text-sm text-red-600">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-28 animate-pulse bg-slate-100" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <SectionCard
                key={s.id}
                folder={s}
                onRename={() => setRenaming(s)}
                onDelete={() => setDeleting(s)}
              />
            ))}
          </div>
        )}
      </section>

      <NameDialog
        open={creating}
        title="New section"
        label="Section name"
        placeholder="e.g. Drawings, Materials, Permits…"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          await createFolder(name, null);
          await load();
        }}
      />

      <NameDialog
        open={!!renaming}
        title="Rename section"
        label="Section name"
        initialValue={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (renaming) await renameFolder(renaming.id, name);
          await load();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete section"
        message={
          <>
            Delete <strong>{deleting?.name}</strong> and everything inside it —
            all categories, documents, and revisions? This cannot be undone.
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteFolder(deleting.id);
          await load();
        }}
      />
    </div>
  );
}

function StatsRow({ stats }: { stats: Stats }) {
  const items = [
    { label: "Sections", value: stats.sections },
    { label: "Categories", value: Math.max(0, stats.folders - stats.sections) },
    { label: "Documents", value: stats.documents },
    { label: "Revisions", value: stats.revisions },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="card px-4 py-3">
          <div className="text-2xl font-semibold text-slate-900">
            {it.value}
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  folder,
  onRename,
  onDelete,
}: {
  folder: Folder;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card group relative flex flex-col p-5 transition-shadow hover:shadow-md">
      <Link href={`/folders/${folder.id}`} className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <FolderIcon width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{folder.name}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Created {formatDateShort(folder.created_at)}
          </p>
        </div>
        <ChevronRight
          className="mt-1 text-slate-300 transition-transform group-hover:translate-x-0.5"
          width={18}
          height={18}
        />
      </Link>
      <div className="pointer-events-none absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          onClick={onRename}
          className="rounded-md bg-white/90 p-1.5 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-slate-800"
          title="Rename"
        >
          <PencilIcon width={15} height={15} />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md bg-white/90 p-1.5 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-red-600"
          title="Delete"
        >
          <TrashIcon width={15} height={15} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FolderIcon width={24} height={24} />
      </span>
      <div>
        <p className="font-medium text-slate-700">No sections yet</p>
        <p className="text-sm text-slate-400">
          Create your first section, e.g. Drawings or Materials.
        </p>
      </div>
      <button className="btn-primary" onClick={onCreate}>
        <PlusIcon width={16} height={16} />
        New section
      </button>
    </div>
  );
}
