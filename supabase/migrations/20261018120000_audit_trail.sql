-- Audit trail: who added, changed or deleted what, and when, for the records an accountant relies on.
-- Written by database triggers, so it holds no matter which screen or tool made the change, and
-- nobody can edit or delete entries through the app. Only owners, admins and accountants can read
-- a business's trail (the same people who can see payroll).

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  changed_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id uuid,
  label text,
  -- update: { column: [old, new] }; insert / delete: the row's own fields
  changes jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_business_time_idx on public.audit_log (business_id, changed_at desc);
create index if not exists audit_log_business_table_idx on public.audit_log (business_id, table_name, changed_at desc);

alter table public.audit_log enable row level security;
create policy "owners admins and accountants can read" on public.audit_log for select using (is_business_payroll_viewer(business_id));
revoke all on public.audit_log from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  j_new jsonb; j_old jsonb; j jsonb; biz uuid; rid uuid; who uuid := auth.uid(); mail text; lbl text;
  diff jsonb := '{}'::jsonb; k text;
  -- columns that change by themselves and say nothing about the books
  skip text[] := array['updated_at', 'created_at', 'share_token', 'last_reminded_at', 'created_by', 'next_invoice_number', 'next_quote_number', 'generated_count', 'next_run_date'];
begin
  if tg_op <> 'INSERT' then j_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then j_new := to_jsonb(new); end if;
  j := coalesce(j_new, j_old);
  biz := case when tg_table_name = 'businesses' then (j ->> 'id')::uuid else (j ->> 'business_id')::uuid end;
  if biz is null then return coalesce(new, old); end if;
  -- bank lines brought in by a statement import, Yoco, a cash-up or a booking are many and automatic:
  -- changes to them are logged, their arrival is not
  if tg_table_name = 'business_transactions' and tg_op = 'INSERT' and coalesce(j ->> 'source', '') <> 'manual' then return new; end if;
  rid := nullif(j ->> 'id', '')::uuid;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(j_new) loop
      if k = any (skip) then continue; end if;
      if j_new -> k is distinct from j_old -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_array(j_old -> k, j_new -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
  else
    diff := j - skip - 'id' - 'business_id';
  end if;

  lbl := coalesce(nullif(j ->> 'invoice_number', ''), nullif(j ->> 'quote_number', ''), nullif(j ->> 'name', ''), nullif(j ->> 'description', ''),
                  nullif(j ->> 'merchant', ''), nullif(concat_ws(' ', j ->> 'year', j ->> 'make', j ->> 'model'), ''), nullif(j ->> 'email', ''));
  select u.email::text into mail from auth.users u where u.id = who;
  insert into audit_log (business_id, actor_id, actor_email, action, table_name, record_id, label, changes)
  values (biz, who, case when who is null then 'System' else mail end, lower(tg_op), tg_table_name, rid, left(lbl, 120), diff);
  return coalesce(new, old);
exception when others then
  -- the trail must never stop someone doing their work
  raise warning 'audit_row failed on %: %', tg_table_name, sqlerrm;
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_row() from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'quotes', 'customers', 'business_transactions', 'expenses', 'business_members', 'businesses',
                           'vehicles', 'employees', 'pay_runs', 'recurring_invoices', 'jobs', 'bank_accounts'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%I on public.%I', t, t);
      execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
    end if;
  end loop;
end $$;
