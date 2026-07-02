alter table public.creed_documents
  add column if not exists public_share_id text,
  add column if not exists public_share_enabled boolean not null default false,
  add column if not exists public_shared_at timestamptz;

create unique index if not exists creed_documents_public_share_id_key
  on public.creed_documents (public_share_id)
  where public_share_id is not null;

create index if not exists creed_documents_public_share_lookup_idx
  on public.creed_documents (public_share_id)
  where public_share_enabled = true and archived_at is null;

alter table public.creed_document_comments
  add column if not exists public_author_label text;
