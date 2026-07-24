-- ============================================================================
-- Migration 0002 — add drawing title + tags to documents (for AI tagging/search)
-- Run this in the Supabase SQL Editor if you already ran the original schema.sql.
-- (Fresh installs get these columns from schema.sql directly.)
-- ============================================================================

alter table public.documents
  add column if not exists drawing_title text;

alter table public.documents
  add column if not exists tags text[] not null default '{}';

-- GIN index makes tag containment/overlap searches fast.
create index if not exists documents_tags_idx
  on public.documents using gin (tags);
