-- 78: the map for teens, Snapchat style: only between friends who follow each other.
--
-- NOT APPLIED — needs the owner's OK to run. The owner's decision (Oct 3):
-- "if you're mutuals and you're under 18, you can see location".
--
-- Until now only known adults were on the map and only known adults saw it
-- (migrations 46, 60, 63). What changes, for anyone NOT known to be an adult
-- (a teen, or an account with no age on file):
--
--   * They may share their spot and their "up for a hit today" ring, but
--     only with people they follow who follow them back (approved follows,
--     both ways). "Players nearby" counts as "Only people you follow back"
--     for them; "Only me" hides them; turning Location off deletes the spot
--     as it always has (forget_last_seen), so nobody sees them at all.
--   * It is OFF until they turn it on themselves: nothing is shared until
--     they answer "Who can see you on the map?" in the app
--     (set_map_visibility, which notes when they answered). Spots kept
--     today for teens with Location on stay hidden until then.
--   * They see only the spots and rings of people they follow who follow
--     them back (adults or teens). Strangers never see them; they never see
--     strangers. One-way follows are not enough.
--   * Under 16 (a birthday on file says so): never on the map, and they see
--     nobody on it. set_map_visibility refuses to share for them ('under_16').
--   * A teen's spot is only ever the rough one (about a kilometre), never
--     exact and never on a court: their exact spot is never kept (as
--     before), and they still cannot say "I'm playing here".
--   * A block, or a mute in either direction, always hides both people
--     from each other here.
--   * A teen's "up for a hit today" no longer sits on their public profile
--     (anyone could read it there). It is kept in their own settings row
--     (user_state.open_to_hit_until, which only they can read) and shown
--     only on the map, to the friends above.
--   * "Dev (you follow) is up for a hit today" can now go between friends
--     who follow each other when either is a teen (never under 16, never
--     when either has muted or blocked the other, only while the one who is
--     up can be seen by the one told). All other map alerts stay adults
--     only: new open hits nearby, new players nearby, and courts you follow
--     only ever from an adult.
--
-- Adults with adults: exactly as before (Players nearby / Only people you
-- follow back / Only me).
--
-- What changes, by name:
--   user_state: + map_answered_at, open_to_hit_until (written only by the
--     server: guard_map_state).
--   New helpers (server only): map_under_16, map_hushed, minor_shares_spot,
--     map_pair_ok; spot_shown_to_you (the same as migration 64's, made here
--     too so the rule on last_seen can use it before 64 runs).
--   Replaced: spot_shown_to (63), map_players (63), set_map_visibility (63),
--     send_map_alert (60); the rule "who sees a spot" on last_seen.
--   New triggers: keep_open_to_hit_private (profiles), tell_minor_friends_up
--     (profiles), tell_friends_minor_up (user_state), guard_map_state
--     (user_state).
--   Left as they are: court_right_now, check_in_at_court, mark_last_seen,
--     forget_last_seen, tell_followers_up_for_hit, tell_adults_new_player,
--     tell_map_about_hit (teens cannot check in, are never placed on a
--     court, and those alerts stay adults only), so migration 64's own check
--     still passes if it runs after this.
--
-- Needs 46, 60 and 63 (live). Works with or without 64. Stops without
-- changing anything if a function it replaces has changed since it was
-- written. After this has run, do not run 60 or 63 again (they would put
-- the adults-only versions back); if one ever is, run this again.
-- Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live (Oct 3), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    ['spot_shown_to', 'b9969be7e9fcba3f391893a99d0e8a6e', '576d16a22ca04acbe96f9a60647d5873'],
    ['map_players', '185f6734e492d7868d5a91b95e204986', '6476dd6b87649b842b656f3e3aea94f3'],
    ['set_map_visibility', 'bf5bb47d24b3052d42ca2ef3c55aaaa0', '3f6a1311e1ebc3b3fe5477a495735ec2'],
    ['send_map_alert', 'ac1583a6e8d26f1d73e6d6fe1b187d3d', '5001fc787e20679b6d0d5474c6d7bc93']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.last_seen') is null or to_regclass('public.exact_spots') is null
     or to_regprocedure('public.known_adult(uuid)') is null or to_regprocedure('public.follow_each_other(uuid, uuid)') is null
     or to_regprocedure('public.sync_spot_settings()') is null or to_regprocedure('public.fanout_allowed(uuid, text)') is null then
    raise exception 'Migration 78 stopped before changing anything: migrations 46, 60 and 63 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  -- Migration 64's own helper, if it is there, must be 64's (this file makes the same one).
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'spot_shown_to_you';
  if now_is is not null and now_is <> 'b0225e84dee18f183091409c94b91794' then
    wrong := wrong || 'spot_shown_to_you'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 78 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ---------------------------------------------- 1. two private settings
-- map_answered_at: when someone not known to be an adult last answered
--   "Who can see you on the map?" themselves. Until they do, nobody sees
--   them on the map, whatever else is on file.
-- open_to_hit_until: "up for a hit today" for someone not known to be an
--   adult, kept here (only they can read their settings row) instead of on
--   their public profile.
alter table public.user_state add column if not exists map_answered_at timestamptz;
alter table public.user_state add column if not exists open_to_hit_until timestamptz;

-- Both are the server's to write (set_map_visibility, and the profile
-- trigger below switch courtside.map_state on for that moment). The app
-- saving its settings row cannot set or clear them.
create or replace function public.guard_map_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('courtside.map_state', true), '') <> 'on' then
    if tg_op = 'UPDATE' then
      new.map_answered_at := old.map_answered_at;
      new.open_to_hit_until := old.open_to_hit_until;
    else
      new.map_answered_at := null;
      new.open_to_hit_until := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_map_state() from public, anon, authenticated;
drop trigger if exists guard_map_state on public.user_state;
create trigger guard_map_state before insert or update on public.user_state
  for each row execute function public.guard_map_state();

-- ------------------------------------------------------------ 2. helpers
-- A birthday on file says under 16. (No birthday: not known to be under 16.)
create or replace function public.map_under_16(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_state s
                 where s.user_id = u and s.birth_date is not null
                   and s.birth_date > (current_date - interval '16 years')::date)
$$;
revoke all on function public.map_under_16(uuid) from public, anon, authenticated;

-- Either has muted or blocked the other in their settings.
create or replace function public.map_hushed(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_state s
    where (s.user_id = a and (b::text = any (s.muted_ids) or b::text = any (s.blocked_ids)))
       or (s.user_id = b and (a::text = any (s.muted_ids) or a::text = any (s.blocked_ids))))
$$;
revoke all on function public.map_hushed(uuid, uuid) from public, anon, authenticated;

-- Someone not known to be an adult who turned sharing on themselves: they
-- answered the question, did not pick Only me, and are not under 16.
create or replace function public.minor_shares_spot(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_state s
                 where s.user_id = u and s.map_answered_at is not null and s.map_visibility in ('nearby', 'mutuals'))
     and not public.map_under_16(u)
$$;
revoke all on function public.minor_shares_spot(uuid) from public, anon, authenticated;

-- The one rule: whether `viewer` may see `owner` on the map, given the
-- owner's choice (`vis`, as copied onto their spot). Never yourself (the
-- callers handle that), never across a block, never Only me.
--   Both known adults: as migration 63 (Players nearby, or follow each other).
--   Anyone else: both follow each other, neither is under 16, neither has
--   muted or blocked the other, and an owner who is not known to be an
--   adult has turned sharing on themselves.
create or replace function public.map_pair_ok(viewer uuid, owner uuid, vis text) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and viewer <> owner
    and coalesce(vis, 'nearby') <> 'none'
    and not public.is_blocked_between(viewer, owner)
    and case
      when public.known_adult(viewer) and public.known_adult(owner)
        then coalesce(vis, 'nearby') = 'nearby' or public.follow_each_other(viewer, owner)
      else not public.map_under_16(viewer) and not public.map_under_16(owner)
        and (public.known_adult(owner) or public.minor_shares_spot(owner))
        and public.follow_each_other(viewer, owner)
        and not public.map_hushed(viewer, owner)
    end
$$;
revoke all on function public.map_pair_ok(uuid, uuid, text) from public, anon, authenticated;

-- --------------------------------------------------- 3. who sees whose spot
-- Migration 63's, with the rule above in place of "both known adults".
create or replace function public.spot_shown_to(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and owner is not null and (
    (viewer = owner and exists (select 1 from public.last_seen where user_id = owner))
    or (viewer <> owner and exists (
      select 1 from public.last_seen s
      where s.user_id = owner and s.visibility <> 'none'
        and public.map_pair_ok(viewer, owner, s.visibility))))
$$;
revoke all on function public.spot_shown_to(uuid, uuid) from public, anon, authenticated;

-- Exactly migration 64's: the same rule, asked about yourself only.
create or replace function public.spot_shown_to_you(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and owner is not null and public.spot_shown_to(auth.uid(), owner)
$$;
revoke all on function public.spot_shown_to_you(uuid) from public, anon;
grant execute on function public.spot_shown_to_you(uuid) to authenticated;

-- Reading last_seen directly (older versions of the app do): the same rule.
-- (The same rule, by the same name, as migration 64 puts in.)
drop policy if exists "adults see adults' last spot" on public.last_seen;
drop policy if exists "who sees a spot" on public.last_seen;
create policy "who sees a spot" on public.last_seen for select to authenticated using (
  user_id = auth.uid() or public.spot_shown_to_you(user_id)
);

-- ------------------------------------------------------- 4. what the map reads
-- Migration 63's map_players, with the rule above choosing who is shown,
-- and "up for a hit" read from the profile or (for someone not known to be
-- an adult) their private settings row. Someone not known to be an adult
-- never has an exact spot kept (mark_last_seen), so they are only ever
-- shown roughly, to the friends who may see them.
drop function if exists public.map_players(double precision, double precision, double precision, double precision);
create function public.map_players(min_lat double precision default null, min_lng double precision default null,
  max_lat double precision default null, max_lng double precision default null)
returns table (user_id uuid, lat double precision, lng double precision, place text, court_id text, court_name text,
  city text, seen_at timestamptz, open_until timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  box as (
    select v.given,
      v.mlat - least(v.hlat, 1.0) as lat0, v.mlat + least(v.hlat, 1.0) as lat1,
      v.mlng - least(v.hlng, 1.0) as lng0, v.mlng + least(v.hlng, 1.0) as lng1
    from (select min_lat is not null and min_lng is not null and max_lat is not null and max_lng is not null as given,
            (min_lat + max_lat) / 2 as mlat, abs(max_lat - min_lat) / 2 as hlat,
            (min_lng + max_lng) / 2 as mlng, abs(max_lng - min_lng) / 2 as hlng) v
  ),
  shown as (
    select s.user_id, s.lat, s.lng, s.city, s.seen_at, s.show_activity, s.user_id = me.id as mine,
      (s.user_id = me.id or public.follow_each_other(me.id, s.user_id)) as close
    from public.last_seen s cross join me
    where me.id is not null and (
      s.user_id = me.id
      or (s.visibility <> 'none' and public.map_pair_ok(me.id, s.user_id, s.visibility)))
  ),
  placed as (
    select sh.user_id, sh.city, sh.show_activity, sh.mine, sh.seen_at, x.seen_at as real_at,
      sh.lat as rlat, sh.lng as rlng, x.lat as xlat, x.lng as xlng,
      kc.id as kid, kc.name as kname, kc.lat as klat, kc.lng as klng,
      c.id as cid, c.name as cname, c.lat as clat, c.lng as clng,
      case
        when x.lat is null then 'approx'
        when kc.id is not null and x.seen_at > now() - interval '2 hours'
             and public.km_between(x.lat, x.lng, kc.lat, kc.lng) <= 0.15 then 'checkin'
        when sh.close and c.id is not null then 'court'
        when sh.close then 'exact'
        else 'approx'
      end as how
    from shown sh
    left join public.exact_spots x on x.user_id = sh.user_id
    left join public.court_checkins k on k.user_id = sh.user_id and k.until > now()
    left join public.courts kc on kc.id = k.court_id and kc.access not in ('members', 'private')
    left join public.courts c on c.id = x.court_id and c.access in ('public', 'pay')
  ),
  pos as (
    select pl.user_id, pl.mine, pl.city,
      case pl.how when 'checkin' then pl.klat when 'court' then pl.clat when 'exact' then pl.xlat else pl.rlat end as lat,
      case pl.how when 'checkin' then pl.klng when 'court' then pl.clng when 'exact' then pl.xlng else pl.rlng end as lng,
      case pl.how when 'checkin' then 'court' when 'court' then 'court' when 'exact' then 'exact' else 'approx' end as place,
      case pl.how when 'checkin' then pl.kid when 'court' then pl.cid end as court_id,
      case pl.how when 'checkin' then pl.kname when 'court' then pl.cname end as court_name,
      case when pl.mine then coalesce(pl.real_at, pl.seen_at) when pl.show_activity then pl.seen_at end as seen_at
    from placed pl
  )
  select o.user_id, o.lat, o.lng, o.place, o.court_id, o.court_name, o.city, o.seen_at,
    case when greatest(p.open_to_hit_until, us.open_to_hit_until) > now() then greatest(p.open_to_hit_until, us.open_to_hit_until) end
  from pos o cross join box join public.profiles p on p.id = o.user_id
  left join public.user_state us on us.user_id = o.user_id
  where (box.given and o.lat between box.lat0 and box.lat1 and o.lng between box.lng0 and box.lng1)
     or (not box.given and o.mine)
  -- (Those who hide their activity status come last, so the order cannot tell when they were seen.)
  order by o.seen_at desc nulls last, o.user_id
  limit 2000
$$;
revoke all on function public.map_players(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.map_players(double precision, double precision, double precision, double precision) to authenticated;

-- ------------------------------------------------ 5. "Who can see you on the map?"
-- Migration 63's, plus: for someone not known to be an adult, Players
-- nearby is kept as Only people you follow back, the answer is noted (that
-- is what turns sharing on), and someone under 16 cannot share at all
-- ('under_16'; Only me is still saved). Returns what was kept.
create or replace function public.set_map_visibility(v text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  adult boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if v is null or v not in ('nearby', 'mutuals', 'none') then raise exception 'visibility?'; end if;
  adult := public.known_adult(me);
  if not adult then
    if v <> 'none' and public.map_under_16(me) then raise exception 'under_16'; end if;
    if v = 'nearby' then v := 'mutuals'; end if;
  end if;
  perform set_config('courtside.map_state', 'on', true);
  insert into public.user_state (user_id, map_visibility, map_answered_at) values (me, v, case when adult then null else now() end)
    on conflict (user_id) do update set map_visibility = excluded.map_visibility,
      map_answered_at = case when adult then public.user_state.map_answered_at else now() end;
  perform set_config('courtside.map_state', 'off', true);
  return v;
end $$;
revoke all on function public.set_map_visibility(text) from public, anon;
grant execute on function public.set_map_visibility(text) to authenticated;

-- Someone not known to be an adult who never answered it themselves (from
-- before this file): any choice on file is cleared, so the app asks them,
-- and they stay off the map until they answer. Answers given after this
-- file ran are kept on a re-run.
update public.user_state us set map_visibility = null
 where us.map_visibility is not null and us.map_answered_at is null and not public.known_adult(us.user_id);

-- ---------------------------------------- 6. a teen's "up for a hit", off the profile
-- The app saves "up for a hit today" on the profile, which anyone can read.
-- For someone not known to be an adult it is moved to their own settings
-- row as it is saved, and the profile keeps nothing. (A known adult's stays
-- on the profile, as before.)
create or replace function public.keep_open_to_hit_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.known_adult(new.id) then return new; end if;
  if tg_op = 'UPDATE' then
    perform set_config('courtside.map_state', 'on', true);
    insert into public.user_state (user_id, open_to_hit_until) values (new.id, new.open_to_hit_until)
      on conflict (user_id) do update set open_to_hit_until = excluded.open_to_hit_until;
    perform set_config('courtside.map_state', 'off', true);
  end if;
  new.open_to_hit_until := null;
  return new;
end $$;
revoke all on function public.keep_open_to_hit_private() from public, anon, authenticated;

-- Rings already on teens' profiles move across (only those still on today),
-- then come off the profiles. Done with the triggers off (no alert goes
-- out for a ring being moved), then they go on.
drop trigger if exists keep_open_to_hit_private on public.profiles;
drop trigger if exists tell_friends_minor_up on public.user_state;
insert into public.user_state (user_id, open_to_hit_until)
  select p.id, p.open_to_hit_until from public.profiles p
  where p.open_to_hit_until > now() and not public.known_adult(p.id)
  on conflict (user_id) do update set open_to_hit_until = excluded.open_to_hit_until;
update public.profiles p set open_to_hit_until = null
 where p.open_to_hit_until is not null and not public.known_adult(p.id);
create trigger keep_open_to_hit_private before insert or update of open_to_hit_until on public.profiles
  for each row execute function public.keep_open_to_hit_private();

-- --------------------------------------------------------------- 7. alerts
-- Migration 60's, with one change: "is up for a hit today"
-- ('map-friend-hit') with someone not known to be an adult on either side
-- goes only between people who follow each other, and only while the one
-- who is up may be seen on the map by the one told (which also means
-- neither is under 16 and neither has muted or blocked the other). Every
-- other case is exactly as before: the other map alerts only ever between
-- adults, court alerts only from adults.
create or replace function public.send_map_alert(
  recipient uuid, actor uuid, what text, target text, target_type text, words text, title text, body text, href text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_grp text := case when what = 'court-activity' then 'courts' else 'map' end;
  switched_on boolean;
  claimed boolean;
  flat text;
begin
  if recipient is null or actor is null or recipient = actor then return false; end if;
  if what not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity') then return false; end if;
  if what = 'map-friend-hit' and not (public.known_adult(actor) and public.known_adult(recipient)) then
    if not public.follow_each_other(recipient, actor) or not public.spot_shown_to(recipient, actor) then return false; end if;
  else
    if not public.known_adult(actor) then return false; end if;
    if v_grp = 'map' and not public.known_adult(recipient) then return false; end if;
    if v_grp = 'courts' and not public.known_adult(recipient) and not public.follow_each_other(recipient, actor) then return false; end if;
  end if;
  if public.is_blocked_between(recipient, actor)
     or exists (select 1 from public.user_state where user_id = recipient and actor::text = any(blocked_ids)) then
    return false;
  end if;
  select case what when 'map-friend-hit' then push_map_friends when 'map-new-hit' then push_map_hits
                   when 'map-new-player' then push_map_players else push_courts end
    into switched_on from public.user_state where user_id = recipient;
  if switched_on is false then return false; end if;
  begin
    insert into public.alert_sends as a (user_id, grp, sent_at) values (recipient, v_grp, now())
      on conflict (user_id, grp) do update set sent_at = excluded.sent_at where a.sent_at <= now() - interval '24 hours'
      returning true into claimed;
    if claimed is null then return false; end if;
    flat := nullif(btrim(regexp_replace(coalesce(words, ''), '\s+', ' ', 'g')), '');
    if char_length(flat) > 80 then flat := left(flat, 79) || '…'; end if;
    insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
      values (recipient, actor, what, target, target_type, flat);
    perform public.send_push(recipient, title, body, href);
    return true;
  exception when others then
    return false;
  end;
end $$;
revoke all on function public.send_map_alert(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

-- "Dev (you follow) is up for a hit today" between friends who follow each
-- other when a teen is either side (adult to adult stays with migration
-- 63's tell_followers_up_for_hit, untouched). `only_minors`: an adult's
-- ring, told only to their friends not known to be adults (adults hear
-- from 63's). Within 50 km, by the rough spot, once a day; it counts
-- toward the person's three a day. Never raises.
create or replace function public.tell_friends_up_for_hit(actor uuid, only_minors boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  spot public.last_seen;
  who text;
  r record;
  sent boolean := false;
  src text := 'up-friends:' || current_date;
begin
  select * into spot from public.last_seen where user_id = actor;
  if spot.user_id is null then return; end if;
  if not public.fanout_allowed(actor, src) then return; end if;
  select coalesce(nullif(p.name, ''), p.handle) into who from public.profiles p where p.id = actor;
  begin
    for r in
      select x.id, x.km from (
        select f.follower_id as id, public.km_between(spot.lat, spot.lng, s.lat, s.lng) as km
        from public.follows f
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = actor and public.km_between(spot.lat, spot.lng, s.lat, s.lng) <= 50
          and (not only_minors or not public.known_adult(f.follower_id))
          and public.follow_each_other(f.follower_id, actor)
          and public.spot_shown_to(f.follower_id, actor)
        order by 2 limit 200) x
      order by x.id
    loop
      if public.send_map_alert(r.id, actor, 'map-friend-hit', actor::text, 'profile',
        public.miles_text(r.km) || ' from you',
        coalesce(who, 'A friend') || ' (you follow) is up for a hit today',
        public.miles_text(r.km) || ' from you. See them on the map.',
        '/map?user=' || actor || '&lat=' || spot.lat || '&lng=' || spot.lng) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(actor, src); end if;
  exception when others then
    raise warning 'friend alerts for open-to-hit %: %', actor, sqlerrm;
  end;
end $$;
revoke all on function public.tell_friends_up_for_hit(uuid, boolean) from public, anon, authenticated;

-- A teen's ring goes from off to on (in their settings row).
create or replace function public.tell_friends_minor_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return null; end if;
  if tg_op = 'UPDATE' and old.open_to_hit_until is not null and old.open_to_hit_until > now() then return null; end if;
  if public.known_adult(new.user_id) then return null; end if;
  perform public.tell_friends_up_for_hit(new.user_id, false);
  return null;
exception when others then
  raise warning 'friend alerts for %: %', new.user_id, sqlerrm;
  return null;
end $$;
revoke all on function public.tell_friends_minor_up() from public, anon, authenticated;
drop trigger if exists tell_friends_minor_up on public.user_state;
create trigger tell_friends_minor_up after insert or update of open_to_hit_until on public.user_state
  for each row execute function public.tell_friends_minor_up();

-- An adult's ring goes from off to on (on their profile): their friends who
-- are teens and follow each other with them.
create or replace function public.tell_minor_friends_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return new; end if;
  if old.open_to_hit_until is not null and old.open_to_hit_until > now() then return new; end if;
  if not public.known_adult(new.id) then return new; end if;
  perform public.tell_friends_up_for_hit(new.id, true);
  return new;
exception when others then
  raise warning 'friend alerts for %: %', new.id, sqlerrm;
  return new;
end $$;
revoke all on function public.tell_minor_friends_up() from public, anon, authenticated;
drop trigger if exists tell_minor_friends_up on public.profiles;
create trigger tell_minor_friends_up after update of open_to_hit_until on public.profiles
  for each row execute function public.tell_minor_friends_up();

-- ------------------------------------------------------------- 8. last check
-- Nothing this file made reads the age anywhere but through known_adult and
-- the birthday (so migration 64, if it runs later, finds nothing to stop on).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname in ('guard_map_state', 'map_under_16', 'map_hushed', 'minor_shares_spot', 'map_pair_ok', 'spot_shown_to',
                        'spot_shown_to_you', 'map_players', 'set_map_visibility', 'keep_open_to_hit_private', 'send_map_alert',
                        'tell_friends_up_for_hit', 'tell_friends_minor_up', 'tell_minor_friends_up');
  if bad is not null then
    raise exception 'Migration 78 stopped: % read the age directly. Nothing was changed.', bad;
  end if;
end $$;

commit;

-- ------------------------------------------------------- 9. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new settings columns (expect 2):
-- select count(*) from information_schema.columns where table_name = 'user_state' and column_name in ('map_answered_at', 'open_to_hit_until');
--
-- (b) Who may call what (expect map_players, set_map_visibility, spot_shown_to_you: app true, anon false;
--     map_pair_ok, minor_shares_spot, map_under_16, map_hushed, spot_shown_to, tell_friends_up_for_hit: both false):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('map_players', 'set_map_visibility', 'spot_shown_to_you', 'map_pair_ok', 'minor_shares_spot', 'map_under_16', 'map_hushed', 'spot_shown_to', 'tell_friends_up_for_hit') order by 1;
--
-- (c) No teen's ring is left on a public profile (expect 0):
-- select count(*) from public.profiles p where p.open_to_hit_until is not null and not public.known_adult(p.id);
--
-- (d) Nobody not known to be an adult is shared without having answered (expect 0):
-- select count(*) from public.user_state where map_visibility in ('nearby', 'mutuals') and map_answered_at is null and not public.known_adult(user_id);
--
-- (e) The rule on last_seen (expect: who sees a spot | ((user_id = auth.uid()) OR spot_shown_to_you(user_id))):
-- select policyname, qual from pg_policies where tablename = 'last_seen';
