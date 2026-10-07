-- CourtSide · migration 149: groups are for everyone.
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once.
--
-- The owner's change (Oct 6): "Groups can be for anyone." Until now the
-- Feed's groups (migration 67: the group tabs on the Feed, Find groups, a
-- group's page) were for adults only: someone not known to be an adult (a
-- teen, or an account with no birthday yet) could not start, join or ask to
-- join one, an admin's yes could not let them in, Find groups showed them
-- nothing, and a group's feed left out every post by a teen. From here
-- anyone signed in can do all of it, teens included.
--
-- What changes, by name (each is the newest version in the repo, with only
-- the age rule taken out):
--   * create_feed_group (67): no 'adults_only'. start_feed_group (73) calls
--     it, so starting a group from the app follows.
--   * join_feed_group (67): no 'adults_only'.
--   * answer_feed_group_request (67): no 'their_age'; an admin's yes lets
--     anyone in.
--   * discover_groups (73): lists groups for everyone. "Near you" now counts
--     only members known to be adults, so a teen's town never makes a group
--     show as near you (a teen's whereabouts stay hidden from strangers).
--   * can_join_groups (73): everyone can join, so it says yes for each
--     person you are not blocked with. It no longer looks at anyone's age,
--     so it no longer counts against the daily age-question limit.
--   * group_feed (74): no 'adults_only', and a teen member's posts show in
--     the group's feed under exactly the rules they show anywhere else: a
--     private account's ordinary posts only to members who follow them,
--     anything shared to the group only to its members.
--
-- What does NOT change (every other teen rule stays as it is):
--   * Being in a group together opens no chat. Starting a chat with a teen,
--     adding a teen to a group CHAT, tagging a teen on a session and joining
--     a teen's hit still need the teen to follow you (open_conversation,
--     group_fits, tag_session, join_hit: none of them reads groups).
--   * A teen's map spot, court check-ins and hits stay hidden from strangers
--     (shows_at_court, spot_shown_to, "hits are visible" all ask known_adult
--     and follows, never groups). A hit shared with "My groups" still
--     reaches only the people those rules already let see it.
--   * Strangers' tags and words never reach a teen's phone (file_notification).
--   * Nobody is in more than 3 groups (feed_group_cap), 5 new groups a day,
--     10 open requests: unchanged.
--
-- Needs migrations 67, 70, 73 and 74 first. Checked below by md5 of each
-- function's body: as those files leave it, or as this file leaves it. If
-- one has changed since, this stops before changing anything.

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
declare
  -- name, as 67/73/74 leave it, as this file leaves it
  expected constant text[][] := array[
    ['create_feed_group',         'cae211899ddc3430bf14f2d9f16ec73d', '71b6ef39dfc8a3b0adcecc4a2de534cf'],
    ['join_feed_group',           'de8967754e5e78c71c91521f54006370', '7eebd2b13d91317babde2e5de933b4a7'],
    ['answer_feed_group_request', '20f6166b24b99d8228e02dfa6ac4a1c7', '438f58aa195753a3dd7f649d6f5d958b'],
    ['discover_groups',           '249a39fb9b4baf28b375bab0953be565', '3d3b63458e28449206b4973dde9e77a9'],
    ['can_join_groups',           '07d9b2bffc03cb831f3e608e429c5bc3', '5183296350986107e4f7be6a9211474c'],
    ['group_feed',                '144aee5a87cd1690029ae87fd49ede9b', '3771d68a8983b7ccba53ed488dd3ff72']
  ];
  i int;
  wrong text[] := '{}';
begin
  if to_regclass('public.feed_groups') is null or to_regclass('public.feed_group_members') is null
     or to_regclass('public.feed_group_requests') is null or to_regclass('public.feed_group_removals') is null
     or to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.can_view(uuid)') is null then
    raise exception 'Migration 149 stopped before changing anything: migrations 60, 67, 70, 73 and 74 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]) <> 1
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 149 stopped before changing anything: % is not as this file expects (run 67, 73 and 74 first; or it changed after Oct 3, and this file must be brought up to date with that change first).', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------- 1. starting a group
-- Migration 67's create_feed_group, word for word, without 'adults_only'.
create or replace function public.create_feed_group(p_name text, p_description text default null, p_ask boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := public.clean_group_text(p_name, 40);
  v_id uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'name_needed'; end if;
  perform public.lock_feed_groups_of(me);
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;
  if (select count(*) from public.feed_groups where created_by = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'slow_down';
  end if;
  insert into public.feed_groups (name, description, ask_to_join, created_by)
    values (v_name, public.clean_group_text(p_description, 140), coalesce(p_ask, false), me)
    returning id into v_id;
  insert into public.feed_group_members (group_id, user_id, role) values (v_id, me, 'admin');
  return v_id;
end $$;
revoke all on function public.create_feed_group(text, text, boolean) from public, anon;
grant execute on function public.create_feed_group(text, text, boolean) to authenticated;

-- ------------------------------------------------------- 2. joining a group
-- Migration 67's join_feed_group, word for word, without 'adults_only'.
create or replace function public.join_feed_group(g uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp public.feed_groups;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into grp from public.feed_groups where id = g;
  if grp.id is null then raise exception 'not_found'; end if;
  perform public.lock_feed_groups_of(me);
  if exists (select 1 from public.feed_group_members where group_id = g and user_id = me) then return 'already'; end if;
  if public.feed_group_count(me) >= public.feed_group_cap() then raise exception 'group_limit'; end if;
  if grp.ask_to_join or exists (select 1 from public.feed_group_removals where group_id = g and user_id = me) then
    if not exists (select 1 from public.feed_group_requests where group_id = g and user_id = me)
       and (select count(*) from public.feed_group_requests where user_id = me) >= 10 then
      raise exception 'slow_down';
    end if;
    insert into public.feed_group_requests (group_id, user_id) values (g, me) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.feed_group_members (group_id, user_id) values (g, me);
  delete from public.feed_group_requests where group_id = g and user_id = me;
  return 'joined';
end $$;
revoke all on function public.join_feed_group(uuid) from public, anon;
grant execute on function public.join_feed_group(uuid) to authenticated;

-- ------------------------------------------------- 3. an admin letting someone in
-- Migration 67's answer_feed_group_request, word for word, without 'their_age'.
create or replace function public.answer_feed_group_request(g uuid, who uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_feed_group_admin(g, me) then raise exception 'not_admin'; end if;
  if not exists (select 1 from public.feed_group_requests where group_id = g and user_id = who) then return; end if;
  if not coalesce(accept, false) then
    delete from public.feed_group_requests where group_id = g and user_id = who;
    return;
  end if;
  perform public.lock_feed_groups_of(who);
  if public.feed_group_count(who) >= public.feed_group_cap() then raise exception 'their_limit'; end if;
  insert into public.feed_group_members (group_id, user_id) values (g, who) on conflict do nothing;
  delete from public.feed_group_requests where group_id = g and user_id = who;
  delete from public.feed_group_removals where group_id = g and user_id = who;
end $$;
revoke all on function public.answer_feed_group_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.answer_feed_group_request(uuid, uuid, boolean) to authenticated;

-- ------------------------------------------------------------ 4. Find groups
-- Migration 73's discover_groups, word for word, without the adults-only
-- empty list, and with "near you" read from adult members only.
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
      -- (149) Near you: an adult member's town only. A teen's never counts,
      -- so it can never tell a stranger roughly where a teen lives.
      (my_lat is not null and my_lng is not null and exists (
        select 1 from public.feed_group_members m join public.profiles p on p.id = m.user_id
        where m.group_id = g.id and m.user_id <> me
          and p.city_lat is not null and p.city_lng is not null
          and abs(p.city_lat - my_lat) < 0.55
          and abs(p.city_lng - my_lng) * cos(radians(my_lat)) < 0.55
          and public.known_adult(m.user_id))) as near
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

-- -------------------------------------------------------- 5. who you can invite
-- Migration 73's can_join_groups: everyone can join a group now, so it says
-- yes for each of these people (up to 100) you are not blocked with, and
-- never asks anyone's age. App versions from before Oct 6 still ask it
-- before Invite; newer ones don't.
create or replace function public.can_join_groups(ids uuid[])
returns table (user_id uuid, ok boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select p.id, true
    from public.profiles p
    where p.id = any ((coalesce(ids, '{}'))[1:100]) and not public.is_blocked_between(me, p.id);
end $$;
revoke all on function public.can_join_groups(uuid[]) from public, anon;
grant execute on function public.can_join_groups(uuid[]) to authenticated;

-- ------------------------------------------------------------ 6. a group's feed
-- Migration 74's group_feed, word for word, without 'adults_only', and with
-- a teen member's posts in it like anyone's.
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
  return query
    select p.id, p.created_at
    from public.posts p
    join public.feed_group_members m on m.group_id = g and m.user_id = p.author_id
    where (p.group_id is null or p.group_id = g)
      and not p.archived
      and p.removed_at is null
      and (before is null or p.created_at < before)
      and (p.author_id = me
           or (not public.is_blocked_between(me, p.author_id)
               -- An ordinary post: only if you could see it anyway (a public
               -- account, one you follow, or one you are tagged in), a
               -- teen's the same as anyone's (149).
               and (p.group_id = g or public.can_view(p.author_id) or me = any(p.tagged_user_ids)
                    or (p.session->'with') @> jsonb_build_array(jsonb_build_object('id', me)))))
    order by p.created_at desc, p.id desc
    limit n;
end $$;
revoke all on function public.group_feed(uuid, timestamptz, int) from public, anon;
grant execute on function public.group_feed(uuid, timestamptz, int) to authenticated;

-- ------------------------------------------------------------- 7. made as written
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and ((p.proname = 'create_feed_group' and md5(p.prosrc) <> '71b6ef39dfc8a3b0adcecc4a2de534cf')
               or (p.proname = 'join_feed_group' and md5(p.prosrc) <> '7eebd2b13d91317babde2e5de933b4a7')
               or (p.proname = 'answer_feed_group_request' and md5(p.prosrc) <> '438f58aa195753a3dd7f649d6f5d958b')
               or (p.proname = 'discover_groups' and md5(p.prosrc) <> '3d3b63458e28449206b4973dde9e77a9')
               or (p.proname = 'can_join_groups' and md5(p.prosrc) <> '5183296350986107e4f7be6a9211474c')
               or (p.proname = 'group_feed' and md5(p.prosrc) <> '3771d68a8983b7ccba53ed488dd3ff72'))) then
    raise exception 'Migration 149 stopped: it did not come out as written. Nothing was changed.';
  end if;
end $$;

commit;

-- Checks afterwards (each should say what is in brackets):
-- select proname, md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('create_feed_group', 'join_feed_group', 'answer_feed_group_request', 'discover_groups', 'can_join_groups', 'group_feed');
--   (create_feed_group 71b6ef39dfc8a3b0adcecc4a2de534cf · join_feed_group 7eebd2b13d91317babde2e5de933b4a7
--    answer_feed_group_request 438f58aa195753a3dd7f649d6f5d958b · discover_groups 3d3b63458e28449206b4973dde9e77a9
--    can_join_groups 5183296350986107e4f7be6a9211474c · group_feed 3771d68a8983b7ccba53ed488dd3ff72)
-- Then, in a transaction you undo (begin; … rollback;), signed in as a teen
-- account: discover_groups() lists groups; join_feed_group(<an open group>)
-- says 'joined'; create_feed_group('Test') makes one; a fourth group still
-- says 'group_limit'. As an adult stranger in that group: open_conversation
-- with the teen still says teen_closed, and the teen's map spot still reads
-- as nothing.
