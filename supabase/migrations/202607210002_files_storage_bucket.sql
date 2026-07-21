-- Storage bucket backing the Documents section.
--
-- The v2 plan assumed this bucket already existed ("Documents reuses the existing
-- files bucket"); it never did, so every upload failed with STORAGE_ERROR while the
-- application code was correct. Bucket id must stay 'files' — it is hard-coded in
-- app/api/files/upload/route.ts, [id]/route.ts and [id]/download/route.ts.

-- Private: objects are reached only through server-generated signed URLs, never
-- directly. file_size_limit mirrors MAX_FILE_SIZE_BYTES (10MB) in the upload route
-- as a backstop, so an oversize object cannot land even if the route check is
-- bypassed.
--
-- allowed_mime_types is deliberately NOT set. The upload route already validates
-- extension and MIME, and browser-reported MIME is unreliable for extensions the OS
-- does not register (.sql and .md report application/octet-stream on Windows).
-- Duplicating that check here would reject the same files a second time, in a place
-- with no useful error message.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 10485760)
on conflict (id) do nothing;

-- storage.objects has RLS enabled by Supabase; it needs a policy or nothing is
-- permitted. Scoped to this bucket so other buckets added later are unaffected,
-- and gated on the same public.is_admin() used by every dashboard_* table.
--
-- `for all` covers select too, which matters: createSignedUrl() requires select on
-- the object, so a narrower insert/delete-only policy would break downloads.
drop policy if exists "admins manage files bucket objects" on storage.objects;
create policy "admins manage files bucket objects"
  on storage.objects
  for all
  using (bucket_id = 'files' and public.is_admin())
  with check (bucket_id = 'files' and public.is_admin());

-- Rollback guidance:
-- drop policy if exists "admins manage files bucket objects" on storage.objects;
-- delete from storage.objects where bucket_id = 'files';
-- delete from storage.buckets where id = 'files';
