import { LocalLibrary } from "@/components/LocalLibrary";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Document Library
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a folder on this computer. Files are read right here in your
          browser — never uploaded. Each PDF’s title is read and tagged so you
          can search your drawings by title or discipline.
        </p>
      </div>

      <LocalLibrary />
    </div>
  );
}
