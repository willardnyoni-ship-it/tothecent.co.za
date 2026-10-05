-- Signed-off months are locked. Once a month has a row in month_reviews, nobody can add, change or
-- delete the books dated in it (bank transactions, expenses, invoices, payslips) until it is re-opened.
-- A few harmless changes stay possible so the books can still be tidied: linking a bank line to an
-- invoice or job, attaching or matching a receipt, recording a payment against an old invoice.
-- Server-side jobs (webhooks, schedules) run with no signed-in person and are not blocked; their
-- changes are recorded in the audit trail as "System".

-- Only a month that has ended can be signed off.
create or replace function public.month_review_guard()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.month >= date_trunc('month', (now() at time zone 'Africa/Johannesburg'))::date then
    raise exception 'A month can only be signed off once it has ended.';
  end if;
  return new;
end $$;
drop trigger if exists month_review_guard on public.month_reviews;
create trigger month_review_guard before insert on public.month_reviews for each row execute function public.month_review_guard();

create or replace function public.month_locked(p_biz uuid, p_date date)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select p_date is not null and exists (select 1 from month_reviews r where r.business_id = p_biz and r.month = date_trunc('month', p_date)::date) $$;
revoke execute on function public.month_locked(uuid, date) from anon, authenticated, public;

create or replace function public.lock_guard()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  jo jsonb; jn jsonb; biz uuid; dcol text; d_old date; d_new date; locked date; k text;
  -- changes that stay possible on a locked month's rows
  allowed text[];
  noise text[] := array['updated_at'];
begin
  if auth.uid() is null then return coalesce(new, old); end if;

  if tg_op <> 'INSERT' then jo := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then jn := to_jsonb(new); end if;
  biz := coalesce(jn, jo) ->> 'business_id';
  dcol := case tg_table_name when 'invoices' then 'issue_date' when 'pay_runs' then 'period' else 'date' end;
  if tg_op <> 'INSERT' then d_old := case when dcol = 'period' then ((jo ->> dcol) || '-01')::date else (jo ->> dcol)::date end; end if;
  if tg_op <> 'DELETE' then d_new := case when dcol = 'period' then ((jn ->> dcol) || '-01')::date else (jn ->> dcol)::date end; end if;

  if public.month_locked(biz, d_new) then locked := date_trunc('month', d_new)::date;
  elsif public.month_locked(biz, d_old) then locked := date_trunc('month', d_old)::date;
  else return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    allowed := case tg_table_name
      when 'business_transactions' then array['linked_invoice_id', 'job_id', 'vehicle_id']
      when 'expenses' then array['receipt_storage_path', 'matched_transaction_id', 'vehicle_id', 'job_id']
      when 'invoices' then array['paid_amount', 'last_reminded_at', 'due_date', 'notes', 'payment_terms', 'banking_details', 'job_id', 'recurring_invoice_id', 'quote_id', 'share_token']
      else array[]::text[] end;
    for k in select jsonb_object_keys(jn) loop
      if k = any (noise) or k = any (allowed) then continue; end if;
      if jn -> k is distinct from jo -> k then
        -- an invoice may move between sent, viewed, partially paid and paid, but not be cancelled or taken back to draft
        if tg_table_name = 'invoices' and k = 'status' and (jn ->> k) not in ('cancelled', 'draft') and (jo ->> k) not in ('cancelled', 'draft') then continue; end if;
        raise exception 'MONTH_LOCKED: % is signed off. Re-open it under Month-end to add or change entries dated in it.', to_char(locked, 'FMMonth YYYY');
      end if;
    end loop;
    return new;
  end if;

  raise exception 'MONTH_LOCKED: % is signed off. Re-open it under Month-end to add or change entries dated in it.', to_char(locked, 'FMMonth YYYY');
end $$;
revoke execute on function public.lock_guard() from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array['business_transactions', 'expenses', 'invoices', 'pay_runs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists lock_guard_%I on public.%I', t, t);
      execute format('create trigger lock_guard_%I before insert or update or delete on public.%I for each row execute function public.lock_guard()', t, t);
    end if;
  end loop;
end $$;
