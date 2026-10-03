-- 73: a group's look (its colour, an emoji or its initials, or a photo),
-- starting a group in one go, and who you can invite to one.
--
-- NOT APPLIED — needs the owner's OK, and migrations 54 (is_own_media_url),
-- 64 (age_rule_budget), 67 (groups) and 70 (Find groups) first. Run it
-- BEFORE the app version that comes with it goes live: until it runs, that
-- app hides the Look part of Start a group (my_feed_groups says 'looks').
--
-- The new "Start a group" flow lets whoever starts a group give it a face,
-- the way a WhatsApp group or a Strava club has one:
--   * a colour, by name, never a hex value: the app turns the name into the
--     theme's own colour, so a group looks right on every theme
--     ('accent' is the theme's own green, the default);
--   * on that colour, one of the app's own 17 emoji, or (none chosen) the
--     group's initials;
--   * or a photo instead, uploaded to the media bucket in a folder named
--     after the GROUP (media/<group id>/<file>), never the admin's own
--     folder: a photo's address then says which group it belongs to and
--     nothing about who runs it, so Find groups and invite links (which show
--     the photo to adults who are not in the group) never give away a member
--     (migration 70's rule: "Never who is in it").
--
-- What it adds, and nothing more:
--   * feed_groups.look_color, look_emoji, photo_url, each with a rule the
--     table itself keeps, whoever writes it.
--   * Three storage rules: a group's admins (only they) may put a file in,
--     list, or take one out of the group's folder in the media bucket (20
--     new files a day per group).
--   * set_feed_group_look(g, color, emoji, photo): an admin sets all three
--     at once (null clears one).
--   * start_feed_group(name, description, ask, discoverable, color, emoji):
--     create_feed_group (67, unchanged) plus whether it shows in Find groups
--     and its colour and emoji, in one go, so a group asked to be hidden is
--     never listed even for a moment. A photo follows with set_feed_group_look
--     (it can only be uploaded once the group, and so its folder, exists).
--   * can_join_groups(ids): of the people you are about to invite, which can
--     join a group (known to be an adult). Never the age itself; the same
--     daily budget as open_to_you (migration 64).
--   * my_feed_groups, feed_group_card and discover_groups: as before, word
--     for word, plus 'color', 'emoji' and 'photo' on each group (and
--     'looks': true on my_feed_groups, so the app knows looks can be saved).
--
-- Who can do what:
--   * Only a group's admins change its look ('not_admin' for anyone else).
--   * A photo must be one file in the group's own folder ('bad_photo').
--   * A colour outside the list, or an emoji that is not one of the app's
--     own, is refused ('bad_look').
--
-- Safe to run more than once. Changes nobody's posts or memberships. A
-- value an earlier draft let in that these rules refuse is taken off.

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

-- Exactly the emoji the app offers (GROUP_EMOJI in src/features/groups/look.ts,
-- character for character), nothing else: no words in any alphabet, no
-- symbols, no invisible or right-to-left characters.
create or replace function public.feed_group_emoji_ok(e text)
returns boolean language sql immutable as $$
  select e is null or e in (
    U&'\+01F3BE', U&'\+01F3C6', U&'\+01F525', U&'\26A1\FE0F', U&'\2600\FE0F', U&'\+01F319',
    U&'\2615\FE0F', U&'\+01F37B', U&'\+01F3AF', U&'\+01F4AA', U&'\+01F334', U&'\+01F3D9\FE0F',
    U&'\+01F981', U&'\+01F410', U&'\2B50\FE0F', U&'\+01F947', U&'\+01F32E');
$$;
revoke all on function public.feed_group_emoji_ok(text) from public, anon, authenticated;

-- The rules are put on afresh each run; a value an earlier draft let in that
-- they would refuse (a photo in an admin's own folder, say) is taken off first.
alter table public.feed_groups drop constraint if exists feed_groups_look_color_ok;
alter table public.feed_groups drop constraint if exists feed_groups_look_emoji_ok;
alter table public.feed_groups drop constraint if exists feed_groups_photo_own_media;
update public.feed_groups set look_color = null where not public.feed_group_color_ok(look_color);
update public.feed_groups set look_emoji = null where not public.feed_group_emoji_ok(look_emoji);
update public.feed_groups set photo_url = null where photo_url is not null and not public.is_own_media_url(photo_url, id);
alter table public.feed_groups add constraint feed_groups_look_color_ok check (public.feed_group_color_ok(look_color));
alter table public.feed_groups add constraint feed_groups_look_emoji_ok check (public.feed_group_emoji_ok(look_emoji));
alter table public.feed_groups add constraint feed_groups_photo_own_media check (photo_url is null or public.is_own_media_url(photo_url, id));

-- ============================================================ 2. the group's folder

-- Whether a file in the media bucket ("<group id>/<file name>") is in the
-- folder of a group you are an admin of: one plain file name, no further
-- folder, no "..". Anyone signed in may ask (the storage rules below do,
-- as the person uploading); it says yes or no about your own groups only.
create or replace function public.feed_group_photo_path_ok(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or path is null or char_length(path) > 200 or position('..' in path) > 0
     or path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_+-][A-Za-z0-9._+-]*$' then
    return false;
  end if;
  return public.is_feed_group_admin(split_part(path, '/', 1)::uuid, me);
end $$;
revoke all on function public.feed_group_photo_path_ok(text) from public, anon;
grant execute on function public.feed_group_photo_path_ok(text) to authenticated;

-- Each names only the media shelf's group folders, so every other rule on
-- the shelf (your own folder: migrations 01 and 36) is untouched. As there:
-- a group's admins can list its folder (no one else can; the photo's public
-- address still works for everyone), and at most 20 new files a day go
-- into one group's folder.
drop policy if exists "group admins list group photos" on storage.objects;
create policy "group admins list group photos" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.feed_group_photo_path_ok(name));
drop policy if exists "group admins add group photos" on storage.objects;
create policy "group admins add group photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.feed_group_photo_path_ok(name)
    and (select count(*) from storage.objects o
         where o.bucket_id = 'media' and o.name like split_part(objects.name, '/', 1) || '/%' and o.created_at > now() - interval '1 day') < 20
  );
drop policy if exists "group admins remove group photos" on storage.objects;
create policy "group admins remove group photos" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.feed_group_photo_path_ok(name));

-- ============================================================ 3. setting it

create or replace function public.set_feed_group_look(g uuid, p_color text default null, p_emoji text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if not public.feed_group_color_ok(v_color) or not public.feed_group_emoji_ok(v_emoji) then
    raise exception 'bad_look';
  end if;
  -- Only a file in this group's own folder (section 2).
  if v_photo is not null and not public.is_own_media_url(v_photo, g) then
    raise exception 'bad_photo';
  end if;
  update public.feed_groups
    set look_color = v_color, look_emoji = v_emoji, photo_url = v_photo
    where id = g;
end $$;
revoke all on function public.set_feed_group_look(uuid, text, text, text) from public, anon;
grant execute on function public.set_feed_group_look(uuid, text, text, text) to authenticated;

-- A new group with everything the Start a group form asks, in one go:
-- migration 67's create_feed_group (its rules: adults only, 3 groups each,
-- 5 new a day), then whether it shows in Find groups and its colour and
-- emoji, all or nothing. A look it would refuse stops it before it is made.
create or replace function public.start_feed_group(p_name text, p_description text default null, p_ask boolean default false,
  p_discoverable boolean default true, p_color text default null, p_emoji text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.feed_group_color_ok(v_color) or not public.feed_group_emoji_ok(v_emoji) then
    raise exception 'bad_look';
  end if;
  v_id := public.create_feed_group(p_name, p_description, p_ask);
  update public.feed_groups
    set discoverable = coalesce(p_discoverable, true), look_color = v_color, look_emoji = v_emoji
    where id = v_id;
  return v_id;
end $$;
revoke all on function public.start_feed_group(text, text, boolean, boolean, text, text) from public, anon;
grant execute on function public.start_feed_group(text, text, boolean, boolean, text, text) to authenticated;

-- ============================================================ 4. who you can invite

-- Of these people (up to 100), which can join a group: known to be an adult
-- (migration 64's known_adult). Never the age itself. Asked only by someone
-- who can use groups, about people they are about to invite; it counts
-- against the same 300-a-day budget as open_to_you (age_rule_budget), and
-- anyone past it, anyone you are blocked with, and anyone gone is left out
-- (the app then treats them as unable to join, and the server's own check
-- decides if they try).
create or replace function public.can_join_groups(ids uuid[])
returns table (user_id uuid, ok boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  asked uuid[];
begin
  if me is null or not public.known_adult(me) then return; end if;
  asked := public.age_rule_budget((coalesce(ids, '{}'))[1:100]);
  return query
    select p.id, public.known_adult(p.id)
    from public.profiles p
    where p.id = any (asked) and not public.is_blocked_between(me, p.id);
end $$;
revoke all on function public.can_join_groups(uuid[]) from public, anon;
grant execute on function public.can_join_groups(uuid[]) to authenticated;

-- ============================================================ 5. reading it

-- Migration 70's my_feed_groups, word for word, plus the look.
create or replace function public.my_feed_groups()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    -- Looks can be saved here (this migration has run): the app shows the Look part.
    'looks', true,
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
