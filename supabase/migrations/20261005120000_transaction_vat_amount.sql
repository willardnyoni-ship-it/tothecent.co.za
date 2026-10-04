-- VAT on a bank transaction, chosen when it is reviewed.
-- null = not decided yet, 0 = no VAT, > 0 = the VAT included in the amount.
alter table public.business_transactions
  add column if not exists vat_amount numeric(12,2) check (vat_amount is null or vat_amount >= 0);
