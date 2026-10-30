-- CourtSide · migration 20261029000205: "Played here today" on the map.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/205_undo.sql.
--
-- Why (owner, Oct 29): "Played here today glow looks good, maybe if someone
-- taps the played here today court. It will show a video from that day if
-- someone posted". A court lights up live for strangers only once two or more
-- adults are there, so someone playing with a friend who is not on CourtSide
-- never lights one. What they post afterwards still says it was played on.
--
-- What it adds: court_played_today(ids, since), read-only. For up to 50 courts,
-- what PUBLIC was at each since `since` (the asker's own midnight, sent by the
-- app; never more than 26 hours back): posts tagged at that court, and open
-- hits there that everyone may see and that have started (an upcoming hit is
-- not "played" yet; it already shows as its own hit tag). One row per court with
-- anything: how many posts, how many hits, the latest time, and who (their ids,
-- so the app can leave out anyone it hides). Nothing else: no spot, no names,
-- no text, no pictures (the court's card reads its posts as it always has).
--
-- Never counted:
--   * a post shared to one group (posts.group_id), a session that logged
--     itself or is held back (posts.auto_logged / auto_held: their audience is
--     mutuals or only the player), a post put away (archived) or taken down
--     (removed_at), or a post an admin pushed to the bottom (post_demotions,
--     migration 152; the author still sees their own, as in their feed);
--   * a hit for invited people (audience other than 'everyone'), called off, or
--     not started yet;
--   * anything by a private account (except your own), a suspended account,
--     someone blocked either way (is_blocked_between) or muted either way
--     (user_state.muted_ids), or anyone the court rule already hides from you
--     (shows_at_court: a teen's posts only for friends who follow each other).
--   * Signed out: nothing (anon cannot call it).
--
-- Left as they are: every other function, table and grant.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
begin
  if to_regprocedure('public.shows_at_court(uuid, uuid)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.hit_requests') is null
     or to_regclass('public.user_state') is null
     or to_regclass('public.post_demotions') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'court_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'group_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_logged')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'auto_held')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'removed_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hit_requests' and column_name = 'audience')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'muted_ids') then
    raise exception 'Migration 205 stopped before changing anything: something it rests on is missing. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------------------- 1. the reader
create or replace function public.court_played_today(ids text[], since timestamptz)
returns table (court_id text, posts integer, hits integer, last_at timestamptz, author_ids uuid[])
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  day as (select greatest(coalesce(since, now() - interval '24 hours'), now() - interval '26 hours') as t),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  mine as (
    select coalesce((select us.muted_ids from public.user_state us, me where us.user_id = me.id), '{}'::text[]) as muted
  ),
  act as (
    select p.court_id as cid, 1 as is_post, p.author_id as uid, p.created_at as at
    from public.posts p, day
    where p.court_id in (select id from wanted)
      and p.created_at >= day.t and p.created_at <= now() + interval '5 minutes'
      and not p.archived and p.removed_at is null and p.group_id is null
      and not p.auto_logged and not p.auto_held
      and (p.author_id = (select id from me)
           or not exists (select 1 from public.post_demotions d where d.post_id = p.id))
    union all
    select h.place->>'id', 0, h.author_id, h.starts_at
    from public.hit_requests h, day
    where h.place->>'id' in (select id from wanted)
      and h.audience = 'everyone' and not h.cancelled
      and h.starts_at >= day.t and h.starts_at <= now()
  ), shown as (
    select a.* from act a, me, mine
    where me.id is not null
      and public.shows_at_court(me.id, a.uid)
      and (a.uid = me.id or (
        exists (select 1 from public.profiles pr where pr.id = a.uid and not coalesce(pr.is_private, false) and pr.suspended_at is null)
        and not (a.uid::text = any (mine.muted))
        and not exists (select 1 from public.user_state t where t.user_id = a.uid and me.id::text = any (coalesce(t.muted_ids, '{}')))))
  )
  select cid, sum(is_post)::int, (count(*) - sum(is_post))::int, max(at), (array_agg(distinct uid))[1:20]
  from shown group by cid
$$;

revoke all on function public.court_played_today(text[], timestamptz) from public, anon, authenticated;
grant execute on function public.court_played_today(text[], timestamptz) to authenticated;

-- ------------------------------------------------------------ 2. the result
do $$
begin
  if to_regprocedure('public.court_played_today(text[], timestamptz)') is null
     or has_function_privilege('anon', 'public.court_played_today(text[], timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_played_today(text[], timestamptz)', 'execute') then
    raise exception 'Migration 205 stopped: the result was not as planned. Nothing was changed.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
