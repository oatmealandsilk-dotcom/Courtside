-- CourtSide · migration 103: someone who is not signed in no longer sees
-- minors' posts or who follows whom (security review, Oct 5).
--
-- Like migration 94 (profiles), this only narrows what the database tells
-- people who are NOT signed in. Nothing in the app or on the website reads
-- posts or follows while signed out, so nobody using CourtSide sees any
-- difference.
--
-- 1. Posts. Signed out, anyone could read every public post with its court,
--    the court's map position and the place typed in. So a teen's posts said
--    which court they play at and when, and so did an adult's post that
--    tagged a teen ("with @teen at Riverside, Saturday 9am"). Now, signed
--    out, a post comes back only when its author is known to be an adult and
--    nobody tagged on it, or listed as playing in it, is a minor or has no
--    age on file. (Signed in, posts are unchanged for now; hiding a minor's
--    court from strangers who are signed in needs an app change and is on
--    the list for later.)
--
-- 2. Follows. Signed out, the whole list of who follows whom could be read,
--    private accounts and teens included. Following each other is exactly
--    what the teen rules trust (chats, hits, the map), so it told a stranger
--    which adults a teen trusts. Now nothing comes back signed out.
--
-- Safe to run more than once. Works before or after migration 64.

create or replace function public.post_shown_signed_out(author uuid, tagged uuid[], session jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select public.known_adult(author)
     and not exists (select 1 from unnest(coalesce(tagged, '{}'::uuid[])) t where not public.known_adult(t))
     and not exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(session -> 'with') = 'array' then session -> 'with' else '[]'::jsonb end) w
       where jsonb_typeof(w) = 'object'
         and (w ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and not public.known_adult((w ->> 'id')::uuid))
$$;
revoke all on function public.post_shown_signed_out(uuid, uuid[], jsonb) from public;
grant execute on function public.post_shown_signed_out(uuid, uuid[], jsonb) to anon, authenticated;

drop policy if exists "signed out see adults' posts only" on public.posts;
create policy "signed out see adults' posts only" on public.posts
  as restrictive for select to anon
  using (public.post_shown_signed_out(author_id, tagged_user_ids, session));

drop policy if exists "signed out see no follows" on public.follows;
create policy "signed out see no follows" on public.follows
  as restrictive for select to anon
  using (false);

-- Checks after running, as a signed-out reader (expect 0 and 0):
-- begin; set local role anon;
--   select count(*) from public.follows;
--   select count(*) from public.posts p where not public.known_adult(p.author_id);
-- rollback;
-- (known_adult may refuse a signed-out caller after migration 64; then check as the dashboard instead.)
