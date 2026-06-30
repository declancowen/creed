-- This fork is invite-only and BYOK-only. Older hosted Creed migrations added
-- prepaid credits and defaulted AI settings to 'credits'; normalize existing
-- rows and ensure future rows default to BYOK.

alter table public.creed_ai_settings
  alter column ai_mode set default 'byok';

update public.creed_ai_settings
set ai_mode = 'byok',
    updated_at = timezone('utc'::text, now())
where ai_mode <> 'byok';
