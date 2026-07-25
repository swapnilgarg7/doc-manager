/**
 * Shown on the home page when no scan folder is set yet, or when the previously
 * chosen folder can't be read. Purely informational — the folder picker itself
 * lives on the home page.
 */
export function ConfigNotice({
  variant,
}: {
  variant: "unset" | "missing";
}) {
  if (variant === "missing") {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold">Can’t read the selected folder.</p>
        <p className="mt-1 text-red-700">
          The folder may have been moved, renamed, or is on a drive that isn’t
          mounted. Pick it again below.
        </p>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">No folder selected yet.</p>
      <p className="mt-1 text-amber-700">
        Choose a folder on this computer to scan. Your files stay on disk — they
        are never uploaded. Only a small snippet of each PDF’s title block is
        sent for AI tagging.
      </p>
    </div>
  );
}
