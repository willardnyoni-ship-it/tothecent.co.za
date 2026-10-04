-- Yoco order lines -> stock. Yoco tells us what was sold; once a Yoco item name is
-- matched to a stock item or a dish, each sale takes stock off automatically.
-- (Applied to the live project via the Supabase MCP; this is the same SQL.)

create table if not exists public.yoco_order_lines (
  business_id uuid not null references public.businesses(id) on delete cascade,
  line_id text not null,
  order_id text not null,
  name text not null,
  name_key text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  revenue numeric not null default 0,
  sold_at timestamptz not null default now(),
  historic boolean not null default false,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  ignored boolean not null default false,
  applied_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (business_id, line_id)
);
create index if not exists yoco_order_lines_pending_idx on public.yoco_order_lines (business_id, name_key) where applied_at is null;
create index if not exists yoco_order_lines_order_idx on public.yoco_order_lines (business_id, order_id);

create table if not exists public.yoco_item_map (
  business_id uuid not null references public.businesses(id) on delete cascade,
  name_key text not null,
  display_name text,
  stock_item_id uuid references public.stock_items(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (business_id, name_key),
  check ((ignored and stock_item_id is null and recipe_id is null) or (not ignored and ((stock_item_id is null) <> (recipe_id is null))))
);

alter table public.yoco_order_lines enable row level security;
alter table public.yoco_item_map enable row level security;
create policy "members can view" on public.yoco_order_lines for select using (is_business_member(business_id));
create policy "members can view" on public.yoco_item_map for select using (is_business_member(business_id));
revoke all on public.yoco_order_lines, public.yoco_item_map from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.yoco_order_lines, public.yoco_item_map from authenticated;
grant select on public.yoco_order_lines, public.yoco_item_map to authenticated;

create or replace function public.yoco_apply_sale(
  p_business uuid, p_item uuid, p_qty numeric, p_revenue numeric, p_note text, p_date date, p_ref text
) returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare c numeric;
begin
  update stock_items set qty_on_hand = qty_on_hand - p_qty
    where id = p_item and business_id = p_business returning cost_price into c;
  if not found then return; end if;
  insert into stock_movements (business_id, item_id, date, qty_change, reason, unit_price, unit_cost, note, reference)
  values (p_business, p_item, p_date, -p_qty, case when p_qty >= 0 then 'sale' else 'adjust' end,
    case when p_qty <> 0 then round(abs(p_revenue / p_qty), 2) else 0 end, c, p_note, p_ref);
end $$;
revoke execute on function public.yoco_apply_sale(uuid, uuid, numeric, numeric, text, date, text) from anon, authenticated, public;
grant execute on function public.yoco_apply_sale(uuid, uuid, numeric, numeric, text, date, text) to service_role;

drop function if exists public.yoco_status(uuid);
create function public.yoco_status(p_business uuid)
returns table (
  connected boolean, status text, last_error text, connected_at timestamptz,
  last_event_at timestamptz, today_count bigint, today_total numeric,
  last_sale_at timestamptz, last_sale_amount numeric, unmatched_items bigint
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not is_business_member(p_business) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select (c.business_id is not null), c.status, c.last_error, c.created_at, c.last_event_at,
    (select count(*) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' and t.date = today),
    (select coalesce(sum(t.amount), 0) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' and t.date = today),
    (select max(t.created_at) from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income'),
    (select t.amount from business_transactions t where t.business_id = p_business and t.source = 'yoco' and t.kind = 'income' order by t.created_at desc limit 1),
    (select count(distinct l.name_key) from yoco_order_lines l where l.business_id = p_business and l.applied_at is null
       and not exists (select 1 from yoco_item_map m where m.business_id = p_business and m.name_key = l.name_key))
  from (select 1) x left join yoco_connections c on c.business_id = p_business;
end $$;
revoke execute on function public.yoco_status(uuid) from anon, public;
grant execute on function public.yoco_status(uuid) to authenticated;
