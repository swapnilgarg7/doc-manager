/**
 * The name to show for a document. Once the AI has extracted the drawing's
 * title from its title block, that becomes the document's headline; until then
 * (or if extraction failed) we fall back to the uploaded name.
 */
export function documentDisplayName(doc: {
  name: string;
  drawing_title?: string | null;
}): string {
  return doc.drawing_title?.trim() || doc.name;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}
