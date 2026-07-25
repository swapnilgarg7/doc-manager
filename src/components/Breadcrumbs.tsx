import Link from "next/link";
import type { FolderEntry } from "@/lib/types";
import { browseHref } from "@/lib/format";
import { HomeIcon, ChevronRight } from "./icons";

/** Path-based breadcrumbs: Home → … → current folder. */
export function Breadcrumbs({ trail }: { trail: FolderEntry[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <Link
        href="/"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100 hover:text-slate-700"
      >
        <HomeIcon width={15} height={15} />
        Home
      </Link>
      {trail.map((f, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={f.relPath} className="flex items-center gap-1">
            <ChevronRight width={14} height={14} className="text-slate-300" />
            {isLast ? (
              <span className="px-1.5 py-1 font-medium text-slate-800">
                {f.name}
              </span>
            ) : (
              <Link
                href={browseHref(f.relPath)}
                className="rounded-md px-1.5 py-1 hover:bg-slate-100 hover:text-slate-700"
              >
                {f.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
