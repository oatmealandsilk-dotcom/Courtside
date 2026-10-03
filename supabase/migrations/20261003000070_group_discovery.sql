-- 70: finding groups to join.
--
-- NOT APPLIED — needs the owner's OK, and migration 67 (groups) first.
--
-- Until now a group could only be found through its invite link: someone
-- not in a group cannot read it at all (migration 67's rules). The "+" on
-- the Feed now opens a "Find groups" window that lists groups anyone can
-- ask to join. This adds just enough for that, and nothing more:
--
--   * feed_groups.discoverable: whether a group shows in Find groups. On
--     by default, for open and ask-to-join groups alike; an admin can turn
--     it off ("Show in Find groups" in the group's form), and then the group
--     is reachable only by its invite link, as before.
--   * set_feed_group_discoverable(g, on): an admin turns that on or off.
--     (create_feed_group and update_feed_group keep their exact shape, so the
--     app and migration 67 never disagree; a new group that should be hidden
--     is switched off straight after it is made.)
--   * discover_groups(q, lim): the list. For each group: its id, name,
--     description, whether it asks first, how many are in it, whether
--     someone in it lives near your city, and whether you are in it or have
--     asked. Never who is in it, never its posts.
--   * my_feed_groups(): as in 67, plus each group's 'discoverable', so the
--     edit form shows the switch as it is.
--
-- Who sees what in the list:
--   * Only signed-in adults (known_adult, never the age itself). Signed out
--     the function cannot be called at all; a teen, or an account with no
--     birthday yet, gets an empty list, as groups are adults-only.
--   * Only groups marked discoverable and with someone in them.
--   * Never a group whose admin you are blocked with, either way.
--   * Groups with a member near your city first (about 60 km, the city each
--     person picked, never a street), then the most members, then newest.
--
-- Needs 21 (blocking), 49 (city position), 60 (known_adult) and 67.
-- Safe to run more than once. Changes nobody's posts or memberships.

-- ============================================================ 1. the switch

alter table public.feed_groups add column if not exists discoverable boolean not null default true;

-- Turn a group's listing in Find groups on or off. Admins only.
create or replace function public.set_feed_group_discoverable(g uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  update public.feed_groups set discoverable = coalesce(p_on, discoverable) where id = g;
end $$;
revoke all on function public.set_feed_group_discoverable(uuid, boolean) from public, anon;
grant execute on function public.set_feed_group_discoverable(uuid, boolean) to authenticated;

-- ============================================================ 2. the list

create or replace function public.discover_groups(q text default null, lim int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  -- What was typed, tidied, with % and _ taken literally.
  term text := nullif(btrim(left(coalesce(q, ''), 40)), '');
  pattern text;
  n int := greatest(1, least(coalesce(lim, 30), 50));
  my_lat double precision;
  my_lng double precision;
  result jsonb;
begin
  if me is null then return '[]'::jsonb; end if;
  -- Groups are for adults (migration 67): nothing to list for anyone else.
  if not public.known_adult(me) then return '[]'::jsonb; end if;
  if term is not null then
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select city_lat, city_lng into my_lat, my_lng from public.profiles where id = me;

  with listed as (
    select g.id, g.name, g.description, g.ask_to_join, g.created_at,
      (select count(*) from public.feed_group_members m where m.group_id = g.id) as members,
      exists (select 1 from public.feed_group_members m where m.group_id = g.id and m.user_id = me) as member,
      exists (select 1 from public.feed_group_requests r where r.group_id = g.id and r.user_id = me) as requested,
      -- Taken out of it by an admin: you can only ask again, even if it is open.
      exists (select 1 from public.feed_group_removals x where x.group_id = g.id and x.user_id = me) as removed,
      (my_lat is not null and my_lng is not null and exists (
        select 1 from public.feed_group_members m join public.profiles p on p.id = m.user_id
        where m.group_id = g.id and m.user_id <> me
          and p.city_lat is not null and p.city_lng is not null
          and abs(p.city_lat - my_lat) < 0.55
          and abs(p.city_lng - my_lng) * cos(radians(my_lat)) < 0.55)) as near
    from public.feed_groups g
    where g.discoverable
      and (pattern is null or g.name ilike pattern or coalesce(g.description, '') ilike pattern)
      and not exists (
        select 1 from public.feed_group_members a
        where a.group_id = g.id and a.role = 'admin' and public.is_blocked_between(me, a.user_id))
  ), ranked as (
    select * from listed where members > 0
    order by near desc, members desc, created_at desc, id
    limit n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'description', r.description,
      'ask', r.ask_to_join or r.removed, 'members', r.members,
      'member', r.member, 'requested', r.requested, 'near', r.near)
    order by r.near desc, r.members desc, r.created_at desc, r.id), '[]'::jsonb)
  into result
  from ranked r;
  return result;
end $$;
revoke all on function public.discover_groups(text, int) from public, anon;
grant execute on function public.discover_groups(text, int) to authenticated;

-- ============================================================ 3. your groups, with the switch

-- Migration 67's my_feed_groups, word for word, plus 'discoverable'.
create or replace function public.my_feed_groups()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'description', g.description, 'ask', g.ask_to_join,
        'discoverable', g.discoverable,
        'createdAt', g.created_at, 'joinedAt', mine.joined_at,
        'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'admin', m.role = 'admin') order by m.joined_at), '[]'::jsonb)
                    from public.feed_group_members m
                    where m.group_id = g.id and (m.user_id = me.id or not public.blocked_with(m.user_id))),
        'requests', case when mine.role = 'admin' then (
                      select coalesce(jsonb_agg(r.user_id order by r.created_at), '[]'::jsonb)
                      from public.feed_group_requests r
                      where r.group_id = g.id and not public.blocked_with(r.user_id))
                    else '[]'::jsonb end
      ) order by mine.joined_at)
      from public.feed_group_members mine join public.feed_groups g on g.id = mine.group_id
      where mine.user_id = me.id), '[]'::jsonb),
    'asked', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by r.created_at)
      from public.feed_group_requests r join public.feed_groups g on g.id = r.group_id
      where r.user_id = me.id), '[]'::jsonb))
  from me where me.id is not null;
$$;
revoke all on function public.my_feed_groups() from public, anon;
grant execute on function public.my_feed_groups() to authenticated;
