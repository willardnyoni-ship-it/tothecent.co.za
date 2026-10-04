-- Owner account actions (send sign-in link, suspend, re-enable, delete),
-- performed by the account Edge Function with the service role. This adds
-- a log of every such action, and the extra fields the People page needs
-- to know which actions apply to someone.

create table if not exists public.app_admin_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_id uuid,
  target_email text,
  details text,
  created_at timestamptz not null default now()
);
alter table public.app_admin_log enable row level security;
-- Owners can read the log; only the Edge Function (service role) writes it.
create policy "admins read log" on public.app_admin_log for select using (is_app_admin());
create index if not exists app_admin_log_target_idx on public.app_admin_log (target_id);

-- admin_users gains: suspended-until, whether they're an app owner, and
-- whether they own a business (deleting a business owner would cascade
-- into deleting their whole business, so the portal blocks that).
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
  segment text, business_name text, business_profile text, business_role text,
  personal_last_sync timestamptz, last_active date, active_days_30 bigint, devices text,
  banned_until timestamptz, is_admin boolean, owns_business boolean
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
    exists (select 1 from businesses ob where ob.owner_id = u.id)
  from auth.users u
  left join lateral (select bm.business_id, bm.role from business_members bm where bm.user_id = u.id and bm.status = 'active' order by bm.joined_at limit 1) m on true
  left join businesses b on b.id = m.business_id
  order by u.last_sign_in_at desc nulls last;
end $$;
revoke execute on function public.admin_users() from anon, public;
grant execute on function public.admin_users() to authenticated;
