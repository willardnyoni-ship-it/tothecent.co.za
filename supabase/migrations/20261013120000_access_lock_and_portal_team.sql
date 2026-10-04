-- 1. Locking the app when the free month is over and nobody is paying.
-- 2. Portal team: app owners can add their own staff to the owner portal.

-- ---- portal team ----
alter table public.app_admins
  add column if not exists role text not null default 'owner' check (role in ('owner', 'team')),
  add column if not exists added_by uuid references auth.users(id) on delete set null;

-- Only an "owner" can manage the team. Team members get the portal but not this.
create or replace function public.is_app_owner()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select exists (select 1 from app_admins where user_id = auth.uid() and role = 'owner'); $$;
revoke execute on function public.is_app_owner() from anon, public;
grant execute on function public.is_app_owner() to authenticated;

create or replace function public.admin_team()
returns table (user_id uuid, email text, role text, added_at timestamptz, added_by_email text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path to 'public', 'auth', 'pg_temp'
as $$
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select a.user_id, u.email::text, a.role, a.added_at, ab.email::text, u.last_sign_in_at
  from app_admins a join auth.users u on u.id = a.user_id left join auth.users ab on ab.id = a.added_by
  order by (a.role = 'owner') desc, a.added_at;
end $$;
revoke execute on function public.admin_team() from anon, public;
grant execute on function public.admin_team() to authenticated;

-- Adds someone who already has an account (or changes their role).
create or replace function public.admin_add_team_member(p_email text, p_role text default 'team')
returns void language plpgsql security definer set search_path to 'public', 'auth', 'pg_temp'
as $$
declare target uuid; who text; cur text; owners int;
begin
  if not is_app_owner() then raise exception 'Only an owner can change the team.' using errcode = '42501'; end if;
  if p_role not in ('owner', 'team') then raise exception 'unknown role'; end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email));
  if target is null then raise exception 'There is no account for that email yet. Create their account first, then add them.'; end if;
  select role into cur from app_admins where user_id = target;
  if cur = 'owner' and p_role = 'team' then
    select count(*) into owners from app_admins where role = 'owner';
    if owners <= 1 then raise exception 'There must always be at least one owner.'; end if;
  end if;
  insert into app_admins (user_id, role, added_by) values (target, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
  select email::text into who from auth.users where id = auth.uid();
  insert into app_admin_log (actor_id, actor_email, action, target_id, target_email, details)
  values (auth.uid(), who, 'team_added', target, lower(trim(p_email)), 'Portal access: ' || p_role);
end $$;
revoke execute on function public.admin_add_team_member(text, text) from anon, public;
grant execute on function public.admin_add_team_member(text, text) to authenticated;

create or replace function public.admin_remove_team_member(p_user uuid)
returns void language plpgsql security definer set search_path to 'public', 'auth', 'pg_temp'
as $$
declare cur text; owners int; who text; target text;
begin
  if not is_app_owner() then raise exception 'Only an owner can change the team.' using errcode = '42501'; end if;
  select role into cur from app_admins where user_id = p_user;
  if cur is null then return; end if;
  if cur = 'owner' then
    select count(*) into owners from app_admins where role = 'owner';
    if owners <= 1 then raise exception 'There must always be at least one owner.'; end if;
  end if;
  delete from app_admins where user_id = p_user;
  select email::text into who from auth.users where id = auth.uid();
  select email::text into target from auth.users where id = p_user;
  insert into app_admin_log (actor_id, actor_email, action, target_id, target_email, details)
  values (auth.uid(), who, 'team_removed', p_user, target, 'Portal access removed');
end $$;
revoke execute on function public.admin_remove_team_member(uuid) from anon, public;
grant execute on function public.admin_remove_team_member(uuid) to authenticated;

-- ---- the lock ----
-- 'access' is 'ok' or 'locked'. Open while: the person is on the team, is
-- subscribed (or marked Subscribed by an owner), is inside the free month,
-- has cancelled but is paid up to the next payment date, or works in a
-- business whose owner has access (staff are covered by the owner's plan).
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth', 'pg_temp'
as $$
declare u auth.users; ab account_billing; owns boolean; trial date; today date; ok boolean;
begin
  select * into u from auth.users where id = auth.uid();
  if u.id is null then return null; end if;
  select * into ab from account_billing where user_id = u.id;
  select exists (select 1 from businesses b where b.owner_id = u.id) into owns;
  today := (now() at time zone 'Africa/Johannesburg')::date;
  trial := coalesce(ab.trial_ends_on, (u.created_at + interval '1 month')::date);
  ok := exists (select 1 from app_admins where user_id = u.id)
    or ab.debit_order_status = 'signed'
    or trial > today
    or (ab.debit_order_status = 'cancelled' and ab.next_payment_on is not null and ab.next_payment_on > today)
    or exists (
      select 1 from business_members bm
        join businesses b on b.id = bm.business_id and b.owner_id <> u.id
        join auth.users ou on ou.id = b.owner_id
        left join account_billing ob on ob.user_id = b.owner_id
      where bm.user_id = u.id and bm.status = 'active'
        and (ob.debit_order_status = 'signed' or coalesce(ob.trial_ends_on, (ou.created_at + interval '1 month')::date) > today
             or (ob.debit_order_status = 'cancelled' and ob.next_payment_on > today)));
  return jsonb_build_object(
    'access', case when ok then 'ok' else 'locked' end,
    'trial_ends_on', trial,
    'status', case when ab.debit_order_status = 'signed' then 'active' when ab.debit_order_status = 'cancelled' then 'cancelled' else 'none' end,
    'plan', ab.plan,
    'suggested_plan', case when owns then 'business' else 'personal' end,
    'card_brand', ab.card_brand, 'card_last4', ab.card_last4,
    'next_payment_on', ab.next_payment_on, 'pay_issue', ab.pay_issue,
    'has_subscription', ab.paystack_sub_code is not null
  );
end $$;
revoke execute on function public.my_billing() from anon, public;
grant execute on function public.my_billing() to authenticated;
