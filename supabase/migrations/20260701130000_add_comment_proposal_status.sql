-- Agent-proposed comments: a comment can be a private pending proposal until
-- its proposer (the token user whose agent created it) approves it. Approval
-- flips it to a normal shared comment authored by that user.
--
-- proposal_status is orthogonal to the existing status (open/resolved) column.
-- Privacy is enforced in the application layer (listDocumentComments excludes
-- pending; listPendingCommentsForUser is caller-scoped); RLS stays using(true)
-- as the backstop, consistent with the other shared-document tables.

alter table public.creed_document_comments
  add column if not exists proposal_status text not null default 'shared';

alter table public.creed_document_comments
  add column if not exists proposed_by_agent_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creed_document_comments_proposal_status_check'
      and conrelid = 'public.creed_document_comments'::regclass
  ) then
    alter table public.creed_document_comments
      add constraint creed_document_comments_proposal_status_check
      check (proposal_status in ('pending', 'shared'));
  end if;
end $$;

-- Supports the proposer's private pending lookup and keeps the shared-list
-- filter cheap.
create index if not exists creed_document_comments_document_proposal_idx
  on public.creed_document_comments (document_id, proposal_status, created_by);
