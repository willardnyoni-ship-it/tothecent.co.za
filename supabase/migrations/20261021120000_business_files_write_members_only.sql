-- Receipts and logos in the 'business-files' bucket: every member can read them (so an accountant can
-- see the receipt pictures), but only members who can write business data (not the view-only
-- accountant role) can add, replace or delete files.
drop policy if exists business_files_insert on storage.objects;
drop policy if exists business_files_update on storage.objects;
drop policy if exists business_files_delete on storage.objects;
create policy business_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-files' and is_business_write_member(((storage.foldername(name))[1])::uuid));
create policy business_files_update on storage.objects for update to authenticated
  using (bucket_id = 'business-files' and is_business_write_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'business-files' and is_business_write_member(((storage.foldername(name))[1])::uuid));
create policy business_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-files' and is_business_write_member(((storage.foldername(name))[1])::uuid));
