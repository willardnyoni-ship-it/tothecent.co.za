-- Foreign-currency invoices and quotes. Every amount on the document (lines, subtotal,
-- VAT, discount, total, paid_amount) is in `currency`; `exchange_rate` is how many
-- rand one unit of that currency was worth when the document was made (1 for ZAR),
-- so rand totals are amount x exchange_rate. A customer can have a usual currency.
alter table public.invoices add column if not exists currency text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$');
alter table public.invoices add column if not exists exchange_rate numeric not null default 1 check (exchange_rate > 0);
alter table public.quotes add column if not exists currency text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$');
alter table public.quotes add column if not exists exchange_rate numeric not null default 1 check (exchange_rate > 0);
alter table public.customers add column if not exists currency text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$');
