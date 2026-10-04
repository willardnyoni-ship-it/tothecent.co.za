-- Sign-up alerts: the landing page's sign-up form reports every attempt
-- (succeeded or failed, and why) so the owner portal can alert on people
-- who tried to create an account and couldn't.
--
-- Nobody can read or write the table through the API except app owners
-- (read, and mark as seen). The form writes only through
-- log_signup_attempt(), which validates and caps everything it accepts so
-- the public endpoint can't be used to flood or abuse the table.

create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text,
  outcome text not null check (outcome in ('failed', 'succeeded')),
  stage text check (stage in ('form', 'server', 'network')),
  reason text,
  message text,
  device text,
  segment text,
  seen_at timestamptz
);
alter table public.signup_attempts enable row level security;
create policy "owners read attempts" on public.signup_attempts for select using (is_app_admin());
create policy "owners mark attempts seen" on public.signup_attempts for update using (is_app_admin()) with check (is_app_admin());
create index if not exists signup_attempts_created_idx on public.signup_attempts (created_at desc);
create index if not exists signup_attempts_email_idx on public.signup_attempts (email);

create or replace function public.log_signup_attempt(
  p_email text, p_outcome text, p_stage text, p_reason text, p_message text, p_device text, p_segment text
) returns void
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare e text := nullif(lower(trim(left(coalesce(p_email, ''), 200))), '');
begin
  if p_outcome not in ('failed', 'succeeded') then return; end if;
  -- Throttle: at most 20 reports per email and 300 overall per hour.
  if e is not null and (select count(*) from signup_attempts where email = e and created_at > now() - interval '1 hour') >= 20 then return; end if;
  if (select count(*) from signup_attempts where created_at > now() - interval '1 hour') >= 300 then return; end if;
  insert into signup_attempts (email, outcome, stage, reason, message, device, segment)
  values (
    e, p_outcome,
    case when p_stage in ('form', 'server', 'network') then p_stage end,
    left(p_reason, 40), left(p_message, 300), left(p_device, 60),
    case when p_segment in ('business', 'personal') then p_segment end
  );
end $$;
revoke execute on function public.log_signup_attempt(text, text, text, text, text, text, text) from public;
grant execute on function public.log_signup_attempt(text, text, text, text, text, text, text) to anon, authenticated;
