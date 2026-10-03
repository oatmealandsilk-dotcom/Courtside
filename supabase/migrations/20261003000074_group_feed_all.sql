-- 74: a group's feed is everything its members post.
--
-- NOT APPLIED — needs the owner's OK, and migration 67 (groups) first.
--
-- The owner's change (Oct 3): "For groups, everything you posted will be in
-- the group … it's not like you have to create a post specifically for a
-- group. It's just like a big group feed." Until now a group's feed held
-- only posts shared to that group (posts.group_id). From here:
--
--   * A group's feed = every post by the people in it now (their ordinary
--     posts, made before or after they joined) plus the posts shared to that
--     group only, newest first, a page at a time. Someone who leaves, or is
--     taken out, drops out of it with all their posts. A post shared to a
--     different group never shows here.
--   * Who sees a member's ordinary post in the feed is exactly who could
--     see it anyway: a public account's, every member; a private account's,
--     only members who already follow them (an approved follow), or who are
--     tagged in it. Open groups can be joined by anyone with the link, so
--     joining one never opens up a private account to strangers. Never
--     between two people blocked either way, never anyone not known to be an
--     adult (groups are adults-only; checked again in case that changes).
--   * "Only <group>" (posts.group_id) still works exactly as in 67: every
--     member of that group (and the author) can read it.
--   * Commenting: as before (migration 56), plus every member may comment on
--     a post shared to their group only. (In 67 a private account's group
--     post could be read by the whole group but only commented on by members
--     who followed them.) Who may read a post is not changed here.
--
-- group_feed(g, before, lim): what the app calls. Only for someone in the
-- group ('not_in_group' otherwise, 'adults_only' for anyone not known to be
-- an adult); signed out it cannot be called at all. Returns the posts' ids
-- and times, newest first, older than `before` when given; the app then reads
-- the posts themselves through the usual rules, which agree.
--
-- Needs 02 (can_view), 21 (blocking), 56 (comment rules), 60 (known_adult), 62 and 67.
-- Works with or without 64. Safe to run more than once. Changes nobody's
-- posts or memberships.

-- ============================================================ 1. commenting

-- Migration 56's rule, plus: on a post shared to a group only, every member
-- of that group may comment (they can all read it).
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert
  with check (auth.uid() = author_id
    and (public.can_view(public.author_of_post(post_id))
         or exists (select 1 from public.posts p where p.id = comments.post_id and p.group_id is not null and public.in_feed_group(p.group_id)))
    and not public.blocked_with(public.author_of_post(post_id))
    and exists (select 1 from public.posts p where p.id = comments.post_id));

-- ============================================================ 2. the feed

create or replace function public.group_feed(g uuid, before timestamptz default null, lim int default 20)
returns table (id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  n int := greatest(1, least(coalesce(lim, 20), 50));
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.feed_group_members m where m.group_id = g and m.user_id = me) then
    raise exception 'not_in_group';
  end if;
  if not public.known_adult(me) then raise exception 'adults_only'; end if;
  return query
    select p.id, p.created_at
    from public.posts p
    join public.feed_group_members m on m.group_id = g and m.user_id = p.author_id
    where (p.group_id is null or p.group_id = g)
      and not p.archived
      and p.removed_at is null
      and (before is null or p.created_at < before)
      and (p.author_id = me
           or (public.known_adult(p.author_id) and not public.is_blocked_between(me, p.author_id)
               -- An ordinary post: only if you could see it anyway (a public
               -- account, one you follow, or one you are tagged in).
               and (p.group_id = g or public.can_view(p.author_id) or me = any(p.tagged_user_ids)
                    or (p.session->'with') @> jsonb_build_array(jsonb_build_object('id', me)))))
    order by p.created_at desc, p.id desc
    limit n;
end $$;
revoke all on function public.group_feed(uuid, timestamptz, int) from public, anon;
grant execute on function public.group_feed(uuid, timestamptz, int) to authenticated;
