create table if not exists public.creed_document_folders (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  path text not null unique,
  parent_id uuid references public.creed_document_folders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.creed_document_folders enable row level security;

drop policy if exists "signed in users can read shared document folders" on public.creed_document_folders;
create policy "signed in users can read shared document folders"
  on public.creed_document_folders
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can create shared document folders" on public.creed_document_folders;
create policy "signed in users can create shared document folders"
  on public.creed_document_folders
  for insert
  to authenticated
  with check (true);

drop policy if exists "signed in users can update shared document folders" on public.creed_document_folders;
create policy "signed in users can update shared document folders"
  on public.creed_document_folders
  for update
  to authenticated
  using (true)
  with check (true);

alter table public.creed_documents
  add column if not exists folder_id uuid references public.creed_document_folders(id) on delete set null,
  add column if not exists path text,
  add column if not exists github_repo_owner text,
  add column if not exists github_repo_name text,
  add column if not exists github_branch text not null default 'main',
  add column if not exists github_path text,
  add column if not exists last_remote_sha text,
  add column if not exists last_synced_content_hash text,
  add column if not exists last_synced_revision integer,
  add column if not exists sync_status text not null default 'not-configured',
  add column if not exists revision integer not null default 1,
  add column if not exists last_edited_by text,
  add column if not exists last_edited_via text;

update public.creed_documents
set
  path = coalesce(path, slug || '.md'),
  github_path = coalesce(github_path, slug || '.md')
where path is null or github_path is null;

alter table public.creed_documents
  alter column path set not null,
  alter column github_path set not null;

create unique index if not exists creed_documents_path_key
  on public.creed_documents (path);

create index if not exists creed_documents_folder_idx
  on public.creed_documents (folder_id, updated_at desc);

drop policy if exists "signed in users can create shared documents" on public.creed_documents;
create policy "signed in users can create shared documents"
  on public.creed_documents
  for insert
  to authenticated
  with check (true);

drop policy if exists "signed in users can update shared documents" on public.creed_documents;
create policy "signed in users can update shared documents"
  on public.creed_documents
  for update
  to authenticated
  using (true)
  with check (true);

update public.creed_documents
set
  github_branch = coalesce(github_branch, 'main'),
  sync_status = coalesce(sync_status, 'local-ahead')
where slug = 'welcome';
