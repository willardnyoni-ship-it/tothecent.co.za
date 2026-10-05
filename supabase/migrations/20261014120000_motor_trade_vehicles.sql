-- Motor trade: each vehicle a dealership buys, what is spent on it, and what it sells for.
-- Costs are ordinary expenses tagged to the vehicle (expenses.vehicle_id), so they
-- still flow into Expenses, VAT and reports. Same access rules as the other tool tables.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  make text not null,
  model text,
  year int check (year is null or year between 1950 and 2100),
  reg text,
  vin text,
  colour text,
  mileage_km int check (mileage_km is null or mileage_km >= 0),
  purchase_price numeric not null default 0 check (purchase_price >= 0),
  purchase_date date,
  bought_from text,
  asking_price numeric check (asking_price is null or asking_price >= 0),
  status text not null default 'in_stock' check (status in ('in_stock', 'reserved', 'sold')),
  sold_price numeric check (sold_price is null or sold_price >= 0),
  sold_date date,
  sold_to_customer_id uuid references public.customers(id) on delete set null,
  sale_invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vehicles_business_id_idx on public.vehicles (business_id);

alter table public.vehicles enable row level security;
create policy "members can view" on public.vehicles for select using (is_business_member(business_id));
create policy "write members can insert" on public.vehicles for insert with check (is_business_write_member(business_id));
create policy "write members can update" on public.vehicles for update using (is_business_write_member(business_id)) with check (is_business_write_member(business_id));
create policy "write members can delete" on public.vehicles for delete using (is_business_write_member(business_id));

-- A cost on a vehicle is an expense pointing at it. Deleting the vehicle keeps the expense.
alter table public.expenses add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists expenses_vehicle_id_idx on public.expenses (vehicle_id) where vehicle_id is not null;
