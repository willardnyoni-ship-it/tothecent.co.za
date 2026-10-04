-- Paying by subscription (Paystack). The customer adds a card, Paystack bills
-- it every month, and Paystack tells the 'paystack' Edge Function what
-- happened. Everything is stored on the existing account_billing row, so the
-- owner portal's People page keeps working: a paying customer shows as
-- "Subscribed" (debit_order_status = 'signed' is the existing column for that).

alter table public.account_billing
  add column if not exists plan text check (plan in ('personal', 'business')),
  add column if not exists paystack_customer text,
  add column if not exists paystack_sub_code text,
  add column if not exists paystack_email_token text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists next_payment_on date,
  add column if not exists pay_issue text;

-- The plan codes Paystack gave us (created by the function the first time).
create table if not exists public.paystack_plans (
  plan text primary key check (plan in ('personal', 'business')),
  plan_code text not null,
  amount_cents int not null,
  created_at timestamptz not null default now()
);
-- Webhook events already handled, so a repeat is ignored.
create table if not exists public.paystack_events (
  ref text primary key,
  created_at timestamptz not null default now()
);
alter table public.paystack_plans enable row level security;
alter table public.paystack_events enable row level security;
revoke all on public.paystack_plans, public.paystack_events from anon, authenticated, public;

-- Finds the account for an email address (the webhook for a monthly renewal
-- carries the customer's email, not our user id).
create or replace function public.billing_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path to 'public', 'auth', 'pg_temp'
as $$ select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke execute on function public.billing_user_by_email(text) from anon, authenticated, public;
grant execute on function public.billing_user_by_email(text) to service_role;

-- What the signed-in person sees about their own plan.
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'auth', 'pg_temp'
as $$
declare u auth.users; ab account_billing; owns boolean;
begin
  select * into u from auth.users where id = auth.uid();
  if u.id is null then return null; end if;
  select * into ab from account_billing where user_id = u.id;
  select exists (select 1 from businesses b where b.owner_id = u.id) into owns;
  return jsonb_build_object(
    'trial_ends_on', coalesce(ab.trial_ends_on, (u.created_at + interval '1 month')::date),
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
