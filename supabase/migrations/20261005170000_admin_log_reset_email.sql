-- Records that an owner sent someone a password-reset email from the portal.
-- Only this one action is allowed so the log can't be filled with made-up entries.
create or replace function public.admin_log_action(p_target uuid, p_action text, p_details text default null)
returns void
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare who text; target text;
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_action <> 'reset_email_sent' then raise exception 'unknown action'; end if;
  select email::text into target from auth.users where id = p_target;
  if target is null then raise exception 'no such account'; end if;
  select email::text into who from auth.users where id = auth.uid();
  insert into app_admin_log (actor_id, actor_email, action, target_id, target_email, details)
  values (auth.uid(), who, p_action, p_target, target, left(p_details, 300));
end $$;
revoke execute on function public.admin_log_action(uuid, text, text) from anon, public;
grant execute on function public.admin_log_action(uuid, text, text) to authenticated;
