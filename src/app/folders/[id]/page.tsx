import { FolderView } from "@/components/FolderView";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FolderView folderId={id} />;
}
