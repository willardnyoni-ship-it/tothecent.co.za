-- Month-end sign-off: an owner, admin or accountant marks a month as reviewed for a business.
-- One row per business per month; re-opening deletes it. Changes are recorded in the audit trail.
create table if not exists public.month_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_email text,
  reviewed_at timestamptz not null default now(),
  note text,
  unique (business_id, month)
);
create index if not exists month_reviews_business_idx on public.month_reviews (business_id, month desc);
alter table public.month_reviews enable row level security;
create policy "reviewers can read" on public.month_reviews for select using (is_business_payroll_viewer(business_id));
create policy "reviewers can sign off" on public.month_reviews for insert with check (is_business_payroll_viewer(business_id) and reviewed_by = auth.uid());
create policy "reviewers can reopen" on public.month_reviews for delete using (is_business_payroll_viewer(business_id));
revoke all on public.month_reviews from anon, public;
revoke update, truncate, references, trigger on public.month_reviews from authenticated;
grant select, insert, delete on public.month_reviews to authenticated;

drop trigger if exists audit_month_reviews on public.month_reviews;
create trigger audit_month_reviews after insert or update or delete on public.month_reviews for each row execute function public.audit_row();
