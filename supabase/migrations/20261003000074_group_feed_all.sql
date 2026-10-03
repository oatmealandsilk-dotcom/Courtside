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
--   * Being in a group together counts as letting each other see your posts,
--     the way a follow does for a private account, but for posts only (and
--     their comments and likes): not stories, not anything else on a
--     profile. So someone private who joins a group is seen by its members.
--     Never between two people blocked either way, and never anyone not
--     known to be an adult (groups are adults-only; this checks again in
--     case that ever changes). It lasts only while both are in the group.
--   * "Only <group>" (posts.group_id) still works exactly as in 67: only
--     that group's members and the author can read it.
--   * Commenting on a post follows the same rule, so a member can answer a
--     fellow member's post they see in the group's feed. (In 67 someone
--     private's group post could be read by the group but not commented on
--     by members who did not follow them; that is fixed here too.)
--
-- group_feed(g, before, lim): what the app calls. Only for someone in the
-- group ('not_in_group' otherwise, 'adults_only' for anyone not known to be
-- an adult); signed out it cannot be called at all. Returns the posts' ids
-- and times, newest first, older than `before` when given; the app then reads
-- the posts themselves through the usual rules, which now agree.
--
-- Needs 21 (blocking), 56 (comment rules), 60 (known_adult), 62 and 67.
-- Works with or without 64. Safe to run more than once. Changes nobody's
-- posts or memberships.

-- ============================================================ 1. group-mates

-- Whether the person signed in and `author` are in a group together now,
-- both known adults and not blocked either way. Named in the rules below, so
-- anon may call it too (signed out it always answers false).
create or replace function public.feed_group_mate(author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and author is not null and author <> auth.uid()
    and exists (
      select 1 from public.feed_group_members a
      join public.feed_group_members b on b.group_id = a.group_id
      where a.user_id = auth.uid() and b.user_id = author)
    and not public.is_blocked_between(auth.uid(), author)
    and public.known_adult(auth.uid()) and public.known_adult(author);
$$;
revoke all on function public.feed_group_mate(uuid) from public;
grant execute on function public.feed_group_mate(uuid) to anon, authenticated;

-- ============================================================ 2. who reads a post

-- Migration 67's rule, word for word, plus "or you are in a group with its
-- author" for a post shared with everyone.
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id)
    and (case when group_id is null
           then (public.can_view(author_id) or auth.uid() = any(tagged_user_ids)
                 or (session->'with') @> jsonb_build_array(jsonb_build_object('id', auth.uid()))
                 or public.feed_group_mate(author_id))
           else (auth.uid() = author_id or public.in_feed_group(group_id) or public.is_admin())
         end)
    and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));

-- Migration 56's rule, with "you may see the owner" counting group-mates.
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert
  with check (auth.uid() = author_id
    and (public.can_view(public.author_of_post(post_id)) or public.feed_group_mate(public.author_of_post(post_id)))
    and not public.blocked_with(public.author_of_post(post_id))
    and exists (select 1 from public.posts p where p.id = comments.post_id));

-- ============================================================ 3. the feed

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
           or (public.known_adult(p.author_id) and not public.is_blocked_between(me, p.author_id)))
    order by p.created_at desc, p.id desc
    limit n;
end $$;
revoke all on function public.group_feed(uuid, timestamptz, int) from public, anon;
grant execute on function public.group_feed(uuid, timestamptz, int) to authenticated;
