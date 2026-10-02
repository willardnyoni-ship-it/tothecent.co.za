-- Owner portal: per-business insight and a database explorer. Same rules as
-- the app_owner_console functions - SECURITY DEFINER, refuse anyone not in
-- app_admins, and report structure and counts rather than row contents.

create or replace function public.admin_businesses()
returns table (
  id uuid, name text, business_type text, business_profile text, features jsonb, created_at timestamptz,
  owner_email text, members bigint, customers bigint, invoices bigint, invoiced_value numeric,
  outstanding numeric, transactions bigint, quotes bigint, bookings bigint, stock_items bigint,
  employees bigint, last_activity timestamptz
)
language plpgsql stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select b.id, b.name, b.business_type, b.business_profile, b.features, b.created_at,
    (select u.email::text from auth.users u where u.id = b.owner_id),
    (select count(*) from business_members m where m.business_id = b.id and m.status = 'active'),
    (select count(*) from customers c where c.business_id = b.id),
    (select count(*) from invoices i where i.business_id = b.id),
    (select coalesce(sum(i.total), 0) from invoices i where i.business_id = b.id and i.status not in ('draft','cancelled')),
    (select coalesce(sum(i.total - i.paid_amount), 0) from invoices i where i.business_id = b.id and i.status not in ('draft','cancelled','paid')),
    (select count(*) from business_transactions t where t.business_id = b.id),
    (select count(*) from quotes q where q.business_id = b.id),
    (select count(*) from bookings k where k.business_id = b.id),
    (select count(*) from stock_items s where s.business_id = b.id and not s.archived),
    (select count(*) from employees e where e.business_id = b.id and e.active),
    greatest(
      (select max(t.created_at) from business_transactions t where t.business_id = b.id),
      (select max(i.created_at) from invoices i where i.business_id = b.id),
      (select max(e.created_at) from expenses e where e.business_id = b.id),
      b.created_at)
  from businesses b
  order by b.created_at desc;
end $$;

-- Everything about the database's shape: each table's exact row count,
-- size, rows added this week, security (RLS + policies), columns and
-- links to other tables; storage buckets; applied migrations.
create or replace function public.admin_database()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'auth', 'storage', 'pg_temp'
as $$
declare
  t record; n bigint; recent bigint; tables jsonb := '[]'::jsonb; has_created boolean;
begin
  if not is_app_admin() then raise exception 'not allowed' using errcode = '42501'; end if;

  for t in
    select c.oid, n2.nspname as schema, c.relname as name, c.relrowsecurity as rls,
      pg_total_relation_size(c.oid) as bytes, obj_description(c.oid) as comment
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
    where c.relkind = 'r' and n2.nspname = 'public'
    order by c.relname
  loop
    execute format('select count(*) from %I.%I', t.schema, t.name) into n;
    select exists (select 1 from information_schema.columns where table_schema = t.schema and table_name = t.name and column_name = 'created_at') into has_created;
    recent := null;
    if has_created then
      execute format('select count(*) from %I.%I where created_at > now() - interval ''7 days''', t.schema, t.name) into recent;
    end if;
    tables := tables || jsonb_build_object(
      'schema', t.schema, 'name', t.name, 'rows', n, 'added_7d', recent, 'bytes', t.bytes,
      'rls', t.rls, 'comment', t.comment,
      'columns', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', col.column_name, 'type', col.data_type, 'nullable', col.is_nullable = 'YES',
          'default', col.column_default,
          'references', (select ccu.table_name || '.' || ccu.column_name
             from information_schema.key_column_usage kcu
             join information_schema.table_constraints tc on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema and tc.constraint_type = 'FOREIGN KEY'
             join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
             where kcu.table_schema = t.schema and kcu.table_name = t.name and kcu.column_name = col.column_name limit 1)
        ) order by col.ordinal_position), '[]'::jsonb)
        from information_schema.columns col where col.table_schema = t.schema and col.table_name = t.name),
      'policies', (select coalesce(jsonb_agg(jsonb_build_object('name', p.policyname, 'command', p.cmd, 'using', p.qual, 'check', p.with_check) order by p.cmd, p.policyname), '[]'::jsonb)
        from pg_policies p where p.schemaname = t.schema and p.tablename = t.name)
    );
  end loop;

  return jsonb_build_object(
    'tables', tables,
    'database_bytes', pg_database_size(current_database()),
    'auth_users', (select count(*) from auth.users),
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', b.name, 'public', b.public,
        'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
        'bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id)
      ) order by b.name), '[]'::jsonb) from storage.buckets b),
    'migrations', (select coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name) order by m.version desc), '[]'::jsonb)
      from supabase_migrations.schema_migrations m)
  );
end $$;

revoke execute on function public.admin_businesses() from anon, public;
revoke execute on function public.admin_database() from anon, public;
grant execute on function public.admin_businesses() to authenticated;
grant execute on function public.admin_database() to authenticated;
