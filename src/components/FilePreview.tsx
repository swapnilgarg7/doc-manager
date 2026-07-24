"use client";

import type { Revision } from "@/lib/types";
import { getFileUrl } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { Modal } from "./Modal";
import { DownloadIcon } from "./icons";

export function FilePreview({
  revision,
  documentName,
  onClose,
}: {
  revision: Revision | null;
  documentName: string;
  onClose: () => void;
}) {
  if (!revision) return null;
  const url = getFileUrl(revision.file_path);
  const isPdf =
    revision.content_type === "application/pdf" ||
    revision.file_name.toLowerCase().endsWith(".pdf");
  const isImage = (revision.content_type ?? "").startsWith("image/");

  return (
    <Modal
      open={!!revision}
      onClose={onClose}
      wide
      title={`${documentName} · Rev ${revision.revision_number}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-700">
              {revision.file_name}
            </p>
            <p className="text-xs">
              {formatBytes(revision.file_size)} · uploaded{" "}
              {formatDate(revision.created_at)}
            </p>
          </div>
          <a
            href={url}
            download={revision.file_name}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary shrink-0"
          >
            <DownloadIcon width={16} height={16} />
            Download
          </a>
        </div>

        <div className="h-[65vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {isPdf ? (
            <iframe
              src={`${url}#toolbar=1&view=FitH`}
              className="h-full w-full"
              title={revision.file_name}
            />
          ) : isImage ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={revision.file_name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
              <p className="text-sm">
                No inline preview available for this file type.
              </p>
              <a
                href={url}
                download={revision.file_name}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <DownloadIcon width={16} height={16} />
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
