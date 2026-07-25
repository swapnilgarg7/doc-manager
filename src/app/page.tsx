"use client";

import { useCallback, useEffect, useState } from "react";
import { getConfig, setRoot, getStats } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { ConfigNotice } from "@/components/ConfigNotice";
import { NameDialog } from "@/components/NameDialog";
import { FolderView } from "@/components/FolderView";
import { FolderIcon, PencilIcon } from "@/components/icons";

type Status = "loading" | "unset" | "missing" | "ok";

export default function HomePage() {
  const [status, setStatus] = useState<Status>("loading");
  const [root, setRootPath] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const { root } = await getConfig();
    setRootPath(root);
    if (!root) {
      setStatus("unset");
      return;
    }
    try {
      setStats(await getStats());
      setStatus("ok");
    } catch {
      setStatus("missing");
    }
  }, []);

  useEffect(() => {
    // load() only setStates after awaiting its fetch; safe, intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Document Library
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Point the app at a folder on this computer. It scans the files, reads
          each PDF’s title, tags it, and lets you search — all locally.
        </p>
      </div>

      {status === "unset" && <ConfigNotice variant="unset" />}
      {status === "missing" && <ConfigNotice variant="missing" />}

      {/* Selected-folder panel */}
      {(status === "ok" || status === "missing") && (
        <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FolderIcon width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Scanning folder
            </p>
            <p className="truncate font-mono text-sm text-slate-800">{root}</p>
          </div>
          <button className="btn-secondary" onClick={() => setPicking(true)}>
            <PencilIcon width={15} height={15} />
            Change folder
          </button>
        </div>
      )}

      {status === "unset" && (
        <div className="card flex flex-col items-center justify-center gap-3 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FolderIcon width={24} height={24} />
          </span>
          <div>
            <p className="font-medium text-slate-700">Choose a folder to scan</p>
            <p className="text-sm text-slate-400">
              Paste the full path to a folder, e.g. /Users/you/Drawings
            </p>
          </div>
          <button className="btn-primary" onClick={() => setPicking(true)}>
            <FolderIcon width={16} height={16} />
            Choose folder
          </button>
        </div>
      )}

      {status === "ok" && stats && <StatsRow stats={stats} />}

      {status === "ok" && <FolderView relPath="" atRoot />}

      <NameDialog
        open={picking}
        title="Choose folder to scan"
        label="Absolute folder path"
        placeholder="/Users/you/Drawings"
        initialValue={root ?? ""}
        submitLabel="Scan this folder"
        onClose={() => setPicking(false)}
        onSubmit={async (path) => {
          await setRoot(path);
          await load();
        }}
      />
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
