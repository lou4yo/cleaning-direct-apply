-- Deployed manually on 2026-10-26 in UK recovery project cntynkumizvpiajmfzcj.
-- Keep first-party user information in the UK project; these fields are
-- privacy-minimised campaign labels, not personal browsing history or cookies.
alter table public.customer_quote_recovery_queue
  add column if not exists attribution_medium text not null default 'none',
  add column if not exists attribution_campaign text not null default 'none';

do $$
begin
  if not exists(select 1 from pg_constraint
      where conname='quote_recovery_medium_safe'
      and conrelid='public.customer_quote_recovery_queue'::regclass) then
    alter table public.customer_quote_recovery_queue
      add constraint quote_recovery_medium_safe
      check (char_length(attribution_medium) between 1 and 40
             and attribution_medium ~ '^[a-z0-9_-]+$');
  end if;
  if not exists(select 1 from pg_constraint
      where conname='quote_recovery_campaign_safe'
      and conrelid='public.customer_quote_recovery_queue'::regclass) then
    alter table public.customer_quote_recovery_queue
      add constraint quote_recovery_campaign_safe
      check (char_length(attribution_campaign) between 1 and 80
             and attribution_campaign ~ '^[a-z0-9_-]+$');
  end if;
end $$;

-- No additional anonymous or authenticated grants; RLS stays enabled.
