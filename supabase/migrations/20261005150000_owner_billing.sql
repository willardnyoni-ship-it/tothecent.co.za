-- Plans and debit orders, for the owner portal's People page.
-- Everyone gets one month free from the day they join. The owner records
-- when a person signs their debit order; the People page then shows where
-- each account stands (free trial, debit order signed, trial ended).

create table if not exists public.account_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- none = not asked yet / not signed, requested = form sent, signed, cancelled
  debit_order_status text not null default 'none' check (debit_order_status in ('none', 'requested', 'signed', 'cancelled')),
  debit_order_signed_on date,
  -- Set only when the free month is extended or shortened; null means
  -- "one month after they joined".
  trial_ends_on date,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.account_billing enable row level security;
-- Owners only. People can't see this about themselves, and all changes go
-- through admin_set_billing below, which also writes the audit log.
create policy "admins read billing" on public.account_billing for select using (is_app_admin());

drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  segment text, business_name text, business_profile text, business_role text,
  personal_last_sync timestamptz, last_active date, active_days_30 bigint, devices text,
  banned_until timestamptz, is_admin boolean, owns_business boolean,
  trial_ends_on date, debit_order_status text, debit_order_signed_on date, billing_notes text
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
    (select string_agg(distinct a.device, ', ') from app_activity a where a.user_id = u.id),
    u.banned_until,
    exists (select 1 from app_admins ad where ad.user_id = u.id),
    exists (select 1 from businesses ob where ob.owner_id = u.id),
    coalesce(ab.trial_ends_on, (u.created_at + interval '1 month')::date),
    coalesce(ab.debit_order_status, 'none'),
    ab.debit_order_signed_on,
    ab.notes
  from auth.users u
  left join lateral (select bm.business_id, bm.role from business_members bm where bm.user_id = u.id and bm.status = 'active' order by bm.joined_at limit 1) m on true
  left join businesses b on b.id = m.business_id
  left join account_billing ab on ab.user_id = u.id
  order by u.last_sign_in_at desc nulls last;
end $$;
revoke execute on function public.admin_users() from anon, public;
grant execute on function public.admin_users() to authenticated;

create or replace function public.admin_set_billing(
  p_user uuid, p_status text, p_signed_on date, p_trial_ends date, p_notes text
) returns void
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare who text; target text; signed date;
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('none', 'requested', 'signed', 'cancelled') then raise exception 'unknown debit order status'; end if;
  select email::text into target from auth.users where id = p_user;
  if target is null then raise exception 'no such account'; end if;
  select email::text into who from auth.users where id = auth.uid();
  -- Signing without a date means "today".
  signed := case when p_status = 'signed' then coalesce(p_signed_on, current_date) else p_signed_on end;

  insert into account_billing (user_id, debit_order_status, debit_order_signed_on, trial_ends_on, notes, updated_at, updated_by)
  values (p_user, p_status, signed, p_trial_ends, nullif(trim(coalesce(p_notes, '')), ''), now(), auth.uid())
  on conflict (user_id) do update set
    debit_order_status = excluded.debit_order_status,
    debit_order_signed_on = excluded.debit_order_signed_on,
    trial_ends_on = excluded.trial_ends_on,
    notes = excluded.notes,
    updated_at = now(), updated_by = auth.uid();

  insert into app_admin_log (actor_id, actor_email, action, target_id, target_email, details)
  values (auth.uid(), who, 'billing_updated', p_user, target,
    'Debit order: ' || p_status || coalesce(' (' || signed::text || ')', '') || coalesce(' · free month ends ' || p_trial_ends::text, ''));
end $$;
revoke execute on function public.admin_set_billing(uuid, text, date, date, text) from anon, public;
grant execute on function public.admin_set_billing(uuid, text, date, date, text) to authenticated;

-- Belt and braces on top of row-level security: nobody can touch the table
-- directly except to read it as an owner.
revoke all on public.account_billing from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.account_billing from authenticated;
grant select on public.account_billing to authenticated;
