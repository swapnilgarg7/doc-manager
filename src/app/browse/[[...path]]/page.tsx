import { FolderView } from "@/components/FolderView";

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  // The catch-all gives us URL-encoded segments; decode each back to real names.
  const relPath = (path ?? []).map(decodeURIComponent).join("/");
  return <FolderView key={relPath} relPath={relPath} />;
}
