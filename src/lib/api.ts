import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabase/client";
import type {
  Folder,
  Document,
  Revision,
  DocumentWithRevisions,
  FolderContents,
} from "@/lib/types";

function throwIf<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function getRootFolders(): Promise<Folder[]> {
  return throwIf(
    await supabase
      .from("folders")
      .select("*")
      .is("parent_id", null)
      .order("created_at", { ascending: true })
  );
}

export async function getFolder(id: string): Promise<Folder> {
  return throwIf(
    await supabase.from("folders").select("*").eq("id", id).single()
  );
}

/** Walk up the tree to build breadcrumbs (root → ... → current). */
export async function getBreadcrumbs(folderId: string): Promise<Folder[]> {
  const chain: Folder[] = [];
  let currentId: string | null = folderId;
  // Guard against cycles / runaway loops.
  for (let i = 0; i < 100 && currentId; i++) {
    const folder: Folder = await getFolder(currentId);
    chain.unshift(folder);
    currentId = folder.parent_id;
  }
  return chain;
}

export async function createFolder(
  name: string,
  parentId: string | null
): Promise<Folder> {
  return throwIf(
    await supabase
      .from("folders")
      .insert({ name: name.trim(), parent_id: parentId })
      .select("*")
      .single()
  );
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("folders")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

/** Deletes a folder and (via ON DELETE CASCADE) everything under it. */
export async function deleteFolder(id: string): Promise<void> {
  await deleteStorageForFolder(id);
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Folder contents (subfolders + documents with their revisions)
// ---------------------------------------------------------------------------

export async function getFolderContents(
  folderId: string | null
): Promise<FolderContents> {
  const folder = folderId ? await getFolder(folderId) : null;
  const breadcrumbs = folderId ? await getBreadcrumbs(folderId) : [];

  const subfoldersQuery = supabase
    .from("folders")
    .select("*")
    .order("name", { ascending: true });
  const subfolders = throwIf(
    await (folderId
      ? subfoldersQuery.eq("parent_id", folderId)
      : subfoldersQuery.is("parent_id", null))
  ) as Folder[];

  let documents: DocumentWithRevisions[] = [];
  if (folderId) {
    const docs = throwIf(
      await supabase
        .from("documents")
        .select("*")
        .eq("folder_id", folderId)
        .order("name", { ascending: true })
    ) as Document[];
    documents = await attachRevisions(docs);
  }

  return { folder, breadcrumbs, subfolders, documents };
}

async function attachRevisions(
  docs: Document[]
): Promise<DocumentWithRevisions[]> {
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d.id);
  const revisions = throwIf(
    await supabase
      .from("revisions")
      .select("*")
      .in("document_id", ids)
      .order("revision_number", { ascending: false })
  ) as Revision[];

  const byDoc = new Map<string, Revision[]>();
  for (const rev of revisions) {
    const list = byDoc.get(rev.document_id) ?? [];
    list.push(rev);
    byDoc.set(rev.document_id, list);
  }

  return docs.map((d) => {
    const revs = byDoc.get(d.id) ?? [];
    return { ...d, revisions: revs, latest: revs[0] ?? null };
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function getDocument(id: string): Promise<Document> {
  return throwIf(
    await supabase.from("documents").select("*").eq("id", id).single()
  );
}

export async function getDocumentWithRevisions(
  id: string
): Promise<DocumentWithRevisions> {
  const doc = await getDocument(id);
  const [withRevs] = await attachRevisions([doc]);
  return withRevs;
}

export async function createDocument(
  folderId: string,
  name: string
): Promise<Document> {
  return throwIf(
    await supabase
      .from("documents")
      .insert({ folder_id: folderId, name: name.trim() })
      .select("*")
      .single()
  );
}

export async function renameDocument(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteStorageForDocument(id);
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Revisions + storage
// ---------------------------------------------------------------------------

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

async function nextRevisionNumber(documentId: string): Promise<number> {
  const { data, error } = await supabase
    .from("revisions")
    .select("revision_number")
    .eq("document_id", documentId)
    .order("revision_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const current = data?.[0]?.revision_number ?? 0;
  return current + 1;
}

/**
 * Uploads a file as the next revision of a document. Because revision numbers
 * only increase, the newest upload automatically becomes the current/main one.
 */
export async function uploadRevision(
  documentId: string,
  file: File,
  notes?: string
): Promise<Revision> {
  const revisionNumber = await nextRevisionNumber(documentId);
  const path = `${documentId}/rev-${revisionNumber}-${Date.now()}-${safeFileName(
    file.name
  )}`;

  const upload = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upload.error) throw upload.error;

  const inserted = await supabase
    .from("revisions")
    .insert({
      document_id: documentId,
      revision_number: revisionNumber,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      content_type: file.type || null,
      notes: notes?.trim() || null,
    })
    .select("*")
    .single();

  if (inserted.error) {
    // Roll back the orphaned storage object so we don't leak files.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    throw inserted.error;
  }
  return inserted.data as Revision;
}

/**
 * Create a document AND upload its first revision in one shot.
 * Cleans up the empty document if the upload fails.
 */
export async function createDocumentWithFirstRevision(
  folderId: string,
  name: string,
  file: File,
  notes?: string
): Promise<DocumentWithRevisions> {
  const doc = await createDocument(folderId, name);
  try {
    const rev = await uploadRevision(doc.id, file, notes);
    return { ...doc, revisions: [rev], latest: rev };
  } catch (err) {
    await supabase.from("documents").delete().eq("id", doc.id);
    throw err;
  }
}

export async function deleteRevision(rev: Revision): Promise<void> {
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([rev.file_path]);
  const { error } = await supabase.from("revisions").delete().eq("id", rev.id);
  if (error) throw error;
}

export function getFileUrl(path: string): string {
  return supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

// ---------------------------------------------------------------------------
// Storage cleanup helpers (best-effort; DB cascade handles the rows)
// ---------------------------------------------------------------------------

async function deleteStorageForDocument(documentId: string): Promise<void> {
  const { data } = await supabase
    .from("revisions")
    .select("file_path")
    .eq("document_id", documentId);
  const paths = (data ?? []).map((r) => r.file_path);
  if (paths.length) await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
}

async function deleteStorageForFolder(folderId: string): Promise<void> {
  // Collect this folder + all descendants, then all their documents' files.
  const allFolderIds = await collectFolderIds(folderId);
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .in("folder_id", allFolderIds);
  const docIds = (docs ?? []).map((d) => d.id);
  if (docIds.length === 0) return;
  const { data: revs } = await supabase
    .from("revisions")
    .select("file_path")
    .in("document_id", docIds);
  const paths = (revs ?? []).map((r) => r.file_path);
  if (paths.length) await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
}

async function collectFolderIds(rootId: string): Promise<string[]> {
  const result: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < 100 && frontier.length; depth++) {
    result.push(...frontier);
    const { data } = await supabase
      .from("folders")
      .select("id")
      .in("parent_id", frontier);
    frontier = (data ?? []).map((f) => f.id);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export interface Stats {
  sections: number;
  folders: number;
  documents: number;
  revisions: number;
}

export async function getStats(): Promise<Stats> {
  const count = async (table: string) =>
    (
      await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
    ).count ?? 0;

  const [sections, folders, documents, revisions] = await Promise.all([
    (
      await supabase
        .from("folders")
        .select("*", { count: "exact", head: true })
        .is("parent_id", null)
    ).count ?? 0,
    count("folders"),
    count("documents"),
    count("revisions"),
  ]);

  return { sections, folders, documents, revisions };
}
