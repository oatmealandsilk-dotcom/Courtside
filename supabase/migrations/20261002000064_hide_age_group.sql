-- 64: the age on file stops being public, and a minor's hits stop reaching strangers.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Apply it only after the app version that comes with it has
-- reached most phones (the website and the instant update): see "Old
-- phones" below.
--
-- The problems (found in review, Oct 2):
--   1. Every profile row carried age_group ('teen' or 'adult'), and profile
--      rows are public, so anyone, even someone not signed in, could ask the
--      database for the list of teen accounts.
--   2. Every signed-in account could read every open hit, a minor's
--      included, with the court and the time. Hiding a minor's hits from
--      strangers was done only by the app, so anyone reading the database
--      directly (or the live-update feed) got them.
--
-- What it does:
--
--   * Your age group moves next to your birthday, into your own settings row
--     (user_state.age_group), which only you can read. Nobody can write it
--     but set_birth_date, the same as the birthday itself.
--   * profiles.age_group is copied across and then removed, in the same run.
--   * Every server rule that needs someone's age asks one helper,
--     known_adult(id), which only the server can call. The teen rules
--     themselves are unchanged: teens still only get new chats, group adds
--     and session tags from people they follow; the map still shows a spot
--     only adult to adult (and as each person chose); court and hit alerts
--     still go only to and from adults; a teen's posts still carry no heart
--     rate; New on CourtSide lists the same people.
--   * Open hits: the database itself now sends a hit only to its poster,
--     people who joined it, people who follow the poster, and (for a poster
--     known to be an adult) everyone else signed in. The same for who joined
--     a hit: someone not known to be an adult shows in "who's in" only to
--     the poster, the others in that hit, and people who follow them. This
--     is the rule the app already applied on screen; now it holds for every
--     reader, live updates included.
--   * Three yes/no questions the app may ask, never the age itself, and only
--     about people (or posts) it is about to show:
--       open_to_you(ids): may you start a chat with each of them (or add
--         them to a group, or tag them);
--       shown_at_court(post ids): which of these posts may show on a court's
--         page for you;
--       session_tag_refusal(id) (already there since 62).
--     Each counts how many different people you have asked about: 300 a day
--     at most. Past that, the answer is "no answer" (the app then lets you
--     try, and the server's own check decides when you act).
--
-- What this does NOT hide (said plainly, because the rules themselves give
-- it away): anyone signed in can still learn that a particular account is
-- "not known to be an adult" (a teen, or no birthday given), one person at a
-- time, because the teen rules have visible effects:
--   * the lock on a teen's Message button, and the same answer from
--     open_to_you, session_tag_refusal, or just trying to start a chat, add
--     them to a group, tag them or join their hit;
--   * a post by a teen with a court on it, missing from that court's page;
--   * New on CourtSide leaving someone out who joined recently;
--   * the public "private account" switch, which a teen's account starts
--     with on.
-- The daily limit stops anyone sweeping the whole member list in one go;
-- with 19 accounts today it does not stop someone patient. Fully hiding it
-- needs a product change (for example letting adults also choose "messages
-- only from people I follow", so a lock no longer means "teen").
--
-- Old phones: every app version ever shipped reads profiles with select *,
-- never naming age_group (checked back to the first commit that added it),
-- so an older app keeps loading normally. But it can no longer see its own
-- age either, so until it takes the update it treats its own account as a
-- teen's (no map, no court check-in, Message locked for people who don't
-- follow you, no push alerts) and, on a phone that never answered before,
-- asks for the birthday again, where a mistyped year under 13 deletes the
-- account. Nothing on the database side can give an old app its own age
-- back without giving it everyone's. So: publish the app first, wait until
-- most phones have opened it twice, then run this.
--
-- Safe to run more than once. Written against migrations 1–63 as they are
-- live; it checks that every function it replaces is still exactly as 63
-- (or this file) left it, and stops without changing anything if not.
-- After this runs, do not re-run older migration files (13, 36, 43, 46, 53,
-- 54, 55, 58, 60, 62, 63 put the old column's reads or the old hit rules
-- back); if one ever is, run this again.

begin;

-- ------------------------------------------------------------------ 0. check
-- Every function this file replaces must still be exactly as 63 left it, or
-- exactly as this file leaves it (a re-run). md5 of each function's body.
do $$
declare
  expected constant text[][] := array[
    -- name, as 63 left it (live, Oct 2), as 64 leaves it
    ['court_facts', '4072f6fc09fceb91cbf7e52e21ec44e2', 'ecb4b7d9a2f7aa64700494026786b79c'],
    ['court_right_now', '5f2b17585528751df92cbec7fa8b9f5c', 'eafcfcfa02c39c05a54ccbbc4c7de2bf'],
    ['fill_post_session_stats', 'e8312c41b2f36aa72ffa714a1857ede6', '29ce26bf1b7ed4b7b6dfe37472dc8cfd'],
    ['group_fits', 'c8d90a805e38127aefb4a450437a010e', '90b0612351c4065b10de428561cf5d26'],
    ['join_hit', 'd0bf6d07351541e2de9b177aa706540e', 'ea2ade2c4cbf6d9de9e73a3905f3b17e'],
    ['known_adult', '4b04546086eb0bbb13aa77f8e2bf1633', 'a79e745befd4374ea124ccf1692145a2'],
    ['new_on_courtside', '646774b73f53a89f0a5628a137ced848', '2239944b413b30b0c54ce850b090b7a0'],
    ['notify_joined_nearby', '0ae17dc06ac1423bc53ee676c66bf6a1', 'b8ca4082a343d262557abbc1fc79cc37'],
    ['open_conversation', 'c0dc9c7dc3510b1af1293ed37fc97ec0', '68ddc8d79c07cba87d06772f21cdef13'],
    ['players_court_access', 'bc7cf203fb9b04df69e23f7d034a93e0', '57b63584e688790a6fa05884eb5abbf0'],
    ['session_tag_refusal', '76451c55e05b5ed3a556ab5f939e708f', '4abbe6cb3ff33f3955e20d9614c27e08'],
    ['session_tag_refusal_for', '4ae6cb474a22fb68a104c4fb6cf53bc9', 'a44555790bb45553cfeb69e1634e4f52'],
    ['set_birth_date', '2318bb8d966d8c049109846a8669de36', 'b9763abefa6a5fe7d5ad8e465fdced3a'],
    ['shows_at_court', 'f9bd9fd13991a4c4889c3a2eca26cc8f', 'b325f768cd4001366038723b73c94fbd'],
    ['tell_adults_new_player', '8f40c093675ea2993573b366c8c22faf', '23900e6aa0a7e3ff561f27c64c397c83'],
    ['tell_court_about_post', '9e88cff0ed2438f16da0798018e2b891', '7974938b1e6fa71d0c81ca8fc202efda'],
    ['tell_followers_up_for_hit', '44c1763f06869fd627732ea407645938', 'b72440b06c45afe6dd3ea4667796798a'],
    ['tell_hit_matches', '500ad845afc6ce9098aac49de8390c00', 'a24e59d69b3f61ae8208dfc2743621f2'],
    ['tell_map_about_hit', '32b43cb0ae0a80e25d6dfc1c08708494', '281db33a3247e05422be20ffe41a6f62']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  -- 63 must be in (its "who sees a spot" rule and settings sync are rewritten or held off below).
  if to_regprocedure('public.spot_shown_to(uuid, uuid)') is null or to_regprocedure('public.sync_spot_settings()') is null then
    raise exception 'Migration 64 stopped before changing anything: migration 63 (the map, round 2) has to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 64 stopped before changing anything: % changed after migration 63. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------- 1. where the age lives from now on
alter table public.user_state add column if not exists age_group text check (age_group in ('teen', 'adult'));

-- Like the birthday beside it: only set_birth_date (which switches
-- courtside.age_check on for the moment it writes) can put a value here. A
-- new settings row starts with none; an edit keeps whatever was there.
create or replace function public.guard_state_age_group()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.age_check', true), '') <> 'on' then
    if tg_op = 'UPDATE' then new.age_group := old.age_group;
    else new.age_group := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_state_age_group() from public, anon, authenticated;
drop trigger if exists guard_state_age_group on public.user_state;
create trigger guard_state_age_group before insert or update on public.user_state
  for each row execute function public.guard_state_age_group();

-- Copy every age across (only while the old column is still there). Someone
-- with no settings row yet gets one. Two triggers on settings rows would
-- read that new row's defaults as choices just made: the block list's
-- (sync_blocks, migration 21: "no blocks", clearing theirs) and the map's
-- (sync_spot_settings, migration 63). Both are held off for this one copy,
-- inside this run only; nothing but the age is written.
do $$
declare
  blocks_sync boolean := exists (select 1 from pg_trigger where tgname = 'sync_blocks' and tgrelid = 'public.user_state'::regclass);
  spot_sync boolean := exists (select 1 from pg_trigger where tgname = 'sync_spot_settings' and tgrelid = 'public.user_state'::regclass);
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group') then
    if blocks_sync then execute 'alter table public.user_state disable trigger sync_blocks'; end if;
    if spot_sync then execute 'alter table public.user_state disable trigger sync_spot_settings'; end if;
    perform set_config('courtside.age_check', 'on', true);
    execute $copy$
      insert into public.user_state (user_id, age_group)
        select p.id, p.age_group from public.profiles p where p.age_group in ('teen', 'adult')
        on conflict (user_id) do update set age_group = excluded.age_group
          where public.user_state.age_group is distinct from excluded.age_group
    $copy$;
    perform set_config('courtside.age_check', 'off', true);
    if blocks_sync then execute 'alter table public.user_state enable trigger sync_blocks'; end if;
    if spot_sync then execute 'alter table public.user_state enable trigger sync_spot_settings'; end if;
  end if;
end $$;

-- -------------------------------------------------- 2. the one server-side helper
-- Whether someone is known to be an adult. A teen, or an account with no
-- birthday given yet, is not. Server only: the app can never call it.
create or replace function public.known_adult(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select age_group = 'adult' from public.user_state where user_id = u), false)
$$;
revoke all on function public.known_adult(uuid) from public, anon, authenticated;

-- ---------------------------------------------------- 3. your birthday, once
-- As before (migrations 13 and 36), but the label is kept in your own
-- settings row instead of on your public profile.
create or replace function public.set_birth_date(dob date)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  stored date;
  had text;
  years int;
  label text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select birth_date, age_group into stored, had from public.user_state where user_id = me;
  if stored is null then
    if dob is null or dob > current_date or dob < date '1900-01-01' then raise exception 'bad date'; end if;
    stored := dob;
  end if;
  years := extract(year from age(current_date, stored))::int;
  if years < 13 then
    raise exception 'under_13';
  end if;
  label := case when years < 18 then 'teen' else 'adult' end;
  perform set_config('courtside.age_check', 'on', true);
  insert into public.user_state (user_id, birth_date, age_group) values (me, stored, label)
    on conflict (user_id) do update set birth_date = coalesce(public.user_state.birth_date, excluded.birth_date),
                                        age_group = excluded.age_group;
  perform set_config('courtside.age_check', 'off', true);
  -- A teen account starts private the first time; after that it is the teen's choice.
  if label = 'teen' and had is null then
    update public.profiles set is_private = true where id = me;
  end if;
  return label;
end $$;

-- ------------------------------------------- 4. every rule that needs an age
-- Each is exactly as before but for where the age is read.

-- Chats (migrations 13, 36, 54).
create or replace function public.open_conversation(other uuid, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_id uuid;
begin
  if me is null or other is null or other = me then raise exception 'bad participants'; end if;
  select cm.conversation_id into found_id
    from public.conversation_members cm
    join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = other
    where cm.user_id = me
      and (select count(*) from public.conversation_members x where x.conversation_id = cm.conversation_id) = 2
      and not exists (select 1 from public.conversations c where c.id = cm.conversation_id and c.is_group)
    limit 1;
  if found_id is not null then return found_id; end if;
  if public.is_blocked_between(me, other) then
    raise exception 'blocked';
  end if;
  -- Anyone not known to be an adult gets the teen protection: they must follow you first.
  if exists (select 1 from public.profiles where id = other) and not public.known_adult(other)
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;

-- Groups (migration 54).
create or replace function public.group_fits(adder uuid, members uuid[], newcomers uuid[])
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n, unnest(coalesce(members, '{}') || coalesce(newcomers, '{}')) m
    where m <> n and public.is_blocked_between(n, m)
  ) then
    return 'blocked';
  end if;
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n
    join public.profiles p on p.id = n
    where n <> adder and not public.known_adult(n)
      and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder)
  ) then
    return 'teen_closed';
  end if;
  return null;
end $$;

-- Hits (migrations 43, 54).
create or replace function public.join_hit(hit uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  taken int;
  conv uuid;
  label text;
  in_chat uuid[];
  fits text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.cancelled then raise exception 'That hit is no longer on.'; end if;
  if h.author_id = me then raise exception 'That is your own hit.'; end if;
  if h.starts_at < now() - interval '1 hour' then raise exception 'That hit has already happened.'; end if;
  if public.is_blocked_between(me, h.author_id) then raise exception 'blocked'; end if;
  -- Teen protection, as in chats: a player not known to be an adult only plays with people who follow each other.
  if (exists (select 1 from public.profiles p where p.id in (me, h.author_id) and not public.known_adult(p.id)))
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    raise exception 'teen_closed';
  end if;
  if exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return h.conversation_id; end if;
  select count(*) into taken from public.hit_joins where hit_id = hit;
  if taken >= h.spots then raise exception 'That hit is full.'; end if;
  conv := h.conversation_id;
  if conv is not null then
    perform 1 from public.conversations where id = conv for update;
    select coalesce(array_agg(user_id), '{}') into in_chat from public.conversation_members where conversation_id = conv;
    if not (me = any (in_chat)) then
      if exists (select 1 from public.conversation_removals r where r.conversation_id = conv and r.user_id = me) then
        raise exception 'removed';
      end if;
      if cardinality(in_chat) >= public.group_cap() then raise exception 'That hit is full.'; end if;
      fits := public.group_fits(h.author_id, in_chat, array[me]);
      if fits is not null then raise exception '%', fits; end if;
    end if;
  end if;
  insert into public.hit_joins (hit_id, user_id) values (hit, me);
  if conv is null then
    label := 'Hit · ' || coalesce(h.place->>'name', 'Court');
    insert into public.conversations (title, is_group, created_by) values (left(label, 60), true, h.author_id) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id, role) values (conv, h.author_id, 'admin'), (conv, me, 'member') on conflict do nothing;
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set conversation_id = conv where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  else
    insert into public.conversation_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
  end if;
  -- The line is skipped rather than refusing the join (a suspended account
  -- cannot write it, nor can someone over the 30-messages-a-minute limit).
  begin
    perform public.post_group_event(conv, me, 'joined');
  exception when others then
    null;
  end;
  perform public.file_notification(h.author_id, me, 'hit-join', hit::text, 'hit-request', coalesce(h.place->>'name', 'your hit'), false);
  return conv;
end $$;

-- Session tags (migration 62).
create or replace function public.session_tag_refusal_for(tagger uuid, who uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when tagger is null then 'signed_out'
    when who is null or not exists (select 1 from public.profiles where id = who) then 'missing'
    when who = tagger then 'self'
    when exists (select 1 from public.profiles where id = tagger and suspended_at is not null) then 'suspended'
    when public.is_blocked_between(tagger, who) then 'blocked'
    -- Teen protection, as for a new chat: someone not known to be an adult must follow you first.
    when not public.known_adult(who)
         and not exists (select 1 from public.follows where follower_id = who and following_id = tagger) then 'teen_closed'
    else null end
$$;

-- Heart rate on a tracked session's post: adults only (migration 58).
create or replace function public.fill_post_session_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_a public.detected_activities; v_adult boolean; v_src text; v_s jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' and old.session is not null and jsonb_typeof(old.session) = 'object'
     and (new.session - 'with') is not distinct from (old.session - 'with') then
    -- Nothing changed but (at most) the list: keep the stats, work the list out again.
    if new.session is distinct from old.session then new.session := public.put_session_with(new.session, new.author_id); end if;
    if new.session ? 'activityId' then new.feature_ok := false; end if;
    return new;
  end if;
  if pg_column_size(new.session) > 4000 then raise exception 'session too large'; end if;
  if not (new.session ? 'activityId') then
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  v_adult := public.known_adult(new.author_id);
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', 'Tennis', 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
  if v_adult and new.session ? 'maxHr' then v_s := v_s || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr)); end if;
  if (new.session->>'intensity') in ('1', '2', '3', '4', '5') then v_s := v_s || jsonb_build_object('intensity', (new.session->>'intensity')::int); end if;
  new.session := public.put_session_with(v_s, new.author_id);
  new.feature_ok := false;
  return new;
end $$;

-- "Someone near you joined": only adults hear, only about adults (migration 46).
create or replace function public.notify_joined_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare city text;
begin
  if coalesce(old.location, '') <> '' or coalesce(new.location, '') = '' then return new; end if;
  if new.created_at < now() - interval '14 days' then return new; end if;
  if not public.known_adult(new.id) then return new; end if;
  city := lower(trim(split_part(new.location, ',', 1)));
  if char_length(city) < 2 then return new; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
  select p.id, new.id, 'joined', new.id::text, 'profile', new.location
  from public.profiles p
  where p.id <> new.id
    and public.known_adult(p.id)
    and lower(trim(split_part(p.location, ',', 1))) = city
    and not public.is_blocked_between(p.id, new.id)
  order by p.created_at desc
  limit 50;
  return new;
end $$;

-- Courts (migration 60): what players say about a court counts only from adults,
-- who is on court shows only adults, and only to adults.
create or replace function public.court_facts(ids text[])
returns table (court_id text, players int, lights_yes int, lights_no int, nets_good int, nets_bad int,
  surface_good int, surface_cracked int, surface_wet int, busy jsonb, busy_answers int, busy_never int, notes jsonb,
  access text, access_by text, fee boolean, indoor boolean, book_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  said as (
    select v.* from public.court_reviews v
    where v.court_id in (select id from wanted) and v.updated_at > now() - interval '18 months'
      and (v.lights is not null or v.nets is not null or v.surface is not null or v.busy is not null or v.access is not null or v.notes is not null)
  )
  select c.id,
    coalesce(t.players, 0), coalesce(t.lights_yes, 0), coalesce(t.lights_no, 0), coalesce(t.nets_good, 0), coalesce(t.nets_bad, 0),
    coalesce(t.surface_good, 0), coalesce(t.surface_cracked, 0), coalesce(t.surface_wet, 0),
    coalesce(b.busy, '{}'::jsonb), coalesce(t.busy_answers, 0), coalesce(t.busy_never, 0), coalesce(n.notes, '[]'::jsonb),
    c.access, c.access_by, c.fee, c.indoor, c.book_url, t.last
  from public.courts c
  left join lateral (
    select count(*)::int as players,
      count(*) filter (where s.lights)::int as lights_yes, count(*) filter (where not s.lights)::int as lights_no,
      count(*) filter (where s.nets = 'good')::int as nets_good, count(*) filter (where s.nets = 'bad')::int as nets_bad,
      count(*) filter (where s.surface = 'good')::int as surface_good, count(*) filter (where s.surface = 'cracked')::int as surface_cracked,
      count(*) filter (where s.surface = 'wet-prone')::int as surface_wet,
      count(*) filter (where s.busy is not null)::int as busy_answers,
      count(*) filter (where cardinality(s.busy) = 0)::int as busy_never, max(s.updated_at) as last
    from said s where s.court_id = c.id) t on true
  left join lateral (
    select jsonb_object_agg(part, k) as busy from (
      select part, count(*)::int as k from said s, unnest(s.busy) as part where s.court_id = c.id group by part) x) b on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('text', y.notes, 'on', y.updated_at::date) order by y.updated_at desc) as notes from (
      select s.notes, s.updated_at from said s
      where s.court_id = c.id and s.notes is not null and public.known_adult(s.user_id) order by s.updated_at desc limit 3) y) n on true
  where c.id in (select id from wanted)
$$;

create or replace function public.players_court_access(court text, osm text)
returns text language sql stable security definer set search_path = public as $$
  with said as (
    select v.access, v.updated_at from public.court_reviews v
    where v.court_id = court and v.access is not null and v.updated_at > now() - interval '18 months'
      and public.known_adult(v.user_id)
      and (v.access not in ('members', 'private') or (
        select count(*) from public.court_reviews w
        where w.user_id = v.user_id and w.access in ('members', 'private') and w.updated_at > now() - interval '18 months'
          and (w.updated_at, w.court_id) < (v.updated_at, v.court_id)) < 5)
  ), votes as (
    select access, count(*)::int as n, max(updated_at) as last from said group by access
  ), need as (select case when osm in ('public', 'pay') then 2 else 1 end as close),
  top as (select access, n from votes order by n desc, last desc limit 1),
  -- The players' closed answer, only once enough of them said it to stand.
  closed as (select v.access from votes v, need where v.access in ('members', 'private') and v.n >= need.close order by v.n desc, v.last desc limit 1)
  select case
    when (select access from top) is null then null
    when (select access from top) in ('public', 'pay') and (select n from top) < 2
         and (osm in ('members', 'private') or exists (select 1 from closed))
      then (select access from closed)
    when (select access from top) in ('members', 'private') and (select n from top) < (select close from need) then null
    else (select access from top) end
$$;

-- Migration 63's "right now at these courts" (who can see you on the map
-- applied to the players there), reading the age through the helper.
create or replace function public.court_right_now(ids text[])
returns table (court_id text, status text, status_at timestamptz, playing integer, friend_ids uuid[], you_here boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  here as (
    select k.court_id, k.user_id, k.created_at, p.created_at < now() - interval '7 days' as settled,
      public.follow_each_other(me.id, k.user_id) as mutual
    from public.court_checkins k
    join public.profiles p on p.id = k.user_id
    left join public.user_state us on us.user_id = k.user_id
    cross join me
    where k.court_id in (select id from wanted) and k.until > now() and k.user_id <> me.id
      and public.known_adult(k.user_id)
      and coalesce(us.map_visibility, 'nearby') <> 'none'
      and (coalesce(us.map_visibility, 'nearby') = 'nearby' or public.follow_each_other(me.id, k.user_id))
  )
  select w.id, st.status, st.created_at,
    case when me.adult and coalesce(h.settled, 0) >= 2 then h.n else 0 end,
    case when me.adult then coalesce(h.friends, '{}'::uuid[]) else '{}'::uuid[] end,
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
  from wanted w cross join me
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  left join lateral (
    select count(*)::int as n, (count(*) filter (where here.settled))::int as settled,
      array_agg(here.user_id order by here.created_at desc) filter (where here.mutual) as friends
    from here where here.court_id = w.id) h on true
  where me.id is not null
$$;

create or replace function public.shows_at_court(viewer uuid, author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select viewer is not null and author is not null and (viewer = author or (
    not public.is_blocked_between(viewer, author)
    and exists (
      select 1 from public.profiles p where p.id = author
        and (not p.is_private or exists (select 1 from public.follows f where f.follower_id = viewer and f.following_id = author))
        and (public.known_adult(author) or public.follow_each_other(viewer, author)))))
$$;

-- Map and court alerts (migrations 53, 60, 63): only from and to adults.
-- "A new player shared their spot near you" (as 63 left it).
create or replace function public.tell_adults_new_player() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
  r record;
begin
  if not public.known_adult(new.user_id) then return new; end if;
  select created_at into joined from public.profiles where id = new.user_id;
  if joined is null or joined < now() - interval '14 days' then return new; end if;
  if exists (select 1 from public.notifications where actor_id = new.user_id and kind = 'map-new-player') then return new; end if;
  begin
    for r in
      select x.id, x.km from (
        select s.user_id as id, public.km_between(new.lat, new.lng, s.lat, s.lng) as km
        from public.last_seen s
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days'
          and public.known_adult(s.user_id)
          and public.km_between(new.lat, new.lng, s.lat, s.lng) <= 50
          and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.actor_id = new.user_id and n.kind = 'joined')
          and public.spot_shown_to(s.user_id, new.user_id)
        order by 2 limit 50) x
      order by x.id
    loop
      perform public.send_map_alert(r.id, new.user_id, 'map-new-player', new.user_id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        'A new player shared their spot near you',
        public.miles_text(r.km) || ' from you. Say hi on the map.',
        '/map?lat=' || new.lat || '&lng=' || new.lng);
    end loop;
  exception when others then
    raise warning 'map alerts for new player %: %', new.user_id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.tell_court_about_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author public.profiles;
  c public.courts;
  what text;
  r record;
  sent boolean := false;
begin
  if new.court_id is null or new.archived or new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.court_id is not distinct from new.court_id then return new; end if;
  if new.created_at < now() - interval '2 days' then return new; end if;
  select * into author from public.profiles where id = new.author_id;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'post:' || new.id) then return new; end if;
  begin
    select * into c from public.courts where id = new.court_id;
    if c.id is null then return new; end if;
    what := case when new.kind = 'clip' or new.video_url is not null then 'clip' else 'post' end;
    for r in
      select f.user_id from public.court_follows f
      where f.court_id = c.id and f.user_id <> new.author_id
        and (not author.is_private or exists (select 1 from public.follows x where x.follower_id = f.user_id and x.following_id = new.author_id))
      order by f.user_id limit 500
    loop
      if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
        'New ' || what || ' at ' || coalesce(c.name, 'your court'),
        'New ' || what || ' at ' || coalesce(c.name, 'a court you follow'),
        'From a court you follow.',
        public.court_link(c.id, c.name, c.lat, c.lng)) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.author_id, 'post:' || new.id); end if;
  exception when others then
    raise warning 'court alerts for post %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- "Dev (you follow) is up for a hit today" (as 63 left it).
create or replace function public.tell_followers_up_for_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  spot public.last_seen;
  who text;
  r record;
  sent boolean := false;
  src text := 'up:' || current_date;
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return new; end if;
  if old.open_to_hit_until is not null and old.open_to_hit_until > now() then return new; end if;
  if not public.known_adult(new.id) then return new; end if;
  select * into spot from public.last_seen where user_id = new.id;
  if spot.user_id is null then return new; end if;
  if not public.fanout_allowed(new.id, src) then return new; end if;
  who := coalesce(nullif(new.name, ''), new.handle);
  begin
    for r in
      select x.id, x.km from (
        select f.follower_id as id, public.km_between(spot.lat, spot.lng, s.lat, s.lng) as km
        from public.follows f
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = new.id and public.km_between(spot.lat, spot.lng, s.lat, s.lng) <= 50
          and public.known_adult(f.follower_id)
          and public.spot_shown_to(f.follower_id, new.id)
        order by 2 limit 200) x
      order by x.id
    loop
      if public.send_map_alert(r.id, new.id, 'map-friend-hit', new.id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        who || ' (you follow) is up for a hit today',
        public.miles_text(r.km) || ' from you. See them on the map.',
        '/map?user=' || new.id || '&lat=' || spot.lat || '&lng=' || spot.lng) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.id, src); end if;
  exception when others then
    raise warning 'map alerts for open-to-hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.tell_hit_matches()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  poster public.profiles;
  lat1 double precision := nullif(new.place->>'lat', '')::double precision;
  lng1 double precision := nullif(new.place->>'lng', '')::double precision;
  sys text;
  words text;
  r record;
  told_poster boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  select * into poster from public.profiles where id = new.author_id;
  if not found or not public.known_adult(new.author_id) then return new; end if;
  sys := poster.profile->>'skillSystem';
  words := public.hit_when(new.starts_at, new.place) || ' · ' || coalesce(new.place->>'name', 'a court');

  -- Others with an open hit of their own, much like this one: closest in time first.
  for r in
    select h.id, h.author_id, h.starts_at, h.place
    from public.hit_requests h
    join public.profiles p on p.id = h.author_id
    where h.id <> new.id and h.author_id <> new.author_id and not h.cancelled
      and h.starts_at > now()
      and abs(extract(epoch from (h.starts_at - new.starts_at))) <= 2 * 3600
      and (h.format = new.format or 'hit' in (h.format, new.format))
      and public.known_adult(h.author_id)
      and not public.is_blocked_between(h.author_id, new.author_id)
      and (
        (lat1 is not null and nullif(h.place->>'lat', '') is not null
          and public.km_between(lat1, lng1, (h.place->>'lat')::double precision, (h.place->>'lng')::double precision) <= 25)
        or lower(btrim(coalesce(h.place->>'name', ''))) = lower(btrim(coalesce(new.place->>'name', '')))
      )
      and (
        h.level_min is null or new.level_min is null
        or coalesce(p.profile->>'skillSystem', '') is distinct from coalesce(sys, '')
        or (h.level_min <= new.level_max and new.level_min <= h.level_max)
      )
    order by abs(extract(epoch from (h.starts_at - new.starts_at)))
    limit 10
  loop
    perform public.file_notification(r.author_id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    if not told_poster then
      perform public.file_notification(new.author_id, r.author_id, 'hit-match', r.id::text, 'hit-request',
        public.hit_when(r.starts_at, r.place) || ' · ' || coalesce(r.place->>'name', 'a court'), true);
      told_poster := true;
    end if;
  end loop;

  -- Ring on today, near the court, at a level the hit asks for.
  if lat1 is not null then
    for r in
      select p.id
      from public.profiles p
      left join public.last_seen s on s.user_id = p.id
      where p.id <> new.author_id
        and p.open_to_hit_until > now()
        and public.known_adult(p.id)
        and coalesce(s.lat, p.city_lat) is not null
        and public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng)) <= 25
        and not public.is_blocked_between(p.id, new.author_id)
        and (
          new.level_min is null
          or (coalesce(p.profile->>'skillSystem', '') = coalesce(sys, '')
              and nullif(p.profile->>'rating', '')::numeric between new.level_min and new.level_max)
        )
        and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'hit-match' and n.target_id = new.id::text)
      order by public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng))
      limit 25
    loop
      perform public.file_notification(r.id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    end loop;
  end if;
  return new;
end $$;

create or replace function public.tell_map_about_hit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lat1 double precision;
  lng1 double precision;
  c public.courts;
  whenx text;
  r record;
  sent boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'hit:' || new.id) then return new; end if;
  begin
    lat1 := nullif(new.place->>'lat', '')::double precision;
    lng1 := nullif(new.place->>'lng', '')::double precision;
    whenx := public.hit_when(new.starts_at, new.place);
    select * into c from public.courts where id = new.place->>'id';
    if c.id is not null then
      for r in
        select f.user_id from public.court_follows f
        where f.court_id = c.id and f.user_id <> new.author_id
          and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
        order by f.user_id limit 500
      loop
        if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
          'New hit at ' || coalesce(c.name, 'your court') || ' · ' || whenx,
          'New hit at ' || coalesce(c.name, 'a court you follow'),
          upper(left(whenx, 1)) || substr(whenx, 2),
          public.court_link(c.id, c.name, c.lat, c.lng) || '&hit=' || new.id) then sent := true; end if;
      end loop;
    end if;
    if lat1 is not null and lng1 is not null then
      for r in
        select x.id, x.km from (
          select s.user_id as id, public.km_between(lat1, lng1, s.lat, s.lng) as km
          from public.last_seen s
          where s.user_id <> new.author_id and s.seen_at > now() - interval '30 days'
            and s.lat between lat1 - 0.5 and lat1 + 0.5
            and public.km_between(lat1, lng1, s.lat, s.lng) <= 25
            and public.known_adult(s.user_id)
            and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
            and (c.id is null or not exists (select 1 from public.court_follows f where f.user_id = s.user_id and f.court_id = c.id))
          order by 2 limit 50) x
        order by x.id
      loop
        if public.send_map_alert(r.id, new.author_id, 'map-new-hit', new.id::text, 'hit-request',
          public.miles_text(r.km) || ' from you · ' || whenx,
          'New open hit ' || public.miles_text(r.km) || ' from you',
          upper(left(whenx, 1)) || substr(whenx, 2) || ' · ' || coalesce(new.place->>'name', 'a court'),
          '/map?hit=' || new.id || '&lat=' || lat1 || '&lng=' || lng1) then sent := true; end if;
      end loop;
    end if;
    if sent then perform public.note_fanout(new.author_id, 'hit:' || new.id); end if;
  exception when others then
    raise warning 'map alerts for hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- New on CourtSide (migration 63), the same people, the age read from the
-- settings row: known adults and 16 and 17 year olds (a birthday on file
-- saying so); a known adult sees adults, public 16 and 17 year olds and
-- anyone they follow; anyone else only people they follow.
create or replace function public.new_on_courtside(days integer default 14)
returns table (user_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult)
  select p.id, p.created_at
  from public.profiles p cross join me
  left join public.user_state us on us.user_id = p.id
  where me.id is not null and p.id <> me.id
    and p.created_at >= now() - make_interval(days => least(greatest(coalesce(days, 14), 1), 60))
    and p.suspended_at is null
    and not public.is_blocked_between(me.id, p.id)
    and (us.age_group = 'adult' or (us.age_group = 'teen' and us.birth_date is not null and us.birth_date <= (current_date - interval '16 years')::date))
    and (
      exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = p.id)
      or (me.adult and (us.age_group = 'adult' or not p.is_private)))
  order by p.created_at desc, p.id
  limit 100
$$;

-- --------------------------------------------------------------- 5. the map
-- Whether you may see this person's spot: migration 63's own rule
-- (spot_shown_to), asked about yourself only, so it answers exactly what
-- reading their row of last_seen would, and nothing more.
create or replace function public.spot_shown_to_you(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and owner is not null and public.spot_shown_to(auth.uid(), owner)
$$;
revoke all on function public.spot_shown_to_you(uuid) from public, anon;
grant execute on function public.spot_shown_to_you(uuid) to authenticated;

-- Same rule as migration 63, same name: it read everyone's age off their
-- profile; now it asks the helper above.
drop policy if exists "adults see adults' last spot" on public.last_seen;
drop policy if exists "who sees a spot" on public.last_seen;
create policy "who sees a spot" on public.last_seen for select to authenticated using (
  user_id = auth.uid() or public.spot_shown_to_you(user_id)
);

-- --------------------------------------------------------------- 6. open hits
-- Whether this hit reaches you: it is yours, you joined it, you follow its
-- poster, or its poster is known to be an adult (and never across a block,
-- which the rule below adds). About one hit you name, so it says nothing
-- reading the hit would not.
create or replace function public.hit_shown_to_you(hit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = auth.uid()
      or public.known_adult(h.author_id)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = h.author_id)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
$$;
revoke all on function public.hit_shown_to_you(uuid) from public, anon;
grant execute on function public.hit_shown_to_you(uuid) to authenticated;

-- Whether someone's place in a hit's "who's in" shows to you: it is you,
-- the hit is yours, you are in it too, you follow them, or they are known
-- to be an adult. About one join you name, likewise.
create or replace function public.join_shown_to_you(hit uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = who)
      or exists (select 1 from public.hit_joins m where m.hit_id = hit and m.user_id = auth.uid())))
$$;
revoke all on function public.join_shown_to_you(uuid, uuid) from public, anon;
grant execute on function public.join_shown_to_you(uuid, uuid) to authenticated;

-- Same names as migrations 43 and 55. Live updates follow the same rules.
-- Signed in only (signed out read none before either; now they are simply
-- not asked, rather than asked and refused). Your own hit is read off the
-- row itself: a hit being posted is not there yet for the helper to find,
-- and posting one that asks for it back must still work.
drop policy if exists "hits are visible" on public.hit_requests;
create policy "hits are visible" on public.hit_requests for select to authenticated
  using (auth.uid() is not null and not public.blocked_with(author_id)
         and (author_id = auth.uid() or public.hit_shown_to_you(id)));
drop policy if exists "joins are visible" on public.hit_joins;
create policy "joins are visible" on public.hit_joins for select to authenticated
  using (exists (select 1 from public.hit_requests h where h.id = hit_id) and public.join_shown_to_you(hit_id, user_id));

-- ----------------------------------------------- 7. how much anyone may ask
-- Each person someone asks the age rules about (open_to_you,
-- shown_at_court, session_tag_refusal), kept a day. Asking about the same
-- person again is free; 300 different people a day at most. Server only.
create table if not exists public.age_rule_asks (
  asker_id uuid not null references public.profiles(id) on delete cascade,
  about_id uuid not null references public.profiles(id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (asker_id, about_id)
);
alter table public.age_rule_asks enable row level security;
revoke all on public.age_rule_asks from public, anon, authenticated;

-- Of these people, the ones you may be answered about now: those asked
-- about in the last day, then new ones while the day's 300 last.
create or replace function public.age_rule_budget(ids uuid[])
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  had uuid[];
  fresh uuid[];
  room int;
begin
  if me is null or ids is null or not exists (select 1 from public.profiles where id = me) then return '{}'; end if;
  delete from public.age_rule_asks where asker_id = me and asked_at < now() - interval '1 day';
  select coalesce(array_agg(a.about_id), '{}') into had
    from public.age_rule_asks a where a.asker_id = me and a.about_id = any (ids);
  room := greatest(0, 300 - (select count(*)::int from public.age_rule_asks a where a.asker_id = me));
  select coalesce(array_agg(x.id order by x.n), '{}') into fresh from (
    select u.id, min(u.n) as n from unnest(ids) with ordinality as u(id, n)
    where u.id is not null and u.id <> me and not (u.id = any (had))
      and exists (select 1 from public.profiles p where p.id = u.id)
    group by u.id) x;
  fresh := fresh[1:room];
  insert into public.age_rule_asks (asker_id, about_id)
    select me, f from unnest(fresh) as f on conflict do nothing;
  return had || fresh;
end $$;
revoke all on function public.age_rule_budget(uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------- 8. what the app may ask
-- For each of these people (up to 100), signed in only: whether you may
-- start a one-to-one chat with them, add them to a group, or tag them in a
-- session (they are known to be an adult, or they follow you). Never the
-- age itself. Left out: yourself, someone with no profile, anyone you are
-- blocked with either way (refused on its own), and anyone past the day's
-- limit (the app then lets you try; the server decides when you act).
drop function if exists public.open_to_you(uuid[]);
create function public.open_to_you(ids uuid[])
returns table (user_id uuid, chat boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  asked uuid[];
begin
  if me is null then return; end if;
  asked := public.age_rule_budget((coalesce(ids, '{}'))[1:100]);
  return query
    select p.id,
      public.known_adult(p.id)
        or exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = me)
    from public.profiles p
    where p.id = any (asked) and not public.is_blocked_between(me, p.id);
end $$;
revoke all on function public.open_to_you(uuid[]) from public, anon;
grant execute on function public.open_to_you(uuid[]) to authenticated;

-- Of these posts (up to 100), the ones that may show on a court's page for
-- you: posts with a court, by you, or by someone whose posts may count at a
-- court for you (as court_rings counts them: never across a block, a
-- private account only for its followers, someone not known to be an adult
-- only for people they follow back). The day's limit counts their authors.
create or replace function public.shown_at_court(post_ids uuid[])
returns setof uuid language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted uuid[] := (coalesce(post_ids, '{}'))[1:100];
  asked uuid[];
begin
  if me is null then return; end if;
  asked := public.age_rule_budget(array(
    select distinct p.author_id from public.posts p where p.id = any (wanted) and p.author_id <> me));
  return query
    select p.id from public.posts p
    where p.id = any (wanted)
      and p.court_id is not null and not p.archived and p.removed_at is null
      and (p.author_id = me or p.author_id = any (asked))
      and public.shows_at_court(me, p.author_id);
end $$;
revoke all on function public.shown_at_court(uuid[]) from public, anon;
grant execute on function public.shown_at_court(uuid[]) to authenticated;

-- Whether you may tag someone (migration 62), with the day's limit on the
-- answers that depend on the age: past it, no answer (null), and the tag
-- itself is checked when it is made.
create or replace function public.session_tag_refusal(who uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  r text := public.session_tag_refusal_for(auth.uid(), who);
begin
  if (r is null or r = 'teen_closed') and auth.uid() is not null and who is not null
     and not (who = any (public.age_rule_budget(array[who]))) then
    return null;
  end if;
  return r;
end $$;
revoke all on function public.session_tag_refusal(uuid) from public, anon;
grant execute on function public.session_tag_refusal(uuid) to authenticated;

-- ------------------------------------------------- 9. the old column goes
drop trigger if exists guard_age_group on public.profiles;
drop function if exists public.guard_age_group();
alter table public.profiles drop column if exists age_group;

-- ------------------------------------------------------------- 10. last check
-- Nothing left in the database may still look for an age anywhere but the
-- settings row: no function but the four below, no rule, no view.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname not in ('known_adult', 'set_birth_date', 'guard_state_age_group', 'new_on_courtside');
  if bad is not null then
    raise exception 'Migration 64 stopped: these functions still read the age from somewhere else: %. Nothing was changed.', bad;
  end if;
  select string_agg(tablename || ' (' || policyname || ')', ', ') into bad
    from pg_policies
    where schemaname = 'public' and (coalesce(qual, '') ~* 'age_group' or coalesce(with_check, '') ~* 'age_group');
  if bad is not null then
    raise exception 'Migration 64 stopped: these rules still read the age: %. Nothing was changed.', bad;
  end if;
  select string_agg(viewname, ', ') into bad from pg_views where schemaname = 'public' and definition ~* 'age_group';
  if bad is not null then
    raise exception 'Migration 64 stopped: these views still read the age: %. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 11. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The age is off profiles and on settings rows (expect 0 | 1):
-- select (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'age_group') on_profiles,
--        (select count(*) from information_schema.columns where table_name = 'user_state' and column_name = 'age_group') on_settings;
--
-- (b) Who may call what (expect open_to_you, shown_at_court, spot_shown_to_you, hit_shown_to_you, join_shown_to_you: app true, anon false;
--     known_adult, age_rule_budget: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('open_to_you', 'shown_at_court', 'spot_shown_to_you', 'hit_shown_to_you', 'join_shown_to_you', 'known_adult', 'age_rule_budget') order by 1;
--
-- (c) Every account that had an age still has it (expect the same two numbers as before: teens, adults):
-- select age_group, count(*) from public.user_state where age_group is not null group by 1;
