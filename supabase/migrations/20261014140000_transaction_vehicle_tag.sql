-- A bank transaction can be tagged to a vehicle, so a payment to a garage or
-- panel beater counts toward that car's costs.
alter table public.business_transactions add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists business_transactions_vehicle_id_idx on public.business_transactions (vehicle_id) where vehicle_id is not null;
