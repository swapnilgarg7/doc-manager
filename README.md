# Construction Document Manager (local)

A lightweight document library for construction drawings that runs **entirely on
your own machine**. Point it at a folder on your computer; it scans the files,
reads each **PDF's title block** to extract the drawing **title** and
**classification tags**, and lets you **search** your drawings by title, tag, or
file name.

> **Your files never leave this computer.** There is no cloud storage and no
> upload. The app reads files directly from your local disk. The only thing that
> ever goes out is a tiny **snippet** of each PDF's title block (the extracted
> text, or a cropped image of just the bottom-right corner) sent to Azure OpenAI
> for tagging — never the whole file.

## Features

- 📁 **Scan a local folder** — choose any folder on your disk; the app mirrors
  its real subfolder tree and files. Nothing is copied or moved.
- 🏷️ **Automatic AI tagging** — for each PDF, the bottom-right title block is
  parsed deterministically with pdfjs, then Azure OpenAI extracts the exact
  **drawing title** and assigns **tags** (Plumbing, Drainage, Structural, …).
  Scanned/image-only PDFs are rendered and read via the vision model (OCR).
- 🔎 **Scoped search** — search within a folder (and everything nested under it)
  by file name, extracted title, or tag.
- 👁️ **Preview & download** — open any file inline in a new tab, or download a copy.
- 🔒 **Read-only over your files** — the app never renames, moves, or deletes your
  files. Extracted titles/tags live in a small local index only.

## How it works

```
choose a local folder
   └─ server scans the directory tree (Node fs, on localhost)
        for each PDF:
          ├─ has a text layer?  ──► pdfjs reads the bottom-right title block
          └─ scanned / image?   ──► mupdf renders page 1 → crop bottom-right → image
                 ──► Azure OpenAI (title + tags)  ← only the snippet is sent
                 ──► saved to a LOCAL index (.data/index.json)
                 ──► searchable by title / tag / name
```

The extracted metadata is stored in `./.data/index.json`, keyed by each file's
path **relative to the chosen folder**, along with the file's size + modified
time. If a file changes on disk, its metadata is treated as stale and re-tagged
on the next **Tag untagged** run. This folder is gitignored and stays local.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Azure OpenAI (for tagging)

Copy the example env file and fill in your Azure OpenAI values:

```bash
cp .env.local.example .env.local
```

```env
# Used server-side only — never reaches the browser. Only the title-block
# snippet of a PDF is ever sent; the file itself never leaves your machine.
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-5.4-mini
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_API_KEY=YOUR-AZURE-OPENAI-KEY
```

> There is **no database and no storage bucket to set up.** The folder to scan is
> chosen in the app, not in env.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to use it

1. On the **Home** page, click **Choose folder** and paste the absolute path to a
   folder on this computer (e.g. `/Users/you/Drawings`). The app scans it and
   shows the real folder tree.
2. Click **Tag untagged** on any folder to run title/tag extraction over every
   PDF in it (and everything nested under it) that isn't tagged yet. Tagging runs
   through a small concurrency pool with automatic retry on rate-limits, so large
   folders tag reliably; re-running fills in anything that was missed.
3. Use the **search bar** on any folder to find drawings by title, tag, or file
   name — results are scoped to that folder and everything beneath it.
4. Click 👁 to preview a file, ⬇ to download a copy, or 🏷 to (re-)tag a single PDF.
5. Changed a drawing on disk? It shows a **Changed** badge; **Tag untagged**
   re-reads it.

> Non-PDF files are listed and searchable by name, but not tagged.

To point at a different folder later, use **Change folder** on the Home page.

---

## Scripts

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Notes

- This app is meant to run **locally**, for a single user, on the machine that
  holds the files. It has no authentication and its API reads the local disk — do
  not expose it on a public network.
- All filesystem access is confined to the chosen folder: request paths are
  resolved strictly within it (with `..`, absolute-path, and symlink-escape
  guards), so the app can only read files under the folder you selected.
