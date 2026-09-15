-- CourtSide · the media bucket. The storage half of the first migration was
-- never run on the live project, so uploads had nowhere to go. This creates
-- the bucket with the hardened limits and the owner-only write rules, and
-- lets signed-in players call the view counter. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media is public"         on storage.objects;
drop policy if exists "upload into your folder" on storage.objects;
drop policy if exists "replace your own files"  on storage.objects;
drop policy if exists "delete your own files"   on storage.objects;

create policy "media is public"          on storage.objects for select using (bucket_id = 'media');
create policy "upload into your folder"  on storage.objects for insert
  with check (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "replace your own files"   on storage.objects for update
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "delete your own files"    on storage.objects for delete
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

grant execute on function public.bump_post_views(uuid) to authenticated;
