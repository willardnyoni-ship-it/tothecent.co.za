-- One row per business the signed-in person belongs to (owner, accountant, staff), with the
-- numbers an accountant scans across clients: what is owed, what is overdue, what still needs
-- review, and what has no receipt. Rand values use each invoice's exchange rate.
create or replace function public.my_clients_overview()
returns table (business_id uuid, name text, profile text, role text, outstanding numeric, overdue_count int, review_count int, no_receipt_count int, last_activity timestamptz)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
begin
  return query
  select b.id, b.name, b.business_profile,
    coalesce((select m.role from business_members m where m.business_id = b.id and m.user_id = auth.uid() and m.status = 'active' limit 1),
             case when b.owner_id = auth.uid() then 'owner' end),
    coalesce((select sum((i.total - coalesce(i.paid_amount, 0)) * i.exchange_rate) from invoices i
              where i.business_id = b.id and i.status not in ('paid', 'cancelled', 'draft')), 0),
    (select count(*)::int from invoices i where i.business_id = b.id and i.status not in ('paid', 'cancelled', 'draft') and i.due_date < current_date),
    (select count(*)::int from business_transactions t where t.business_id = b.id and t.status = 'needs_review')
      + (select count(*)::int from expenses e where e.business_id = b.id and e.status in ('needs_review', 'pending_approval')),
    (select count(*)::int from expenses e where e.business_id = b.id and e.status <> 'rejected' and e.receipt_storage_path is null),
    greatest((select max(i.created_at) from invoices i where i.business_id = b.id),
             (select max(t.created_at) from business_transactions t where t.business_id = b.id),
             (select max(e.created_at) from expenses e where e.business_id = b.id))
  from businesses b
  where b.owner_id = auth.uid()
     or exists (select 1 from business_members m where m.business_id = b.id and m.user_id = auth.uid() and m.status = 'active')
  order by b.name;
end $$;
revoke execute on function public.my_clients_overview() from anon, public;
grant execute on function public.my_clients_overview() to authenticated;
