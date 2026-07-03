alter table public.creed_document_versions
  add column if not exists version_family_id uuid,
  add column if not exists version_family_title text not null default '';

update public.creed_document_versions as version
set
  version_family_id = proposal.family_id,
  version_family_title = coalesce(nullif(proposal.summary, ''), nullif(version.summary, ''), '')
from public.creed_document_proposals as proposal
where version.source_proposal_id = proposal.id
  and version.version_family_id is null;

with legacy_versions as (
  select
    id,
    md5(
      document_id::text || ':' ||
      actor_type || ':' ||
      coalesce(author_user_id::text, '') || ':' ||
      coalesce(author_agent_label, '') || ':' ||
      coalesce(summary, '') || ':' ||
      date_trunc('hour', created_at)::text
    ) as family_hash
  from public.creed_document_versions
  where version_family_id is null
)
update public.creed_document_versions as version
set
  version_family_id = (
    substr(legacy.family_hash, 1, 8) || '-' ||
    substr(legacy.family_hash, 9, 4) || '-' ||
    substr(legacy.family_hash, 13, 4) || '-' ||
    substr(legacy.family_hash, 17, 4) || '-' ||
    substr(legacy.family_hash, 21, 12)
  )::uuid,
  version_family_title = coalesce(nullif(version.summary, ''), 'Updated document content')
from legacy_versions as legacy
where version.id = legacy.id;

create index if not exists creed_document_versions_family_idx
  on public.creed_document_versions (document_id, version_family_id, revision desc);
