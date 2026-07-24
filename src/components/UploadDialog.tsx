"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { UploadIcon, FileIcon } from "./icons";
import { formatBytes } from "@/lib/format";

export function UploadDialog({
  open,
  title,
  withName = false,
  nameLabel = "Document name",
  namePlaceholder = "e.g. Foundation Layout Plan",
  submitLabel = "Upload",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  /** When true, asks for a document name (used when creating a new document). */
  withName?: boolean;
  nameLabel?: string;
  namePlaceholder?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (args: {
    file: File;
    notes: string;
    name: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setNotes("");
      setFile(null);
      setError(null);
      setBusy(false);
      setDragging(false);
    }
  }, [open]);

  const canSubmit = !!file && (!withName || name.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (withName && !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ file, notes: notes.trim(), name: name.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {withName && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {nameLabel}
            </label>
            <input
              autoFocus
              className="input"
              value={name}
              placeholder={namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            File {withName ? "(first revision)" : ""}
          </label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? "border-brand-500 bg-brand-50"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {file ? (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <FileIcon className="text-brand-600" />
                <span className="font-medium">{file.name}</span>
                <span className="text-slate-400">
                  ({formatBytes(file.size)})
                </span>
              </div>
            ) : (
              <>
                <UploadIcon className="text-slate-400" width={24} height={24} />
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-brand-600">
                    Click to browse
                  </span>{" "}
                  or drag & drop
                </p>
                <p className="text-xs text-slate-400">PDF, images, or any file</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="application/pdf,image/*,*/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Revision notes{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            className="input min-h-[70px] resize-y"
            value={notes}
            placeholder="What changed in this revision?"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!canSubmit || busy}
          >
            {busy ? "Uploading…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
