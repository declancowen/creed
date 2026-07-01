-- Documents the agent-proposal columns on creed_document_comments and, as a
-- side effect, forces PostgREST to reload its schema cache.
--
-- Context: 20260701130000 added `proposal_status` / `proposed_by_agent_label`,
-- but the PostgREST schema cache can lag behind an ALTER TABLE, which surfaces
-- in the app as `column creed_document_comments.proposal_status does not exist`.
-- COMMENT ON COLUMN is a DDL statement, so it fires Supabase's pgrst_ddl_watch
-- event trigger and reloads the cache. It is idempotent and safe to re-run.

comment on column public.creed_document_comments.proposal_status is
  'Agent-proposal lifecycle: ''pending'' (private to the proposer) until approved, then ''shared''. Orthogonal to status (open/resolved). Defaults to ''shared'' for human-editor comments.';

comment on column public.creed_document_comments.proposed_by_agent_label is
  'Display label of the agent that proposed the comment, or null for human-authored comments.';

-- Belt-and-braces explicit reload in case the event trigger is not present.
notify pgrst, 'reload schema';
