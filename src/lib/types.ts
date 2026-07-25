/** Result of extracting a drawing's metadata from its title block. */
export interface DrawingMeta {
  title: string | null;
  tags: string[];
}

/** Persisted per-file metadata (kept in IndexedDB, keyed by root + relPath). */
export interface FileMeta {
  title: string | null;
  tags: string[];
  /** File size when tagged — used to detect edits on disk. */
  size: number;
  /** File lastModified (ms) when tagged. */
  lastModified: number;
  taggedAt: string;
}

/** A file in the picked directory tree (handle kept in memory only). */
export interface FileNode {
  kind: "file";
  name: string;
  relPath: string; // posix path relative to the picked root
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  isPdf: boolean;
}

/** A directory in the picked tree. relPath "" is the root. */
export interface DirNode {
  kind: "dir";
  name: string;
  relPath: string;
  dirs: DirNode[];
  files: FileNode[];
}

/** A file plus its current metadata + freshness, ready to render. */
export interface FileView extends FileNode {
  title: string | null;
  tags: string[];
  tagged: boolean;
  /** File changed on disk since it was tagged → metadata is stale. */
  stale: boolean;
}

export interface Stats {
  folders: number;
  files: number;
  pdfs: number;
  tagged: number;
}
