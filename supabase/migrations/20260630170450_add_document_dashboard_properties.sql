alter table public.creed_documents
  add column if not exists document_type text not null default 'feature',
  add column if not exists stage text not null default 'discovery',
  add column if not exists lifecycle text not null default 'ideation',
  add column if not exists status text not null default 'not-started',
  add column if not exists priority text not null default 'medium',
  add column if not exists size text not null default 'm',
  add column if not exists archived_at timestamptz;

alter table public.creed_document_folders
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_document_type_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_document_type_check
      check (document_type in ('bug', 'cx', 'feature'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_stage_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_stage_check
      check (stage in ('discovery', 'design', 'deliver', 'review'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_lifecycle_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_lifecycle_check
      check (
        lifecycle in (
          'ideation',
          'shaping',
          'requirements',
          'ui-cx-journeys',
          'process-design',
          'solution-design',
          'technical-design',
          'delivery-planning',
          'development',
          'qa-testing',
          'release',
          'hypercare-support',
          'outcomes-benefits',
          'learnings-optimisation'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_status_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_status_check
      check (status in ('not-started', 'in-progress', 'blocked', 'ready-for-review', 'done'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_priority_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_documents_size_check'
      and conrelid = 'public.creed_documents'::regclass
  ) then
    alter table public.creed_documents
      add constraint creed_documents_size_check
      check (size in ('xs', 's', 'm', 'l', 'xl'));
  end if;
end $$;

update public.creed_documents
set
  document_type = coalesce(document_type, 'feature'),
  stage = coalesce(stage, 'discovery'),
  lifecycle = coalesce(lifecycle, 'ideation'),
  status = case when slug = 'welcome' then 'in-progress' else coalesce(status, 'not-started') end,
  priority = coalesce(priority, 'medium'),
  size = coalesce(size, 'm')
where archived_at is null;

create index if not exists creed_documents_dashboard_idx
  on public.creed_documents (status, document_type, stage, lifecycle, priority, updated_at desc)
  where archived_at is null;

create index if not exists creed_documents_archived_idx
  on public.creed_documents (archived_at)
  where archived_at is not null;

create index if not exists creed_document_folders_archived_idx
  on public.creed_document_folders (archived_at)
  where archived_at is not null;

create table if not exists public.creed_document_dashboard_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  view_mode text not null default 'list',
  group_by text not null default 'none',
  sort_by text not null default 'updated',
  sort_dir text not null default 'desc',
  visible_properties text[] not null default array[
    'status',
    'documentType',
    'stage',
    'lifecycle',
    'priority',
    'size'
  ],
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.creed_document_dashboard_global_preferences (
  id boolean primary key default true check (id),
  view_mode text not null default 'list',
  group_by text not null default 'status',
  sort_by text not null default 'updated',
  sort_dir text not null default 'desc',
  visible_properties text[] not null default array[
    'status',
    'documentType',
    'stage',
    'lifecycle',
    'priority',
    'size'
  ],
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_user_preferences_view_mode_check'
      and conrelid = 'public.creed_document_dashboard_user_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_user_preferences
      add constraint creed_document_dashboard_user_preferences_view_mode_check
      check (view_mode in ('list', 'cards'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_user_preferences_group_by_check'
      and conrelid = 'public.creed_document_dashboard_user_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_user_preferences
      add constraint creed_document_dashboard_user_preferences_group_by_check
      check (group_by in ('none', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_user_preferences_sort_by_check'
      and conrelid = 'public.creed_document_dashboard_user_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_user_preferences
      add constraint creed_document_dashboard_user_preferences_sort_by_check
      check (sort_by in ('name', 'updated', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_user_preferences_sort_dir_check'
      and conrelid = 'public.creed_document_dashboard_user_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_user_preferences
      add constraint creed_document_dashboard_user_preferences_sort_dir_check
      check (sort_dir in ('asc', 'desc'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_global_preferences_view_mode_check'
      and conrelid = 'public.creed_document_dashboard_global_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_global_preferences
      add constraint creed_document_dashboard_global_preferences_view_mode_check
      check (view_mode in ('list', 'cards'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_global_preferences_group_by_check'
      and conrelid = 'public.creed_document_dashboard_global_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_global_preferences
      add constraint creed_document_dashboard_global_preferences_group_by_check
      check (group_by in ('none', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_global_preferences_sort_by_check'
      and conrelid = 'public.creed_document_dashboard_global_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_global_preferences
      add constraint creed_document_dashboard_global_preferences_sort_by_check
      check (sort_by in ('name', 'updated', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_dashboard_global_preferences_sort_dir_check'
      and conrelid = 'public.creed_document_dashboard_global_preferences'::regclass
  ) then
    alter table public.creed_document_dashboard_global_preferences
      add constraint creed_document_dashboard_global_preferences_sort_dir_check
      check (sort_dir in ('asc', 'desc'));
  end if;
end $$;

insert into public.creed_document_dashboard_global_preferences (id)
values (true)
on conflict (id) do nothing;

alter table public.creed_document_dashboard_user_preferences enable row level security;
alter table public.creed_document_dashboard_global_preferences enable row level security;

drop policy if exists "users can read their document dashboard preferences" on public.creed_document_dashboard_user_preferences;
create policy "users can read their document dashboard preferences"
  on public.creed_document_dashboard_user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can create their document dashboard preferences" on public.creed_document_dashboard_user_preferences;
create policy "users can create their document dashboard preferences"
  on public.creed_document_dashboard_user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update their document dashboard preferences" on public.creed_document_dashboard_user_preferences;
create policy "users can update their document dashboard preferences"
  on public.creed_document_dashboard_user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "signed in users can read global document dashboard preferences" on public.creed_document_dashboard_global_preferences;
create policy "signed in users can read global document dashboard preferences"
  on public.creed_document_dashboard_global_preferences
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can create shared documents" on public.creed_documents;
drop policy if exists "signed in users can update shared documents" on public.creed_documents;
drop policy if exists "signed in users can create shared document folders" on public.creed_document_folders;
drop policy if exists "signed in users can update shared document folders" on public.creed_document_folders;

create table if not exists public.creed_document_activity_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.creed_documents(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.creed_document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.creed_documents(id) on delete cascade,
  parent_id uuid references public.creed_document_comments(id) on delete cascade,
  reference_id text,
  reference_quote text,
  body text not null,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint creed_document_comments_body_not_empty check (length(trim(body)) > 0),
  constraint creed_document_comments_status_check check (status in ('open', 'resolved'))
);

create table if not exists public.creed_document_comment_mentions (
  comment_id uuid not null references public.creed_document_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (comment_id, user_id)
);

create table if not exists public.creed_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  document_id uuid references public.creed_documents(id) on delete cascade,
  comment_id uuid references public.creed_document_comments(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  href text not null,
  read_at timestamptz,
  email_status text not null default 'not-configured',
  email_attempted_at timestamptz,
  email_error text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_notifications_type_check'
      and conrelid = 'public.creed_notifications'::regclass
  ) then
    alter table public.creed_notifications
      add constraint creed_notifications_type_check
      check (type in ('mention', 'comment-reply', 'document-update'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_notifications_email_status_check'
      and conrelid = 'public.creed_notifications'::regclass
  ) then
    alter table public.creed_notifications
      add constraint creed_notifications_email_status_check
      check (email_status in ('not-configured', 'pending', 'sent', 'failed'));
  end if;
end $$;

create index if not exists creed_document_activity_events_document_idx
  on public.creed_document_activity_events (document_id, created_at desc);

create index if not exists creed_document_comments_document_idx
  on public.creed_document_comments (document_id, parent_id, created_at asc);

create index if not exists creed_document_comments_reference_idx
  on public.creed_document_comments (document_id, reference_id)
  where reference_id is not null;

create index if not exists creed_document_comment_mentions_user_idx
  on public.creed_document_comment_mentions (user_id, created_at desc);

create index if not exists creed_notifications_user_idx
  on public.creed_notifications (user_id, read_at, created_at desc);

alter table public.creed_document_activity_events enable row level security;
alter table public.creed_document_comments enable row level security;
alter table public.creed_document_comment_mentions enable row level security;
alter table public.creed_notifications enable row level security;

drop policy if exists "signed in users can read document activity" on public.creed_document_activity_events;
create policy "signed in users can read document activity"
  on public.creed_document_activity_events
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can read document comments" on public.creed_document_comments;
create policy "signed in users can read document comments"
  on public.creed_document_comments
  for select
  to authenticated
  using (true);

drop policy if exists "signed in users can read document comment mentions" on public.creed_document_comment_mentions;
create policy "signed in users can read document comment mentions"
  on public.creed_document_comment_mentions
  for select
  to authenticated
  using (true);

drop policy if exists "users can read their notifications" on public.creed_notifications;
create policy "users can read their notifications"
  on public.creed_notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.creed_documents to authenticated;
grant select on public.creed_document_folders to authenticated;
grant select on public.creed_document_dashboard_user_preferences to authenticated;
grant select on public.creed_document_dashboard_global_preferences to authenticated;
grant select on public.creed_document_activity_events to authenticated;
grant select on public.creed_document_comments to authenticated;
grant select on public.creed_document_comment_mentions to authenticated;
grant select on public.creed_notifications to authenticated;
