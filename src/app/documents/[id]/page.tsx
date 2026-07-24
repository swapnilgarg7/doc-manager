import { DocumentView } from "@/components/DocumentView";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocumentView key={id} documentId={id} />;
}
