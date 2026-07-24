"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { FolderIcon, FileIcon, UploadIcon } from "./icons";
import {
  type ImportNode,
  type ImportProgress,
  type ImportResult,
  countTree,
  singleDroppedFolder,
  importIntoFolder,
} from "@/lib/import";

type Phase = "preview" | "running" | "done";

export function ImportDialog({
  root,
  targetName,
  targetFolderId,
  onClose,
  onDone,
}: {
  root: ImportNode | null;
  targetName: string;
  targetFolderId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const single = useMemo(
    () => (root ? singleDroppedFolder(root) : null),
    [root]
  );
  const [mergeSingle, setMergeSingle] = useState(true);
  const [phase, setPhase] = useState<Phase>("preview");
  const [progress, setProgress] = useState<ImportProgress>({
    done: 0,
    total: 0,
    current: "",
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!root) return null;

  const effective = single && mergeSingle ? single : root;
  const counts = countTree(effective);
  const pct =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  async function run() {
    setPhase("running");
    setError(null);
    try {
      const res = await importIntoFolder(targetFolderId, effective, setProgress);
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setPhase("preview");
    }
  }

  function finish() {
    onDone();
    onClose();
  }

  return (
    <Modal
      open={!!root}
      onClose={phase === "running" ? () => {} : onClose}
      title={
        phase === "done"
          ? "Import complete"
          : phase === "running"
            ? "Importing…"
            : "Import folder"
      }
    >
      {phase === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Import into{" "}
            <span className="font-medium text-slate-900">{targetName}</span>:
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-slate-700">
                <FolderIcon width={16} height={16} className="text-amber-500" />
                {counts.folders} folder{counts.folders === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1.5 text-slate-700">
                <FileIcon width={16} height={16} className="text-brand-600" />
                {counts.files} file{counts.files === 1 ? "" : "s"}
              </span>
            </div>
            <TreePreview node={effective} />
          </div>

          {single && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={mergeSingle}
                onChange={(e) => setMergeSingle(e.target.checked)}
              />
              <span>
                Merge <strong>{single.name}</strong>’s contents directly into{" "}
                {targetName}.{" "}
                <span className="text-slate-400">
                  (Uncheck to create a “{single.name}” subfolder instead.)
                </span>
              </span>
            </label>
          )}

          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Files whose name matches an existing document will be added as a{" "}
            <strong>new revision</strong>. Everything else is created fresh.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={run}
              disabled={counts.files === 0 && counts.folders === 0}
            >
              <UploadIcon width={16} height={16} />
              Import {counts.files} file{counts.files === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="space-y-4 py-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>
              {progress.done} / {progress.total} files
            </span>
            <span>{pct}%</span>
          </div>
          <p className="truncate text-xs text-slate-400">
            {progress.total > 0 && progress.done === progress.total
              ? "Analyzing drawings & assigning tags…"
              : progress.current || "Preparing…"}
          </p>
          <p className="text-xs text-slate-400">
            Please keep this tab open until the import finishes.
          </p>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Uploaded" value={result.uploaded} />
            <Stat label="New docs" value={result.createdDocuments} />
            <Stat label="Revisions" value={result.addedRevisions} />
          </div>

          {result.failures.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <p className="font-medium text-red-700">
                {result.failures.length} file
                {result.failures.length === 1 ? "" : "s"} failed:
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
                {result.failures.map((f, i) => (
                  <li key={i} className="truncate">
                    {f.path} — {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button className="btn-primary" onClick={finish}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-3">
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function TreePreview({ node }: { node: ImportNode }) {
  // Show up to two levels so the dialog stays compact.
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
      {node.folders.map((f, i) => {
        const c = countTree(f);
        return (
          <li key={`d${i}`}>
            <span className="flex items-center gap-1.5 text-slate-700">
              <FolderIcon width={15} height={15} className="text-amber-500" />
              {f.name}
              <span className="text-xs text-slate-400">
                ({c.files} file{c.files === 1 ? "" : "s"}
                {c.folders > 0 ? `, ${c.folders} sub` : ""})
              </span>
            </span>
          </li>
        );
      })}
      {node.files.map((file, i) => (
        <li key={`f${i}`}>
          <span className="flex items-center gap-1.5 text-slate-600">
            <FileIcon width={15} height={15} className="text-brand-600" />
            <span className="truncate">{file.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
