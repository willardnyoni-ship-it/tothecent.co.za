-- App owner console: lets the people listed in app_admins see who uses the
-- app, how much, and invite new people. Everything an admin reads goes
-- through the SECURITY DEFINER functions below, each of which refuses to
-- run unless the caller is in app_admins - no table here is readable
-- across users through the normal API, and nobody can add themselves as
-- an admin (only the database owner can insert into app_admins).
--
-- Deliberately aggregate: admins see accounts, sign-ins and counts of what
-- each account has created, never the contents of anyone's personal
-- budget, transactions or invoices.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- An admin may see their own row (that's how the app knows to show the
-- console); no insert/update/delete policies, so the API can't change it.
create policy "see own admin row" on public.app_admins for select using (user_id = auth.uid());

create or replace function public.is_app_admin()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select exists (select 1 from app_admins where user_id = auth.uid()); $$;
revoke execute on function public.is_app_admin() from anon, public;
grant execute on function public.is_app_admin() to authenticated;

-- ---------- activity log (written by the app once a day per device) ----------
create table if not exists public.app_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  mode text check (mode in ('personal','business')),
  device text,
  created_at timestamptz not null default now(),
  unique (user_id, day, device)
);
alter table public.app_activity enable row level security;
create policy "log own activity" on public.app_activity for insert with check (user_id = auth.uid());
create policy "admins read activity" on public.app_activity for select using (is_app_admin());
create index if not exists app_activity_day_idx on public.app_activity (day);

-- ---------- invites ----------
create table if not exists public.app_invites (
  id uuid primary key default gen_random_uuid(),
  code uuid not null unique default gen_random_uuid(),
  email text not null,
  name text,
  note text,
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_invites enable row level security;
create policy "admins manage invites" on public.app_invites for all using (is_app_admin()) with check (is_app_admin());

-- What the landing page needs to greet an invited person and prefill the
-- sign-up form - only for someone holding the (unguessable) invite code.
create or replace function public.invite_details(invite_code uuid)
returns table (email text, name text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select i.email, i.name from app_invites i where i.code = invite_code; $$;
grant execute on function public.invite_details(uuid) to anon, authenticated;

-- Admins can read the waitlist (it had no read policy before).
create policy "admins read waitlist" on public.waitlist_signups for select using (is_app_admin());

-- ---------- admin read functions ----------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare out jsonb;
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'never_signed_in', (select count(*) from auth.users where last_sign_in_at is null),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'signed_in_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'signed_in_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'active_today', (select count(distinct user_id) from app_activity where day = current_date),
    'active_7d', (select count(distinct user_id) from app_activity where day > current_date - 7),
    'households', (select count(*) from budget_sync),
    'personal_synced_7d', (select count(*) from budget_sync where updated_at > now() - interval '7 days'),
    'statements', (select count(*) from statements),
    'businesses', (select count(*) from businesses),
    'businesses_by_profile', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(business_profile, 'not chosen') k, count(*) n from businesses group by 1) x),
    'feature_use', (select coalesce(jsonb_object_agg(f, n), '{}'::jsonb) from (select f, count(*) n from businesses, jsonb_array_elements_text(features) f group by 1) x),
    'invoices', (select count(*) from invoices),
    'invoiced_value', (select coalesce(sum(total), 0) from invoices where status not in ('draft','cancelled')),
    'quotes', (select count(*) from quotes),
    'bookings', (select count(*) from bookings),
    'business_transactions', (select count(*) from business_transactions),
    'expenses', (select count(*) from expenses),
    'waitlist', (select count(*) from waitlist_signups),
    'invites', (select count(*) from app_invites),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
        select g::date d, (select count(*) from auth.users u where u.created_at::date = g::date) n
        from generate_series(current_date - 29, current_date, interval '1 day') g) s),
    'active_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
        select g::date d, (select count(distinct a.user_id) from app_activity a where a.day = g::date) n
        from generate_series(current_date - 29, current_date, interval '1 day') g) s)
  ) into out;
  return out;
end $$;

create or replace function public.admin_users()
returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  segment text, business_name text, business_profile text, business_role text,
  personal_last_sync timestamptz, last_active date, active_days_30 bigint, devices text
)
language plpgsql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
    u.raw_user_meta_data->>'segment',
    b.name, b.business_profile, m.role,
    (select max(s.updated_at) from household_members hm join budget_sync s on s.household = hm.household where hm.user_id = u.id),
    (select max(a.day) from app_activity a where a.user_id = u.id),
    (select count(distinct a.day) from app_activity a where a.user_id = u.id and a.day > current_date - 30),
    (select string_agg(distinct a.device, ', ') from app_activity a where a.user_id = u.id)
  from auth.users u
  left join lateral (select bm.business_id, bm.role from business_members bm where bm.user_id = u.id and bm.status = 'active' order by bm.joined_at limit 1) m on true
  left join businesses b on b.id = m.business_id
  order by u.last_sign_in_at desc nulls last;
end $$;

-- Sign-ins that are still active (Supabase removes a session on log out),
-- with the device each one came from.
create or replace function public.admin_sessions()
returns table (email text, signed_in_at timestamptz, last_seen timestamptz, user_agent text)
language plpgsql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select u.email::text, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at), s.user_agent
  from auth.sessions s join auth.users u on u.id = s.user_id
  order by 3 desc limit 200;
end $$;

revoke execute on function public.admin_overview() from anon, public;
revoke execute on function public.admin_users() from anon, public;
revoke execute on function public.admin_sessions() from anon, public;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_sessions() to authenticated;
