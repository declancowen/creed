-- Default the shared document dashboard to an ungrouped board.
--
-- The global preferences row previously defaulted group_by to 'status', which
-- meant a fresh board (no per-user preference saved) always fell back to
-- status grouping via `effective = user ?? global`. Align the global default
-- with the user default ('none') so the board is ungrouped out of the box, and
-- realign the existing global row that still carries the old default.

alter table public.creed_document_dashboard_global_preferences
  alter column group_by set default 'none';

update public.creed_document_dashboard_global_preferences
  set group_by = 'none'
  where group_by = 'status';
