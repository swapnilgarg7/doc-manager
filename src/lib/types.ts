export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export interface Document {
  id: string;
  folder_id: string;
  name: string;
  created_at: string;
}

export interface Revision {
  id: string;
  document_id: string;
  revision_number: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  notes: string | null;
  created_at: string;
}

/** A document plus its revisions, newest revision first. */
export interface DocumentWithRevisions extends Document {
  revisions: Revision[];
  /** Highest-numbered (current/main) revision, or null if none uploaded yet. */
  latest: Revision | null;
}

export interface FolderContents {
  folder: Folder | null; // null = root level
  breadcrumbs: Folder[]; // root → ... → current (excludes root sentinel)
  subfolders: Folder[];
  documents: DocumentWithRevisions[];
}
