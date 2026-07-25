/** App config: the local folder the user chose to scan (absolute path). */
export interface AppConfig {
  root: string | null;
}

/** A subfolder inside the scanned tree, identified by its path relative to root. */
export interface FolderEntry {
  name: string;
  relPath: string;
}

/** A file inside the scanned tree, plus any extracted title/tags. */
export interface FileItem {
  name: string;
  relPath: string;
  size: number;
  mtimeMs: number;
  isPdf: boolean;
  /** Extracted drawing title, or null if not (yet) tagged / not a PDF. */
  title: string | null;
  tags: string[];
  /** True if the file changed on disk since it was tagged (metadata is stale). */
  stale: boolean;
}

/** Contents of one directory. */
export interface DirListing {
  path: string; // "" = root
  breadcrumbs: FolderEntry[]; // root → … → current (excludes Home)
  folders: FolderEntry[];
  files: FileItem[];
}

/** Result of extracting a drawing's metadata from its title block. */
export interface DrawingMeta {
  title: string | null;
  tags: string[];
}

/** A search hit: a file plus the folder it lives in. */
export interface SearchRow {
  file: FileItem;
  folderPath: string; // relPath of the containing folder ("" = root)
  folderName: string;
}

export interface Stats {
  folders: number;
  files: number;
  pdfs: number;
  tagged: number;
}
