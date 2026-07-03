-- Family-level comments on document proposal groups.
--
-- Individual proposal-diff comments use proposal_id. A multi-hunk edit creates
-- sibling proposals that share creed_document_proposals.family_id, but there is
-- no separate family table to reference. Store the family UUID directly so the
-- review rail can host one discussion above the aggregated linked proposals.

alter table public.creed_document_comments
  add column if not exists proposal_family_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creed_document_comments_single_proposal_anchor_check'
      and conrelid = 'public.creed_document_comments'::regclass
  ) then
    alter table public.creed_document_comments
      add constraint creed_document_comments_single_proposal_anchor_check
      check (proposal_id is null or proposal_family_id is null);
  end if;
end $$;

create index if not exists creed_document_comments_proposal_family_idx
  on public.creed_document_comments (document_id, proposal_family_id, created_at)
  where proposal_family_id is not null;

comment on column public.creed_document_comments.proposal_family_id is
  'The proposal family this comment is anchored to, or null for document-content and individual proposal comments. Families are identified by creed_document_proposals.family_id.';

notify pgrst, 'reload schema';
