-- Online booking: each business gets a public link where clients pick a
-- service, a day and a free time. The owner manages everything themselves
-- (services, hours, days off, staff, instant vs approve).
--
-- Everything the public can do goes through the three public_booking_*
-- functions below. They are the only way in: the tables themselves stay
-- private to the business's own members, and the functions return no
-- personal data (busy times carry no names) and re-check every rule on the
-- server, so a hand-made request can't book outside your hours or on top of
-- someone else.

-- ---------- tables ----------
create table if not exists public.booking_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  enabled boolean not null default false,
  headline text,
  intro text,
  -- instant: a booking is confirmed straight away; approve: it waits as a request
  approval text not null default 'instant' check (approval in ('instant', 'approve')),
  slot_minutes integer not null default 30 check (slot_minutes in (15, 30, 60)),
  min_notice_hours integer not null default 2 check (min_notice_hours between 0 and 168),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 180),
  -- { "0": {"open":"09:00","close":"17:00"}, ... "6": ... }  (0 = Sunday); a missing day is closed
  hours jsonb not null default '{"1":{"open":"09:00","close":"17:00"},"2":{"open":"09:00","close":"17:00"},"3":{"open":"09:00","close":"17:00"},"4":{"open":"09:00","close":"17:00"},"5":{"open":"09:00","close":"17:00"},"6":{"open":"09:00","close":"13:00"}}'::jsonb,
  days_off jsonb not null default '[]'::jsonb,      -- ["2026-12-25", ...]
  staff jsonb not null default '[]'::jsonb,          -- ["Thandeka", "Lindiwe"]; empty = one calendar
  capacity integer not null default 1 check (capacity between 1 and 20),  -- chairs, when there's no staff list
  deposit_note text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  duration_min integer not null default 60 check (duration_min between 5 and 480),
  price numeric not null default 0 check (price >= 0),
  deposit numeric not null default 0 check (deposit >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists booking_services_business_idx on public.booking_services (business_id);

-- bookings made online, awaiting approval, and the deposit the client was asked for
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('requested', 'booked', 'done', 'no_show', 'cancelled'));
alter table public.bookings
  add column if not exists source text not null default 'manual' check (source in ('manual', 'online')),
  add column if not exists deposit_due numeric not null default 0;
create index if not exists bookings_day_idx on public.bookings (business_id, date);

-- members see them, members who can write change them; the public sees nothing directly
do $$
declare t text;
begin
  foreach t in array array['booking_settings', 'booking_services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members can view" on public.%I for select using (is_business_member(business_id))', t);
    execute format('create policy "write members can insert" on public.%I for insert with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can update" on public.%I for update using (is_business_write_member(business_id)) with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can delete" on public.%I for delete using (is_business_write_member(business_id))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- the public booking page ----------
-- Everything the page needs to draw itself. null if the link doesn't exist or is switched off.
create or replace function public.public_booking_page(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare s booking_settings; b businesses; sast timestamp := now() at time zone 'Africa/Johannesburg';
begin
  select * into s from booking_settings where slug = lower(trim(p_slug)) and enabled;
  if not found then return null; end if;
  select * into b from businesses where id = s.business_id;
  return jsonb_build_object(
    'name', b.name, 'headline', s.headline, 'intro', s.intro, 'approval', s.approval,
    'slot_minutes', s.slot_minutes, 'min_notice_hours', s.min_notice_hours, 'max_days_ahead', s.max_days_ahead,
    'hours', s.hours, 'days_off', s.days_off, 'staff', s.staff, 'capacity', s.capacity,
    'deposit_note', s.deposit_note, 'contact_phone', s.contact_phone,
    'now', to_char(sast, 'YYYY-MM-DD"T"HH24:MI'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'duration_min', v.duration_min, 'price', v.price, 'deposit', v.deposit) order by v.sort_order, v.name)
                          from booking_services v where v.business_id = s.business_id and v.active), '[]'::jsonb)
  );
end $$;

-- When people are already booked, so the page can grey those times out. No names, no numbers.
create or replace function public.public_booking_busy(p_slug text, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare s booking_settings;
begin
  select * into s from booking_settings where slug = lower(trim(p_slug)) and enabled;
  if not found then return '[]'::jsonb; end if;
  if p_to - p_from > 62 then p_to := p_from + 62; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', k.date, 'start', k.start_time, 'mins', k.duration_min, 'staff', coalesce(k.staff_name, '')))
    from bookings k
    where k.business_id = s.business_id and k.date between p_from and p_to and k.status in ('booked', 'requested')
  ), '[]'::jsonb);
end $$;

-- Make a booking. Returns { ok: true, ... } or { ok: false, error: <code> }.
create or replace function public.public_book(
  p_slug text, p_service uuid, p_date date, p_time text, p_staff text, p_name text, p_phone text, p_note text
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s booking_settings; v booking_services; biz_name text;
  sast timestamp := now() at time zone 'Africa/Johannesburg';
  t time; start_ts timestamp; end_t time; h jsonb; open_t time; close_t time;
  nm text := left(trim(coalesce(p_name, '')), 60);
  ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  chosen text := ''; cand text; n int; new_id uuid; st text;
begin
  select * into s from booking_settings where slug = lower(trim(p_slug)) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  -- one booking at a time per business, so two people can't take the same slot
  perform pg_advisory_xact_lock(hashtextextended(s.business_id::text, 0));

  select * into v from booking_services where id = p_service and business_id = s.business_id and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_input'); end if;
  if char_length(nm) < 2 or char_length(ph) < 9 or char_length(ph) > 15 or p_time !~ '^[0-2][0-9]:[0-5][0-9]$' or p_date is null then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  begin t := p_time::time; exception when others then return jsonb_build_object('ok', false, 'error', 'bad_input'); end;

  start_ts := p_date + t;
  if start_ts < sast + make_interval(hours => s.min_notice_hours) then return jsonb_build_object('ok', false, 'error', 'too_soon'); end if;
  if p_date > sast::date + s.max_days_ahead then return jsonb_build_object('ok', false, 'error', 'too_far'); end if;

  h := s.hours -> extract(dow from p_date)::int::text;
  if h is null or s.days_off ? p_date::text then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  open_t := (h ->> 'open')::time; close_t := (h ->> 'close')::time;
  end_t := t + make_interval(mins => v.duration_min);
  if t < open_t or end_t > close_t or end_t < t
     or (extract(epoch from (t - open_t)) / 60)::int % s.slot_minutes <> 0 then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  -- abuse limits: a flood from one place, or one person holding lots of slots
  select count(*) into n from bookings where business_id = s.business_id and source = 'online' and created_at > now() - interval '1 hour';
  if n >= 40 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select count(*) into n from bookings where business_id = s.business_id and source = 'online' and client_phone = ph
    and status in ('booked', 'requested') and date >= sast::date;
  if n >= 4 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  -- find someone free
  if jsonb_array_length(s.staff) > 0 then
    for cand in select jsonb_array_elements_text(s.staff) loop
      continue when lower(coalesce(p_staff, '')) not in ('', 'any') and lower(cand) <> lower(p_staff);
      select count(*) into n from bookings k where k.business_id = s.business_id and k.date = p_date and k.status in ('booked', 'requested')
        and (coalesce(k.staff_name, '') = '' or lower(k.staff_name) = lower(cand))
        and k.start_time::time < end_t and t < k.start_time::time + make_interval(mins => k.duration_min);
      if n = 0 then chosen := cand; exit; end if;
    end loop;
    if chosen = '' then return jsonb_build_object('ok', false, 'error', 'slot_taken'); end if;
  else
    select count(*) into n from bookings k where k.business_id = s.business_id and k.date = p_date and k.status in ('booked', 'requested')
      and k.start_time::time < end_t and t < k.start_time::time + make_interval(mins => k.duration_min);
    if n >= s.capacity then return jsonb_build_object('ok', false, 'error', 'slot_taken'); end if;
  end if;

  st := case s.approval when 'instant' then 'booked' else 'requested' end;
  insert into bookings (business_id, client_name, client_phone, date, start_time, duration_min, service, staff_name, price, deposit, deposit_due, status, notes, source)
  values (s.business_id, nm, ph, p_date, to_char(t, 'HH24:MI'), v.duration_min, v.name, nullif(chosen, ''), v.price, 0, v.deposit, st, nullif(left(trim(coalesce(p_note, '')), 300), ''), 'online')
  returning id into new_id;

  select name into biz_name from businesses where id = s.business_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'reference', upper(left(new_id::text, 6)), 'status', st, 'business', biz_name,
    'service', v.name, 'date', p_date, 'time', to_char(t, 'HH24:MI'), 'end', to_char(end_t, 'HH24:MI'), 'staff', chosen,
    'price', v.price, 'deposit_due', v.deposit, 'deposit_note', s.deposit_note, 'contact_phone', s.contact_phone);
end $$;

-- Only these three are public.
revoke execute on function public.public_booking_page(text), public.public_booking_busy(text, date, date),
  public.public_book(text, uuid, date, text, text, text, text, text) from public;
grant execute on function public.public_booking_page(text), public.public_booking_busy(text, date, date),
  public.public_book(text, uuid, date, text, text, text, text, text) to anon, authenticated;
