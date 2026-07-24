import {
  findOrCreateFolder,
  findDocument,
  createDocument,
  uploadRevision,
} from "@/lib/api";

// Uses the standard File & Directory Entries API (FileSystemEntry and friends
// are provided by the DOM lib) exposed via DataTransferItem.webkitGetAsEntry().

/** A parsed folder tree read from the user's drop. */
export interface ImportNode {
  name: string;
  folders: ImportNode[];
  files: File[];
}

// ---------------------------------------------------------------------------
// Reading the dropped tree
// ---------------------------------------------------------------------------

/**
 * Must be called synchronously inside the `drop` handler — the DataTransfer
 * items are only valid during the event. The returned entries stay valid for
 * async traversal afterwards.
 */
export function getDroppedEntries(dt: DataTransfer): FileSystemEntry[] {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  return entries;
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readAllEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        // readEntries returns at most ~100 entries per call; keep going.
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

async function readDirectory(
  entry: FileSystemDirectoryEntry
): Promise<ImportNode> {
  const node: ImportNode = { name: entry.name, folders: [], files: [] };
  const children = await readAllEntries(entry.createReader());
  for (const child of children) {
    if (child.isFile) {
      const file = await readFile(child as FileSystemFileEntry);
      // Skip hidden/system files that folders often carry.
      if (!file.name.startsWith(".")) node.files.push(file);
    } else if (child.isDirectory) {
      node.folders.push(await readDirectory(child as FileSystemDirectoryEntry));
    }
  }
  return node;
}

/**
 * Turn the dropped entries into a single synthetic root node whose contents are
 * what the user dropped. Plain files dropped directly land in `root.files`.
 */
export async function buildImportTree(
  entries: FileSystemEntry[]
): Promise<ImportNode> {
  const root: ImportNode = { name: "", folders: [], files: [] };
  for (const entry of entries) {
    if (entry.isFile) {
      const file = await readFile(entry as FileSystemFileEntry);
      if (!file.name.startsWith(".")) root.files.push(file);
    } else if (entry.isDirectory) {
      root.folders.push(await readDirectory(entry as FileSystemDirectoryEntry));
    }
  }
  return root;
}

export function countTree(node: ImportNode): {
  folders: number;
  files: number;
} {
  let folders = 0;
  let files = node.files.length;
  for (const f of node.folders) {
    folders += 1;
    const sub = countTree(f);
    folders += sub.folders;
    files += sub.files;
  }
  return { folders, files };
}

/** A single dropped folder with no loose files — the mergeable case. */
export function singleDroppedFolder(root: ImportNode): ImportNode | null {
  return root.files.length === 0 && root.folders.length === 1
    ? root.folders[0]
    : null;
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// ---------------------------------------------------------------------------
// Executing the import
// ---------------------------------------------------------------------------

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ImportResult {
  uploaded: number;
  createdDocuments: number;
  addedRevisions: number;
  failures: { path: string; message: string }[];
}

/**
 * Mirror `node`'s contents into the folder identified by `targetFolderId`.
 * Files become documents (rev 1); if a document with the same name already
 * exists in that folder, the file is uploaded as its next revision instead.
 * Existing subfolders with matching names are reused, not duplicated.
 */
export async function importIntoFolder(
  targetFolderId: string,
  node: ImportNode,
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  const total = countTree(node).files;
  const result: ImportResult = {
    uploaded: 0,
    createdDocuments: 0,
    addedRevisions: 0,
    failures: [],
  };

  async function walk(folderId: string, n: ImportNode, path: string) {
    for (const file of n.files) {
      const filePath = `${path}/${file.name}`;
      onProgress({ done: result.uploaded, total, current: filePath });
      try {
        const docName = stripExtension(file.name);
        const existing = await findDocument(folderId, docName);
        if (existing) {
          await uploadRevision(existing.id, file, "Imported revision");
          result.addedRevisions += 1;
        } else {
          const doc = await createDocument(folderId, docName);
          await uploadRevision(doc.id, file, "Imported");
          result.createdDocuments += 1;
        }
        result.uploaded += 1;
        onProgress({ done: result.uploaded, total, current: filePath });
      } catch (err) {
        result.failures.push({
          path: filePath,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    for (const sub of n.folders) {
      const childFolder = await findOrCreateFolder(folderId, sub.name);
      await walk(childFolder.id, sub, `${path}/${sub.name}`);
    }
  }

  await walk(targetFolderId, node, "");
  return result;
}
