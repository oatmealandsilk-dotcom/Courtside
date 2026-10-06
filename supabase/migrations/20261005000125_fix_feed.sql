-- CourtSide · migration 125: the feed's fixes (sweep, Oct 5).
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- What it does:
--   1. A comment can be just a photo. Until now the database refused a
--      comment with no words (comments_body_check), so a photo sent on its
--      own showed for a moment, was never saved, and was gone after a
--      refresh. Now: words, a photo, or both; still 2000 characters at most.
--      A comment with neither is still refused. (Until this runs, the app
--      takes such a comment back off the list and says to add a few words.)
--   2. A court tag only from someone known to be an adult (owner decision
--      7: a court tag says where someone regularly plays). The app kept
--      "Played at" and "Add the court" to known adults, but Add location
--      and editing a post did not. Now the database drops the court from a
--      post by anyone not known to be an adult as it is saved (the place
--      they typed stays, as words), and takes it off the posts that already
--      have one (2 on Oct 5, both one account's). Nobody is told; the post
--      stays as it was otherwise. A group-only post already never keeps a
--      court (guard_post_group, migration 67).
--   3. The author of a post or an Instant can delete anyone's comment under
--      it (holding a comment in the app offers Delete or Report). Everyone
--      could already delete their own comments and Instants; the app now
--      offers that too. Nothing for signed-out visitors.
--
-- Needs 51 and 52 (courts and photos on posts and comments) and 109
-- (known_adult reads the private settings row), all live. Asks known_adult,
-- author_of_post and author_of_hit, checked below to be as live on Oct 5;
-- rewrites none of them.
--
-- Tried on the live database on Oct 5, inside one transaction that was then
-- undone (nothing was saved), with the whole file run twice. With test
-- accounts: an adult's post kept its court; a post by someone not known to
-- be an adult lost it, as posted and when added in an edit (the typed place
-- stayed); a photo-only comment saved, one with neither words nor photo was
-- refused; a stranger and a signed-out visitor deleted nothing; the post's
-- and the Instant's author each deleted another player's comment under it;
-- the writer still deleted their own.
--   RESULT 2_nonadult_court_posts_before=2 after=0 adult_court_posts_kept=4
--   2_adult_court_kept=true 1_photo_only_saved=1 1_neither=refused
--   2_teen_new=none/Rollback Court 2_teen_edit=none/none/Rollback Court
--   3_stranger_sees=1 3_stranger_deletes=0/0 3_anon_deletes=0/0
--   3_author_deletes=true/true 3_writer_deletes_own=1 left=0
--   md5=9911071b1987ce8215cb0568dbe52bc0
--   def=CHECK (((char_length(body) <= 2000) AND ((char_length(body) >= 1) OR (image_url IS NOT NULL))))
--   fn_exec_anon/app=false/false policies=comments:authenticated;story_comments:authenticated

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- Relied on and never rewritten here (md5 of the body, as live on Oct 5).
  kept constant text[][] := array[
    ['known_adult',    'a79e745befd4374ea124ccf1692145a2'],
    ['author_of_post', '20f3911bb078f9ee120e33c38ad18607'],
    ['author_of_hit',  '9a9d8e3f9ac496044f7454b417858c55']
  ];
  i int;
  now_is text;
  def text;
  wrong text[] := '{}';
begin
  if to_regclass('public.comments') is null or to_regclass('public.story_comments') is null or to_regclass('public.user_state') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'image_url')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'court_lng') then
    raise exception 'Migration 125 stopped before changing anything: migrations 51 and 52 have to run first.';
  end if;
  for i in 1 .. array_length(kept, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1]
                  and md5(p.prosrc) <> kept[i][2]) then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  -- Made here: absent before, or as this file leaves it.
  select coalesce(max(md5(p.prosrc)), 'absent') into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'guard_post_court';
  if now_is not in ('absent', '9911071b1987ce8215cb0568dbe52bc0') then
    wrong := wrong || 'guard_post_court'::text;
  end if;
  -- The words-or-photo rule: as on Oct 5 (words only), or as this file leaves it.
  select pg_get_constraintdef(c.oid) into def from pg_constraint c
    where c.conrelid = 'public.comments'::regclass and c.conname = 'comments_body_check';
  if def is not null and def not in (
       'CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))',
       'CHECK (((char_length(body) <= 2000) AND ((char_length(body) >= 1) OR (image_url IS NOT NULL))))') then
    wrong := wrong || 'comments_body_check'::text;
  end if;
  -- The trigger's name is free, or this file's.
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = 'public.posts'::regclass and t.tgname = 'guard_post_court' and p.proname <> 'guard_post_court') then
    wrong := wrong || 'the guard_post_court trigger'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 125 stopped before changing anything: % is not as this file expects (changed after Oct 5). Bring this file up to date first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------- 1. a comment can be just a photo
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(body) <= 2000 and (char_length(body) >= 1 or image_url is not null));

-- ------------------------------------- 2. a court tag only from a known adult
-- As a post is saved, or its court changed: someone not known to be an
-- adult keeps the place as words, never the court.
create or replace function public.guard_post_court()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.court_id is not null or new.court_name is not null or new.court_lat is not null or new.court_lng is not null)
     and not public.known_adult(new.author_id) then
    new.court_id := null; new.court_name := null; new.court_lat := null; new.court_lng := null;
  end if;
  return new;
end $$;
revoke all on function public.guard_post_court() from public, anon, authenticated;

drop trigger if exists guard_post_court on public.posts;
create trigger guard_post_court before insert or update of court_id, court_name, court_lat, court_lng on public.posts
  for each row execute function public.guard_post_court();

-- The ones already tagged: the court comes off (the typed place stays).
update public.posts set court_id = null, court_name = null, court_lat = null, court_lng = null
  where (court_id is not null or court_name is not null or court_lat is not null or court_lng is not null)
    and not public.known_adult(author_id);

-- ------------------------- 3. delete anyone's comment under your own post or Instant
drop policy if exists "delete comments under your own posts" on public.comments;
create policy "delete comments under your own posts" on public.comments for delete to authenticated
  using (public.author_of_post(post_id) = auth.uid());

drop policy if exists "delete comments under your own instants" on public.story_comments;
create policy "delete comments under your own instants" on public.story_comments for delete to authenticated
  using (public.author_of_hit(story_id) = auth.uid());

-- --------------------------------------------------------------- 4. last check
do $$
begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.comments'::regclass and c.conname = 'comments_body_check')
       is distinct from 'CHECK (((char_length(body) <= 2000) AND ((char_length(body) >= 1) OR (image_url IS NOT NULL))))'
     or not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'guard_post_court'
                    and md5(p.prosrc) = '9911071b1987ce8215cb0568dbe52bc0' and p.prosecdef
                    and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('authenticated', p.oid, 'execute'))
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.posts'::regclass and t.tgname = 'guard_post_court' and t.tgenabled = 'O')
     or exists (select 1 from public.posts where court_id is not null and not public.known_adult(author_id))
     or (select count(*) from pg_policies where schemaname = 'public'
           and ((tablename = 'comments' and policyname = 'delete comments under your own posts')
             or (tablename = 'story_comments' and policyname = 'delete comments under your own instants'))
           and cmd = 'DELETE' and roles = '{authenticated}'::name[]) <> 2 then
    raise exception 'Migration 125 stopped: something did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
-- (a) The comment rule (expect: ... OR (image_url IS NOT NULL) ...):
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'comments_body_check';
-- (b) No court on a post by someone not known to be an adult (expect 0):
-- select count(*) from public.posts where court_id is not null and not public.known_adult(author_id);
-- (c) The two new delete rules (expect 2 rows, {authenticated}):
-- select tablename, policyname, roles from pg_policies where policyname like 'delete comments under your own %';
