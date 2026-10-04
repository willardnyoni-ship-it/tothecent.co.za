-- Yoco live sales feed.
-- A shop owner connects their own Yoco API key (read access to orders and
-- payments). Yoco then calls the 'yoco' Edge Function on every payment; the
-- function fetches the payment and records it as income in Money.

-- Keys and webhook secrets live here and nowhere else. Row-level security is
-- on with no policies, and every table privilege is revoked, so the browser
-- can never read them - only the Edge Function (service role) can.
create table if not exists public.yoco_connections (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  api_key text not null,
  webhook_subscription_id text,
  webhook_secret text,
  status text not null default 'active' check (status in ('active', 'error')),
  last_event_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.yoco_connections enable row level security;
revoke all on public.yoco_connections from anon, authenticated, public;

-- Yoco can deliver the same event more than once; remember which ones we've done.
create table if not exists public.yoco_events (
  webhook_id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  received_at timestamptz not null default now()
);
alter table public.yoco_events enable row level security;
revoke all on public.yoco_events from anon, authenticated, public;

-- One transaction per Yoco payment (and per fee line), however many times
-- it's delivered or re-synced.
alter table public.business_transactions add column if not exists external_id text;
create unique index if not exists business_transactions_external_idx
  on public.business_transactions (business_id, source, external_id);
alter table public.business_transactions drop constraint if exists business_transactions_source_check;
alter table public.business_transactions add constraint business_transactions_source_check
  check (source = any (array['statement','manual','receipt','cashup','booking','payroll','stock','yoco']));

-- What the app may know: whether it's connected, and today's card sales.
-- Never the key or the secret.
create or replace function public.yoco_status(p_business uuid)
returns table (
  connected boolean, status text, last_error text, connected_at timestamptz,
  last_event_at timestamptz, today_count bigint, today_total numeric,
  last_sale_at timestamptz, last_sale_amount numeric
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not is_business_member(p_business) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select (c.business_id is not null), c.status, c.last_error, c.created_at, c.last_event_at,
    (select count(*) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' and t.date = today),
    (select coalesce(sum(t.amount), 0) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' and t.date = today),
    (select max(t.created_at) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income'),
    (select t.amount from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' order by t.created_at desc limit 1)
  from (select 1) x left join yoco_connections c on c.business_id = p_business;
end $$;
revoke execute on function public.yoco_status(uuid) from anon, public;
grant execute on function public.yoco_status(uuid) to authenticated;
