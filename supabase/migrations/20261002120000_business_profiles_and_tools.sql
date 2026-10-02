-- Tailored business tools: a business profile (what kind of business this
-- is) picks which extra tools are switched on, and each tool gets its own
-- table. Everything here is additive - no existing column, row or policy
-- is changed apart from widening business_transactions.source so cash-ups,
-- bookings and payroll can record where a transaction came from.

-- ---------- business profile + feature switches ----------
alter table public.businesses
  add column if not exists business_profile text,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists quote_prefix text not null default 'QUO-',
  add column if not exists next_quote_number integer not null default 1,
  add column if not exists mileage_rate numeric not null default 4.76,
  add column if not exists tax_set_aside_pct numeric not null default 25;

alter table public.business_transactions drop constraint if exists business_transactions_source_check;
alter table public.business_transactions add constraint business_transactions_source_check
  check (source = any (array['statement','manual','receipt','cashup','booking','payroll','stock']));

-- ---------- jobs / projects ----------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  name text not null,
  address text,
  status text not null default 'active' check (status in ('quoted','active','done','cancelled')),
  start_date date,
  end_date date,
  budget numeric not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists last_reminded_at timestamptz;
alter table public.expenses
  add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.business_transactions
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

-- ---------- quotes ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quote_number text not null,
  issue_date date not null default current_date,
  valid_until date,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','invoiced','expired')),
  items jsonb not null default '[]'::jsonb,
  vat_enabled boolean not null default true,
  subtotal numeric not null default 0,
  vat numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  deposit_pct numeric not null default 0,
  deposit_invoice_id uuid references public.invoices(id) on delete set null,
  final_invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  payment_terms text,
  banking_details text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.invoices
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

-- ---------- time tracking ----------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  date date not null default current_date,
  hours numeric not null check (hours > 0),
  rate numeric not null default 0,
  description text,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- mileage log ----------
create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  date date not null default current_date,
  km numeric not null check (km > 0),
  from_place text,
  to_place text,
  purpose text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- stock ----------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'each',
  qty_on_hand numeric not null default 0,
  reorder_level numeric not null default 0,
  cost_price numeric not null default 0,
  sell_price numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.stock_items(id) on delete cascade,
  date date not null default current_date,
  qty_change numeric not null,
  reason text not null check (reason in ('purchase','sale','waste','adjust')),
  unit_price numeric not null default 0,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- daily cash-up ----------
create table if not exists public.cash_ups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  date date not null default current_date,
  cash_sales numeric not null default 0,
  card_sales numeric not null default 0,
  other_sales numeric not null default 0,
  tips numeric not null default 0,
  opening_float numeric not null default 0,
  counted_cash numeric not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  client_name text,
  client_phone text,
  date date not null,
  start_time text not null,
  duration_min integer not null default 60,
  service text,
  staff_name text,
  price numeric not null default 0,
  deposit numeric not null default 0,
  status text not null default 'booked' check (status in ('booked','done','no_show','cancelled')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- staff & payroll (salaries are sensitive: owner/admin/accountant only) ----------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  job_title text,
  pay_type text not null default 'monthly' check (pay_type in ('monthly','hourly')),
  pay_rate numeric not null default 0,
  start_date date,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period text not null,
  hours numeric,
  gross numeric not null default 0,
  paye numeric not null default 0,
  uif_employee numeric not null default 0,
  uif_employer numeric not null default 0,
  other_deductions numeric not null default 0,
  net numeric not null default 0,
  paid_on date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (employee_id, period)
);

create or replace function public.is_business_payroll_viewer(biz uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from business_members
    where business_id = biz and user_id = auth.uid() and status = 'active' and role in ('owner','admin','accountant')
  );
$$;
revoke execute on function public.is_business_payroll_viewer(uuid) from anon, public;
grant execute on function public.is_business_payroll_viewer(uuid) to authenticated;

-- ---------- row level security ----------
-- Same pattern as invoices/recurring_invoices: any active member can view,
-- members other than accountants can write.
do $$
declare t text;
begin
  foreach t in array array['jobs','quotes','time_entries','mileage_trips','stock_items','stock_movements','cash_ups','bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (business_id)', t || '_business_id_idx', t);
    execute format('create policy "members can view" on public.%I for select using (is_business_member(business_id))', t);
    execute format('create policy "write members can insert" on public.%I for insert with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can update" on public.%I for update using (is_business_write_member(business_id)) with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can delete" on public.%I for delete using (is_business_write_member(business_id))', t);
  end loop;

  foreach t in array array['employees','pay_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (business_id)', t || '_business_id_idx', t);
    execute format('create policy "payroll viewers can view" on public.%I for select using (is_business_payroll_viewer(business_id))', t);
    execute format('create policy "admins can insert" on public.%I for insert with check (is_business_admin(business_id))', t);
    execute format('create policy "admins can update" on public.%I for update using (is_business_admin(business_id)) with check (is_business_admin(business_id))', t);
    execute format('create policy "admins can delete" on public.%I for delete using (is_business_admin(business_id))', t);
  end loop;
end $$;
