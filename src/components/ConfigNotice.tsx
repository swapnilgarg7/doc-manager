/**
 * Informational banners for the home page. "unsupported" shows when the browser
 * lacks the File System Access API; "unset" is the initial no-folder hint.
 */
export function ConfigNotice({
  variant,
}: {
  variant: "unsupported" | "unset";
}) {
  if (variant === "unsupported") {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold">This browser can’t open local folders.</p>
        <p className="mt-1 text-red-700">
          The app reads your files directly in the browser using the File System
          Access API, which is available in{" "}
          <strong>Google Chrome and Microsoft Edge</strong> (desktop). Please open
          this page in one of those to continue. Your files stay on your machine —
          they’re never uploaded.
        </p>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">No folder selected yet.</p>
      <p className="mt-1 text-amber-700">
        Choose a folder on this computer to scan. Files are read locally in your
        browser and never uploaded — only a small snippet of each PDF’s title
        block is sent for AI tagging.
      </p>
    </div>
  );
}
