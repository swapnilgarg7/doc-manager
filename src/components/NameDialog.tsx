"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function NameDialog({
  open,
  title,
  label,
  initialValue = "",
  submitLabel = "Save",
  placeholder,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {/* Inner form mounts fresh each time the modal opens, so its state resets. */}
      <NameForm
        label={label}
        initialValue={initialValue}
        submitLabel={submitLabel}
        placeholder={placeholder}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function NameForm({
  label,
  initialValue,
  submitLabel,
  placeholder,
  onSubmit,
  onClose,
}: {
  label: string;
  initialValue: string;
  submitLabel: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
        <input
          autoFocus
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
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
          disabled={busy || !value.trim()}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
