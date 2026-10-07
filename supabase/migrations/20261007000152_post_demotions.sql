-- CourtSide · migration 152: pushing a post to the bottom of feeds
-- (Oct 7, owner: "a feature for me admin that's like shadow banning so I can
-- shadow ban posts and put them to the very bottom of feeds").
--
-- NOT APPLIED — the lead applies it.
--
-- What an admin can do from here on (an admin is an account with is_admin,
-- which is only ever set in Supabase; today @oatmealandsilk and
-- @mrdinosaur62):
--   * "Push to bottom" from a post's … menu: the post goes to the very
--     bottom of everyone's feeds (For you, a group's feed, Activities, the
--     weekly challenge's clips), below everything they have already seen;
--   * "Undo push to bottom", from the same menu or from Settings → Admin →
--     Pushed-down posts, which lists every one.
--
-- What does NOT happen: nothing is hidden or deleted. The post stays on its
-- author's profile, opens from a link, a notification or search, and can be
-- liked and commented on as before. Its author is never told and cannot
-- tell: on their own phone their post ranks exactly as it always did, and
-- the list the app reads (feed_demoted_posts) never includes the caller's
-- own posts, so not even a look at the raw answer gives it away. Nobody is
-- notified of anything.
--
-- What changes, by name:
--   post_demotions (new): one row per pushed-down post (the post, which admin
--     pushed it, when, and an optional note only admins see). Row level
--     security is on with no rules at all, so nobody reads or writes it
--     directly; only the three functions below touch it. A deleted post
--     takes its row with it.
--   set_post_demoted(post, on, note): push down (on) or undo (off).
--     Refuses anyone who is not an admin ("not allowed"); "not found" for a
--     post that does not exist. Doing it twice changes nothing.
--   feed_demoted_posts(): the ids of every pushed-down post, except the
--     caller's own. Read by the app with the feed's numbers
--     (feed_post_scores), at the same moments.
--   admin_demoted_posts(): the admins' list (post, author and handle, what
--     it says, its picture, when, by whom, the note), newest first. Refuses
--     anyone who is not an admin.
--
-- Apps from before this runs keep working: they never ask. An app from after
-- it, on a database without it, finds no such function and treats nothing as
-- pushed down; "Push to bottom" then says it is not switched on yet.
--
-- Needs 23 (is_admin). Safe to run more than once.

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.posts') is null then
    raise exception 'Migration 152 stopped before changing anything: migration 23 (is_admin) has to run first.';
  end if;
end $$;

-- ------------------------------------------------------------- 1. the table
create table if not exists public.post_demotions (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  demoted_by uuid references public.profiles (id) on delete set null,
  demoted_at timestamptz not null default now(),
  note       text check (note is null or char_length(note) <= 200)
);

alter table public.post_demotions enable row level security;
-- No policies on purpose: nobody reads or writes it except the functions below.
revoke all on table public.post_demotions from public, anon, authenticated;

-- ------------------------------------------------------- 2. push down, undo
create or replace function public.set_post_demoted(p_post uuid, p_on boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  words text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_post is null then raise exception 'not found'; end if;
  if coalesce(p_on, false) then
    if not exists (select 1 from public.posts p where p.id = p_post) then raise exception 'not found'; end if;
    insert into public.post_demotions as d (post_id, demoted_by, note)
    values (p_post, auth.uid(), words)
    -- Already down: stays down from when it first went; a new note replaces the old one.
    on conflict (post_id) do update set note = coalesce(excluded.note, d.note);
  else
    delete from public.post_demotions d where d.post_id = p_post;
  end if;
end $$;

revoke all on function public.set_post_demoted(uuid, boolean, text) from public, anon;
grant execute on function public.set_post_demoted(uuid, boolean, text) to authenticated;

-- ------------------------------------------------ 3. what the feeds read
-- Every pushed-down post but the caller's own: an author never sees theirs
-- marked, even in the raw answer. Signed-out callers get nothing.
create or replace function public.feed_demoted_posts()
returns table (post_id uuid)
language sql stable security definer set search_path = public as $$
  select d.post_id
  from public.post_demotions d
  join public.posts p on p.id = d.post_id
  where auth.uid() is not null and p.author_id <> auth.uid()
  order by d.demoted_at desc, d.post_id
$$;

revoke all on function public.feed_demoted_posts() from public, anon;
grant execute on function public.feed_demoted_posts() to authenticated;

-- ------------------------------------------------------ 4. the admins' list
create or replace function public.admin_demoted_posts()
returns table (post_id uuid, author_id uuid, author_handle text, kind text, preview text, picture text, demoted_at timestamptz, demoted_by uuid, note text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select d.post_id, p.author_id, pr.handle, p.kind, left(coalesce(p.body, ''), 160),
           coalesce(p.thumbnail_url, p.image_url), d.demoted_at, d.demoted_by, d.note
    from public.post_demotions d
    join public.posts p on p.id = d.post_id
    left join public.profiles pr on pr.id = p.author_id
    order by d.demoted_at desc, d.post_id;
end $$;

revoke all on function public.admin_demoted_posts() from public, anon;
grant execute on function public.admin_demoted_posts() to authenticated;

commit;
