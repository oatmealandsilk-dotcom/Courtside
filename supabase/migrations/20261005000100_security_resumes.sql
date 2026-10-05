-- CourtSide · migration 100: the résumé shelf takes a few documents per
-- person, and only documents (security review, Oct 5).
--
-- The problem: the private coach-applications shelf (migration 15) let any
-- signed-in account put any number of files of up to 10 MB each into its own
-- folder, of any kind, suspended accounts included, and nobody can remove
-- them but an admin. It was the one place where one script on one free
-- account could grow the project's storage (and its bill) without end. Files
-- could also sit in sub-folders that deleting the account did not reach, and
-- a web page or SVG file put there could be opened from our own address.
-- An application's résumé path could also point anywhere, not only at the
-- applicant's own file.
--
-- What changes:
--   * The shelf takes PDF and Word files only (what the app's picker offers),
--     plus "unknown type" for the odd phone that does not say; never web
--     pages or pictures that can carry code.
--   * Each account can put at most 10 files there, ever, directly in its own
--     folder (no sub-folders), and not while suspended. One application
--     uploads one résumé; nobody has more than 0 today.
--   * An application's résumé path must be in the applicant's own folder.
-- The existing rules stay; the new one is added on top, so it holds even if
-- an older migration's rule is ever run again.
-- Nothing changes for anyone applying through the app. Safe to run more than once.

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream']
 where id = 'coach-applications';

-- How many files you have put on the shelf (they cannot be deleted by you, so this is a lifetime count).
create or replace function public.my_resume_uploads()
returns integer language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'coach-applications'
    and o.name like auth.uid()::text || '/%';
$$;
revoke all on function public.my_resume_uploads() from public, anon;
grant execute on function public.my_resume_uploads() to authenticated;

drop policy if exists "resume uploads: a few, flat, not suspended" on storage.objects;
create policy "resume uploads: a few, flat, not suspended" on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'coach-applications'
    or (name ~ ('^' || auth.uid()::text || '/[^/]+$')
        and public.my_resume_uploads() < 10
        and not public.i_am_suspended()));

alter table public.coach_applications drop constraint if exists coach_applications_resume_own_folder;
alter table public.coach_applications add constraint coach_applications_resume_own_folder
  check (resume_path is null or (resume_path like user_id::text || '/%' and position('/' in substr(resume_path, 38)) = 0)) not valid;

-- Checks after running:
-- (a) the allowed kinds (expect the four types above):
--   select allowed_mime_types from storage.buckets where id = 'coach-applications';
-- (b) the new rule (expect one row, RESTRICTIVE, INSERT):
--   select policyname, permissive, cmd from pg_policies where schemaname = 'storage' and policyname like 'resume uploads%';
