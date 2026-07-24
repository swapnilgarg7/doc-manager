# Construction Document Manager

A lightweight ERP-style document library for construction projects, built with
**Next.js + Tailwind CSS + Supabase**.

Organize documents into **Sections** (e.g. _Drawings_, _Materials_ — and any
custom ones you add), nest **Categories** to any depth (e.g. _Materials →
Foundation → Switches_), and upload drawings (PDFs, images, any file) as
**documents**. Every re-upload of a document is a new **revision** — the newest
one automatically becomes the _current/main_ revision, and older ones are kept in
an **archive** you can still preview or download.

## Features

- 📂 **Unlimited folder nesting** — sections → categories → sub-categories → …
- 🗂️ **Drag-and-drop folder import** — drop an entire folder from your computer
  onto a section (or into any folder) and the whole subfolder tree + files are
  recreated automatically. Re-dropping an updated folder adds new **revisions**
  to matching documents instead of duplicating them.
- 📄 **Documents with revision control** — newest upload is always "main", older
  revisions are archived automatically (never deleted unless you say so)
- 👁️ **In-browser preview** for PDFs and images, plus one-click download
- ➕ Add/rename/delete sections, categories, documents, and individual revisions
- 📊 Dashboard counts (sections / categories / documents / revisions)
- 🎨 Clean, responsive UI

## Data model

| Table       | Purpose                                                        |
| ----------- | ------------------------------------------------------------- |
| `folders`   | Self-referencing tree. `parent_id IS NULL` = a top Section.   |
| `documents` | A logical drawing/spec that lives in a folder.                |
| `revisions` | Each uploaded file. Highest `revision_number` = current/main. |

Files are stored in a Supabase Storage bucket named **`documents`**.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a project, then grab your
credentials from **Project Settings → API**.

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

### 4. Create the database schema

Open the Supabase Dashboard → **SQL Editor** → **New query**, paste the contents
of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This will:

- create the `folders`, `documents`, and `revisions` tables
- create the public **`documents`** storage bucket
- set permissive access policies (no auth yet — see the note below)
- seed two starter sections: **Drawings** and **Materials**

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to use it

1. **Home** shows your Sections. Click **New section** to add one (e.g.
   _Permits_) alongside Drawings and Materials.
2. **Open a section** → add a **category** (e.g. _Foundation_, _Switches_) with
   **New category**. Categories can nest as deep as you like.
3. Inside any folder, click **Upload document**, give it a name (e.g.
   _Foundation Layout Plan_) and attach the first PDF.
4. To revise a drawing, open the document (or use the ⬆ button on its row) and
   **Upload new revision**. The new file becomes the current revision; the
   previous one moves to **Archived revisions**.
5. Click 👁 to preview inline, or ⬇ to download.

### Bulk import (drag & drop a folder)

Instead of creating everything by hand, drag a folder straight from Finder /
Explorer:

- **Onto a section card** on the home page, or **anywhere on an open folder
  page**.
- A preview shows exactly what will be created (how many categories and files).
  A single dropped folder can either be merged into the target or recreated as a
  subfolder — your choice.
- Every file becomes a document (revision 1). If a document with the same name
  already exists in that location, the file is added as its **next revision** —
  so dropping an updated copy of your folder later just versions the changed
  drawings automatically.

> Folder drag-and-drop uses the browser's File & Directory Entries API, which
> works in Chrome, Edge, and Safari.

---

## A note on authentication

This build has **no login** — anyone who can reach the app (and its anon key)
can read and write. That was an intentional choice to keep the first version
simple. When you're ready to lock it down:

1. Enable an auth provider in Supabase (email/password, magic link, etc.).
2. Replace the permissive `"public all"` RLS policies in `schema.sql` with
   policies scoped to `auth.uid()` / `authenticated`.
3. Add a login page and wrap the app with the Supabase auth session.

## Scripts

| Command         | What it does                    |
| --------------- | ------------------------------- |
| `npm run dev`   | Start the dev server            |
| `npm run build` | Production build                |
| `npm run start` | Serve the production build      |
| `npm run lint`  | Run ESLint                      |
