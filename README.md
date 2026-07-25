# Construction Document Manager (in-browser)

A document library for construction drawings that reads a folder of files
**directly in your browser** — the files are **never uploaded**. It reads each
**PDF's title block** to extract the drawing **title** and **classification
tags**, and lets you **search** by title, tag, or file name.

Because files stay in the browser, the app can be **deployed as a normal website**
(e.g. Vercel) and still keep company files private: only a tiny **snippet** of
each PDF's title block (the extracted text, or a small cropped image of the
bottom-right corner) is ever sent to the server for AI tagging — never the file.

## How it works

```
open the site (Chrome / Edge)
  └─ "Choose folder" → the browser's folder picker (File System Access API)
       browser reads each file locally (never uploaded):
         for each PDF, pdfjs runs IN THE BROWSER:
           ├─ has a text layer?  → read the bottom-right title block text
           └─ scanned / image?   → render page 1 → crop bottom-right → image
                → POST just that snippet → server → Azure OpenAI → { title, tags }
                → saved in the browser (IndexedDB)
                → searchable by title / tag / name
```

- **Files never leave the browser.** Reading, preview, and download all happen
  locally from the folder you picked. The server only ever receives the
  title-block snippet.
- **Persistence is local.** The picked folder handle and the extracted
  titles/tags are stored in your browser (IndexedDB). On a return visit the app
  offers a one-click **Reconnect** (the browser re-asks folder permission).
- **Read-only over your files.** Nothing is renamed, moved, or deleted on disk.

## Requirements

- **Chrome or Microsoft Edge (desktop).** The app uses the browser's
  [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API),
  which those support. Firefox/Safari can't open local folders this way and will
  see an "unsupported browser" notice.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Azure OpenAI (for tagging)

```bash
cp .env.local.example .env.local
```

```env
# Server-side only — never reaches the browser. Only the title-block snippet is
# ever sent; the PDF itself never leaves the user's browser.
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-5.4-mini
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_API_KEY=YOUR-AZURE-OPENAI-KEY
```

There is no database and no file storage to set up.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge.

### Deploying

Deploy like any Next.js app (e.g. Vercel). Set the four `AZURE_OPENAI_*`
environment variables in the host's project settings. Because files are read in
the browser and never uploaded, deploying does not send anyone's documents to the
server — only title-block snippets transit, exactly as when run locally.

## How to use it

1. Click **Choose folder** and pick a folder in the browser dialog. Local,
   network, and cloud-synced (OneDrive/Dropbox) folders all work. The real folder
   tree appears.
2. Click **Tag untagged** to run title/tag extraction over every PDF in the
   current folder (and everything nested under it) that isn't tagged yet. Tagging
   runs through a small concurrency pool with automatic retry, so large folders
   tag reliably; re-run to fill in anything missed.
3. Use the **search bar** to find drawings by title, tag, or file name — scoped to
   the current folder and everything beneath it.
4. Click 👁 to preview a file, ⬇ to download a copy, or 🏷 to (re)tag one PDF.
5. Edited a drawing on disk? Click **Rescan** — it shows a **Changed** badge and
   re-tags on the next **Tag untagged**.

> Non-PDF files are listed and searchable by name, but not tagged.

## Scripts

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Notes

- The pdfjs worker is served from `public/pdf.worker.min.mjs` (copied from
  `pdfjs-dist` at the same version). If you upgrade `pdfjs-dist`, re-copy it:
  `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/`.
- Extracted metadata lives in the browser's IndexedDB, per folder. Clearing site
  data resets it; the files themselves are untouched.
