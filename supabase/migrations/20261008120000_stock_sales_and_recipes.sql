-- Sales that take stock off, and recipes for costing dishes / services.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  category text,
  yield_portions numeric not null default 1 check (yield_portions > 0),
  selling_price numeric not null default 0 check (selling_price >= 0),
  extra_cost numeric not null default 0 check (extra_cost >= 0),
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_id uuid not null references public.stock_items(id) on delete cascade,
  qty numeric not null check (qty > 0),
  note text,
  sort_order integer not null default 0
);

-- Which stock item or recipe an invoice line sold, and where each stock
-- movement came from (an invoice, a recipe) with the cost at the time.
alter table public.invoice_items
  add column if not exists stock_item_id uuid references public.stock_items(id) on delete set null,
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null;
alter table public.stock_movements
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null,
  add column if not exists unit_cost numeric;
create index if not exists stock_movements_invoice_idx on public.stock_movements (invoice_id);
create index if not exists recipe_lines_recipe_idx on public.recipe_lines (recipe_id);

-- Same access as the other tool tables: members view, non-accountants write.
do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (business_id)', t || '_business_id_idx', t);
    execute format('create policy "members can view" on public.%I for select using (is_business_member(business_id))', t);
    execute format('create policy "write members can insert" on public.%I for insert with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can update" on public.%I for update using (is_business_write_member(business_id)) with check (is_business_write_member(business_id))', t);
    execute format('create policy "write members can delete" on public.%I for delete using (is_business_write_member(business_id))', t);
  end loop;
end $$;
