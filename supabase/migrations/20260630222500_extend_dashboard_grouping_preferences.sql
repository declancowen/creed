-- Allow the dashboard view preferences to group by every editable dashboard
-- property, including priority and t-shirt size.

alter table public.creed_document_dashboard_user_preferences
  drop constraint if exists creed_document_dashboard_user_preferences_group_by_check;

alter table public.creed_document_dashboard_user_preferences
  add constraint creed_document_dashboard_user_preferences_group_by_check
  check (group_by in ('none', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));

alter table public.creed_document_dashboard_global_preferences
  drop constraint if exists creed_document_dashboard_global_preferences_group_by_check;

alter table public.creed_document_dashboard_global_preferences
  add constraint creed_document_dashboard_global_preferences_group_by_check
  check (group_by in ('none', 'status', 'documentType', 'stage', 'lifecycle', 'priority', 'size'));
