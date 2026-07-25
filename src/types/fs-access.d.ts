// Minimal ambient types for the parts of the File System Access API that the
// bundled TypeScript DOM lib doesn't yet include. The handle interfaces
// (FileSystemDirectoryHandle/FileSystemFileHandle) and requestPermission already
// exist in lib.dom; we only add what's missing.

export {};

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor?: {
      mode?: "read" | "readwrite";
    }): Promise<PermissionState>;
    requestPermission?(descriptor?: {
      mode?: "read" | "readwrite";
    }): Promise<PermissionState>;
  }

  interface Window {
    showDirectoryPicker?(options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | string;
    }): Promise<FileSystemDirectoryHandle>;
  }

  // Async iteration over directory entries lives in the `dom.asynciterable`
  // lib, which this project's tsconfig doesn't include — declare it here.
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<
      FileSystemDirectoryHandle | FileSystemFileHandle
    >;
    entries(): AsyncIterableIterator<
      [string, FileSystemDirectoryHandle | FileSystemFileHandle]
    >;
    keys(): AsyncIterableIterator<string>;
  }
}
