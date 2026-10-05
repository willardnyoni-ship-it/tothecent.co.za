-- Freelancers: a saved hourly rate per customer, and the inputs for the
-- provisional-tax estimate (expected profit for the year, tax already paid).
alter table public.customers add column if not exists hourly_rate numeric check (hourly_rate is null or hourly_rate >= 0);
alter table public.businesses add column if not exists tax_expected_profit numeric check (tax_expected_profit is null or tax_expected_profit >= 0);
alter table public.businesses add column if not exists provisional_paid numeric check (provisional_paid is null or provisional_paid >= 0);
