-- Stock categories, and where each purchase came from.
alter table public.stock_items add column if not exists category text;
alter table public.stock_movements add column if not exists supplier text;
alter table public.stock_movements add column if not exists reference text;
create index if not exists stock_items_category_idx on public.stock_items (business_id, category);
