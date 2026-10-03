-- 73: a group's look — its colour, an emoji or its initials, or a photo.
--
-- NOT APPLIED — needs the owner's OK, and migrations 54 (is_own_media_url),
-- 67 (groups) and 70 (Find groups) first.
--
-- The new "Start a group" flow lets whoever starts a group give it a face,
-- the way a WhatsApp group or a Strava club has one:
--   * a colour, by name, never a hex value: the app turns the name into the
--     theme's own colour, so a group looks right on every theme
--     ('accent' is the theme's own green, the default);
--   * on that colour, an emoji or (none chosen) the group's initials;
--   * or a photo instead, uploaded to the media bucket in the admin's own
--     folder, exactly as a group chat's photo is (migration 54).
--
-- What it adds, and nothing more:
--   * feed_groups.look_color, look_emoji, photo_url, each with a rule the
--     table itself keeps, whoever writes it.
--   * set_feed_group_look(g, color, emoji, photo): an admin sets all three
--     at once (null clears one). create_feed_group and update_feed_group
--     keep their exact shape, so the app and migrations 67/70 never
--     disagree: a new group gets its look straight after it is made, the
--     way 70 hides a new group from Find groups.
--   * my_feed_groups, feed_group_card and discover_groups: as before, word
--     for word, plus 'color', 'emoji' and 'photo' on each group, so the
--     Feed, a group's page, its invite link and Find groups all show it.
--
-- Who can do what:
--   * Only a group's admins change its look ('not_admin' for anyone else).
--   * A photo must be a file in the media bucket, and a new one must be in
--     the admin's own folder ('bad_photo'). A photo already on the group
--     (another admin's) can stay when the rest changes.
--   * A colour outside the list, or an emoji that is really words (letters,
--     digits, spaces, markup), is refused ('bad_look').
--
-- Safe to run more than once. Changes nobody's posts or memberships.

-- ============================================================ 1. the columns

alter table public.feed_groups add column if not exists look_color text;
alter table public.feed_groups add column if not exists look_emoji text;
alter table public.feed_groups add column if not exists photo_url text;

-- The colours the app offers, by name (see src/features/groups/look.ts).
create or replace function public.feed_group_color_ok(c text)
returns boolean language sql immutable as $$
  select c is null or c in ('accent', 'clay', 'hard', 'grass', 'gold', 'red', 'ink');
$$;
revoke all on function public.feed_group_color_ok(text) from public, anon, authenticated;

-- One emoji (some are several characters joined), never words or markup.
create or replace function public.feed_group_emoji_ok(e text)
returns boolean language sql immutable as $$
  select e is null or (char_length(e) between 1 and 16 and e !~ '[A-Za-z0-9[:space:]<>&"''\\/]');
$$;
revoke all on function public.feed_group_emoji_ok(text) from public, anon, authenticated;

-- The rules are put on afresh each run; a value an earlier draft let in that
-- they would refuse is taken off first.
alter table public.feed_groups drop constraint if exists feed_groups_look_color_ok;
alter table public.feed_groups drop constraint if exists feed_groups_look_emoji_ok;
alter table public.feed_groups drop constraint if exists feed_groups_photo_own_media;
update public.feed_groups set look_color = null where not public.feed_group_color_ok(look_color);
update public.feed_groups set look_emoji = null where not public.feed_group_emoji_ok(look_emoji);
update public.feed_groups set photo_url = null where photo_url is not null and not public.is_own_media_url(photo_url, null);
alter table public.feed_groups add constraint feed_groups_look_color_ok check (public.feed_group_color_ok(look_color));
alter table public.feed_groups add constraint feed_groups_look_emoji_ok check (public.feed_group_emoji_ok(look_emoji));
alter table public.feed_groups add constraint feed_groups_photo_own_media check (photo_url is null or public.is_own_media_url(photo_url, null));

-- ============================================================ 2. setting it

create or replace function public.set_feed_group_look(g uuid, p_color text default null, p_emoji text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  before_photo text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if not public.feed_group_color_ok(v_color) or not public.feed_group_emoji_ok(v_emoji) then
    raise exception 'bad_look';
  end if;
  select photo_url into before_photo from public.feed_groups where id = g for update;
  if v_photo is not null and v_photo is distinct from before_photo and not public.is_own_media_url(v_photo, me) then
    raise exception 'bad_photo';
  end if;
  update public.feed_groups
    set look_color = v_color, look_emoji = v_emoji, photo_url = v_photo
    where id = g;
end $$;
revoke all on function public.set_feed_group_look(uuid, text, text, text) from public, anon;
grant execute on function public.set_feed_group_look(uuid, text, text, text) to authenticated;

-- ============================================================ 3. reading it

-- Migration 70's my_feed_groups, word for word, plus the look.
create or replace function public.my_feed_groups()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'description', g.description, 'ask', g.ask_to_join,
        'discoverable', g.discoverable,
        'color', g.look_color, 'emoji', g.look_emoji, 'photo', g.photo_url,
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
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.look_color, 'emoji', g.look_emoji, 'photo', g.photo_url) order by r.created_at)
      from public.feed_group_requests r join public.feed_groups g on g.id = r.group_id
      where r.user_id = me.id), '[]'::jsonb))
  from me where me.id is not null;
$$;
revoke all on function public.my_feed_groups() from public, anon;
grant execute on function public.my_feed_groups() to authenticated;

-- Migration 67's feed_group_card, word for word, plus the look.
create or replace function public.feed_group_card(g uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp public.feed_groups;
begin
  if me is null then return null; end if;
  select * into grp from public.feed_groups where id = g;
  if grp.id is null then return null; end if;
  return jsonb_build_object(
    'id', grp.id,
    'name', grp.name,
    'description', grp.description,
    'ask', grp.ask_to_join,
    'color', grp.look_color,
    'emoji', grp.look_emoji,
    'photo', grp.photo_url,
    'members', (select count(*) from public.feed_group_members where group_id = g),
    'member', exists (select 1 from public.feed_group_members where group_id = g and user_id = me),
    'requested', exists (select 1 from public.feed_group_requests where group_id = g and user_id = me),
    'createdAt', grp.created_at);
end $$;
revoke all on function public.feed_group_card(uuid) from public, anon;
grant execute on function public.feed_group_card(uuid) to authenticated;

-- Migration 70's discover_groups, word for word, plus the look.
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
      g.look_color, g.look_emoji, g.photo_url,
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
      'member', r.member, 'requested', r.requested, 'near', r.near,
      'color', r.look_color, 'emoji', r.look_emoji, 'photo', r.photo_url)
    order by r.near desc, r.members desc, r.created_at desc, r.id), '[]'::jsonb)
  into result
  from ranked r;
  return result;
end $$;
revoke all on function public.discover_groups(text, int) from public, anon;
grant execute on function public.discover_groups(text, int) to authenticated;
