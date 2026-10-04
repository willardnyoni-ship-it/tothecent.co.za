-- Automatic SMS for bookings: a reminder before the appointment, a confirmation
-- when an online booking is confirmed, and a notice if one is cancelled or
-- declined. To The Cent pays for the messages as part of the plan, so each
-- business has a monthly cap.
--
-- Every 10 minutes the schedule calls the 'booking-sms' Edge Function. It asks
-- sms_due() what's owed right now, sends it through the SMS provider, and
-- records each message in sms_outbox. One message per booking per kind, ever:
-- the unique index makes double-sending impossible, even if the schedule fires
-- twice or the function is retried.

create extension if not exists pg_net with schema extensions;

-- ---------- per-business choices ----------
alter table public.booking_settings
  add column if not exists sms_reminders boolean not null default true,
  add column if not exists reminder_hours integer not null default 24 check (reminder_hours in (2, 3, 6, 12, 24, 48)),
  add column if not exists sms_confirm boolean not null default true;

-- ---------- the log of every message ----------
create table if not exists public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('reminder', 'confirmation', 'cancelled', 'test')),
  to_phone text not null,
  body text not null,
  segments integer not null default 1,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists sms_outbox_booking_kind_idx on public.sms_outbox (booking_id, kind) where booking_id is not null;
create index if not exists sms_outbox_business_idx on public.sms_outbox (business_id, created_at desc);

alter table public.sms_outbox enable row level security;
create policy "members can view" on public.sms_outbox for select using (is_business_member(business_id));
revoke all on public.sms_outbox from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.sms_outbox from authenticated;
grant select on public.sms_outbox to authenticated;

-- stops two overlapping runs from working on the same messages
create table if not exists public.sms_state (id integer primary key default 1 check (id = 1), last_run timestamptz);
insert into public.sms_state (id) values (1) on conflict do nothing;
alter table public.sms_state enable row level security;
revoke all on public.sms_state from anon, authenticated, public;

create or replace function public.sms_claim_run() returns boolean
language sql security definer set search_path to 'public', 'pg_temp'
as $$
  with u as (update sms_state set last_run = now() where id = 1 and (last_run is null or last_run < now() - interval '90 seconds') returning 1)
  select exists (select 1 from u);
$$;

-- ---------- what is owed right now ----------
-- reminder:     a confirmed booking, within the business's reminder window
-- confirmation: an online booking that is now confirmed (instantly, or after the owner approved it)
-- cancelled:    an online booking that was declined or cancelled
-- Stops at the monthly cap, never repeats a message that was sent, and retries a
-- failed one up to 3 times.
create or replace function public.sms_due(p_limit integer default 100, p_cap integer default 300)
returns table (
  booking_id uuid, business_id uuid, kind text, phone text, client_name text, service text, date date, start_time text,
  staff_name text, biz_name text, contact_phone text, slug text, deposit_due numeric, reference text, attempts integer
)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with n as (select (now() at time zone 'Africa/Johannesburg') as sast),
  cand as (
    select b.id, b.business_id, b.client_name, b.client_phone, b.service, b.date, b.start_time, b.staff_name, b.status, b.source, b.deposit_due, b.created_at,
           (b.date + b.start_time::time) as start_ts, s.sms_reminders, s.reminder_hours, s.sms_confirm, s.slug, s.contact_phone, bz.name as biz_name,
           (select count(*) from sms_outbox o where o.business_id = b.business_id and o.status = 'sent' and o.created_at >= date_trunc('month', now())) as sent_month
    from bookings b
    join booking_settings s on s.business_id = b.business_id
    join businesses bz on bz.id = b.business_id
    where coalesce(b.client_phone, '') <> '' and b.date >= ((now() at time zone 'Africa/Johannesburg')::date - 1)
  ),
  want as (
    select c.*, 'reminder'::text as kind from cand c, n
      where c.status = 'booked' and c.sms_reminders and c.start_ts > n.sast + interval '20 minutes'
        and c.start_ts - make_interval(hours => c.reminder_hours) <= n.sast
    union all
    select c.*, 'confirmation'::text from cand c, n
      where c.status = 'booked' and c.source = 'online' and c.sms_confirm and c.start_ts > n.sast and c.created_at > now() - interval '14 days'
    union all
    select c.*, 'cancelled'::text from cand c, n
      where c.status = 'cancelled' and c.source = 'online' and c.sms_confirm and c.start_ts > n.sast and c.created_at > now() - interval '14 days'
  )
  select w.id, w.business_id, w.kind, w.client_phone, w.client_name, w.service, w.date, w.start_time, w.staff_name, w.biz_name, w.contact_phone, w.slug,
         w.deposit_due, upper(left(w.id::text, 6)), coalesce(o.attempts, 0)
  from want w
  left join sms_outbox o on o.booking_id = w.id and o.kind = w.kind
  where w.sent_month < p_cap
    and (o.id is null or (o.status = 'failed' and o.attempts < 3))
    -- someone who has just been sent a confirmation doesn't need a reminder minutes later
    and not (w.kind = 'reminder' and exists (select 1 from sms_outbox c2 where c2.booking_id = w.id and c2.kind = 'confirmation' and c2.status = 'sent' and c2.sent_at > now() - interval '3 hours'))
  order by w.start_ts
  limit p_limit;
$$;

revoke execute on function public.sms_claim_run(), public.sms_due(integer, integer) from anon, authenticated, public;
grant execute on function public.sms_claim_run(), public.sms_due(integer, integer) to service_role;

-- How many this month, for the owner's panel.
create or replace function public.sms_usage(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not is_business_member(p_business) then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object('sent', (select count(*) from sms_outbox where business_id = p_business and status = 'sent' and created_at >= date_trunc('month', now())), 'cap', 300);
end $$;
revoke execute on function public.sms_usage(uuid) from anon, public;
grant execute on function public.sms_usage(uuid) to authenticated;

-- ---------- the schedule ----------
-- Every 10 minutes. The function only does what sms_due() says is owed, so it's
-- harmless if called extra times; it does nothing until the SMS login is added.
do $$
begin
  perform cron.unschedule('booking-sms') where exists (select 1 from cron.job where jobname = 'booking-sms');
  perform cron.schedule('booking-sms', '*/10 * * * *', $cron$
    select net.http_post(
      url := 'https://pkbpmnpevxjrqjnepsjd.supabase.co/functions/v1/booking-sms',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_foyO2Py6QAR3oG8IK4OyzQ_WOFBcuiN","apikey":"sb_publishable_foyO2Py6QAR3oG8IK4OyzQ_WOFBcuiN"}'::jsonb,
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 20000);
  $cron$);
end $$;
