create table if not exists public.creed_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  content text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists creed_documents_updated_idx
  on public.creed_documents (updated_at desc);

alter table public.creed_documents enable row level security;

drop policy if exists "signed in users can read shared documents" on public.creed_documents;
create policy "signed in users can read shared documents"
  on public.creed_documents
  for select
  to authenticated
  using (true);

insert into public.creed_documents (slug, title, description, content)
values (
  'welcome',
  'Welcome',
  'Shared Markdown workspace for everyone invited to this Creed.',
  '# Welcome

This is the shared dashboard for invited users.

- Add Markdown documents here for everyone to view.
- Supabase is the source of truth.
- GitHub can be wired as the version-control layer for publishing and reviewing changes.'
)
on conflict (slug) do nothing;
