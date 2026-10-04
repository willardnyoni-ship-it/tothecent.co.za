-- Owner portal: retention. Activity is reconstructed from every trace a
-- person leaves - the daily app_activity log (from 2 Oct 2026), sign-ins,
-- sessions, budget syncs, statement uploads, and any business record they
-- created - so cohorts reach back to the first sign-ups. Counts only; no
-- record contents leave the database. Owner-only, like the other admin_*
-- functions.

create or replace function public.admin_retention()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare out jsonb;
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;

  with ev as (
    -- (signing up alone doesn't count - only real use does)
    select user_id, day as d from app_activity
    union all select id, last_sign_in_at::date from auth.users where last_sign_in_at is not null
    union all select user_id, created_at::date from auth.sessions
    union all select user_id, coalesce(refreshed_at::date, updated_at::date) from auth.sessions
    union all select hm.user_id, s.updated_at::date from budget_sync s join household_members hm on hm.household = s.household
    union all select user_id, uploaded_at::date from statements
    union all select created_by, created_at::date from business_transactions where created_by is not null
    union all select created_by, created_at::date from invoices where created_by is not null
    union all select submitted_by, created_at::date from expenses where submitted_by is not null
    union all select created_by, created_at::date from quotes where created_by is not null
    union all select created_by, created_at::date from bookings where created_by is not null
    union all select created_by, created_at::date from time_entries where created_by is not null
    union all select created_by, created_at::date from cash_ups where created_by is not null
    union all select created_by, created_at::date from stock_movements where created_by is not null
    union all select created_by, created_at::date from jobs where created_by is not null
    union all select created_by, created_at::date from mileage_trips where created_by is not null
    union all select created_by, created_at::date from recurring_invoices where created_by is not null
  ),
  -- one row per person per active day, only for accounts that still exist
  days as (
    select distinct e.user_id, e.d from ev e join auth.users u on u.id = e.user_id where e.d is not null and e.d <= current_date
  ),
  -- "did something": any trace beyond just having an account
  doers as (
    select distinct user_id from (
      select user_id from app_activity
      union all select hm.user_id from budget_sync s join household_members hm on hm.household = s.household
      union all select user_id from statements
      union all select owner_id from businesses
      union all select created_by from business_transactions where created_by is not null
      union all select created_by from invoices where created_by is not null
      union all select submitted_by from expenses where submitted_by is not null
    ) x
  ),
  per_user as (
    select u.id, u.email::text as email, u.created_at::date as joined, u.last_sign_in_at,
      date_trunc('month', u.created_at)::date as cohort,
      (select count(*) from days d where d.user_id = u.id) as active_days,
      (select max(d.d) from days d where d.user_id = u.id) as last_active,
      (select count(*) from days d where d.user_id = u.id and d.d > u.created_at::date) as later_days,
      exists (select 1 from doers x where x.user_id = u.id) as did_something
    from auth.users u
  ),
  cohort_cells as (
    select p.cohort,
      ((extract(year from d.d) - extract(year from p.cohort)) * 12 + extract(month from d.d) - extract(month from p.cohort))::int as m,
      count(distinct p.id) as active
    from per_user p join days d on d.user_id = p.id
    group by 1, 2
  )
  select jsonb_build_object(
    'generated_at', now(),
    'cohorts', (select coalesce(jsonb_agg(c order by c->>'cohort'), '[]'::jsonb) from (
      select jsonb_build_object(
        'cohort', to_char(p.cohort, 'YYYY-MM'),
        'size', count(*),
        'months', (select coalesce(jsonb_agg(jsonb_build_object('m', cc.m, 'active', cc.active) order by cc.m), '[]'::jsonb)
                   from cohort_cells cc where cc.cohort = p.cohort and cc.m >= 0)
      ) as c
      from per_user p group by p.cohort
    ) z),
    'weekly_active', (select coalesce(jsonb_agg(jsonb_build_object('day', w::date, 'n',
        (select count(distinct d.user_id) from days d where d.d >= w::date and d.d < w::date + 7)) order by w), '[]'::jsonb)
      from generate_series(date_trunc('week', current_date) - interval '11 weeks', date_trunc('week', current_date), interval '1 week') w),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from per_user),
      'signed_in', (select count(*) from per_user where last_sign_in_at is not null),
      'did_something', (select count(*) from per_user where did_something),
      'came_back', (select count(*) from per_user where later_days > 0)
    ),
    'active_30', (select count(distinct user_id) from days where d > current_date - 30),
    'active_7', (select count(distinct user_id) from days where d > current_date - 7),
    'avg_daily_30', (select round(count(*)::numeric / 30, 2) from days where d > current_date - 30),
    'at_risk', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'last_active', last_active,
        'days_quiet', current_date - last_active, 'active_days', active_days, 'joined', joined) order by last_active desc), '[]'::jsonb)
      from per_user where last_active between current_date - 60 and current_date - 14 and active_days >= 2)
  ) into out;
  return out;
end $$;

revoke execute on function public.admin_retention() from anon, public;
grant execute on function public.admin_retention() to authenticated;
