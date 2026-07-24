-- ============================================================================
-- Construction Document Manager — Database schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: it drops and recreates the objects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Folders form a self-referencing tree.
--   * Top-level folders (parent_id IS NULL) are the "Sections": Drawings, Materials, ...
--   * Nested folders are "Categories": Foundation, Switches, ... (unlimited depth)
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.folders(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists folders_parent_id_idx on public.folders(parent_id);

-- A document is a single logical drawing/spec that can have many revisions.
create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references public.folders(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists documents_folder_id_idx on public.documents(folder_id);

-- Each upload of a document is a revision. Highest revision_number = current/main.
create table if not exists public.revisions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  revision_number int  not null,
  file_name       text not null,
  file_path       text not null,          -- path inside the "documents" storage bucket
  file_size       bigint,
  content_type    text,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (document_id, revision_number)
);
create index if not exists revisions_document_id_idx on public.revisions(document_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- No auth yet — allow the anon role full access. Tighten these when you add auth.
-- ---------------------------------------------------------------------------
alter table public.folders   enable row level security;
alter table public.documents enable row level security;
alter table public.revisions enable row level security;

drop policy if exists "public all" on public.folders;
drop policy if exists "public all" on public.documents;
drop policy if exists "public all" on public.revisions;

create policy "public all" on public.folders   for all using (true) with check (true);
create policy "public all" on public.documents for all using (true) with check (true);
create policy "public all" on public.revisions for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage bucket for the uploaded files (PDFs, images, etc.)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "documents public read"   on storage.objects;
drop policy if exists "documents public insert" on storage.objects;
drop policy if exists "documents public delete" on storage.objects;

create policy "documents public read"   on storage.objects for select
  using (bucket_id = 'documents');
create policy "documents public insert" on storage.objects for insert
  with check (bucket_id = 'documents');
create policy "documents public delete" on storage.objects for delete
  using (bucket_id = 'documents');

-- ---------------------------------------------------------------------------
-- Seed the two default sections (only if the table is empty)
-- ---------------------------------------------------------------------------
insert into public.folders (name, parent_id)
select 'Drawings', null
where not exists (select 1 from public.folders where parent_id is null and name = 'Drawings');

insert into public.folders (name, parent_id)
select 'Materials', null
where not exists (select 1 from public.folders where parent_id is null and name = 'Materials');
