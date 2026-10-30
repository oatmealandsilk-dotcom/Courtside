-- CourtSide · migration 20261030000208: friends hear when you light a court.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more than
-- once. Undo: supabase/rollback/208_undo.sql.
--
-- SHIP ORDER: the app update that knows the new alert ('friend-court', on
-- branch feat/friend-court-alert) goes out FIRST (an update over the air is
-- enough), THEN this. An app without it shows the row as just a name, and
-- its tap goes nowhere useful.
--
-- Why (owner, Oct 30): "Tell friends is good", to "when you light a court,
-- mutual friends get a notification like 'Robert is playing at Rowena courts
-- till 6:30.'" Then: "if multiple are at same court playing you can bundle
-- the notification, a friend can get more than 1 every 3 hours".
--
-- What it does, in plain words:
--   * When someone says "I'm playing here" at a court (check_in_at_court, from
--     the court card or from Up to hit at a court), each friend who may hear
--     gets one notification and one phone alert:
--       "Robert is playing at Rowena Courts"
--       "Till 6:30pm. See them on the map."   (the time in the friend's own
--        time zone; a friend whose phone has not said its zone gets
--        "Playing now. See them on the map.")
--     Tapping the phone alert opens the map on that court.
--   * Several friends at the same court: one alert per court, not one each.
--     A second friend there within the hour sends ONE alert that replaces the
--     first on the phone (same collapse id on iPhone, same tag on Android):
--       "Sam and Robert are playing at Rowena Courts"
--       "Sam, Robert and 2 others are playing at Rowena Courts"
--     and in Notifications the rows for one court fold into one row (the app
--     groups them, the way it folds likes).
--   * Who hears (all must hold; never a stranger):
--       - you and they follow each other;
--       - they can see your spot on the map right now (spot_shown_to: your
--         "Who can see you on the map?", blocks, suspensions, the teen rules);
--       - not blocked either way (also in the app's own block list), and they
--         have not muted you;
--       - they were around in the last 30 days, within 50 km of the court;
--       - their "Friends up for a hit" switch is on (push_map_friends, the
--         existing switch; no new setting);
--       - a friend not known to be an adult hears only when their own map
--         already shows you on that court (your spot there and fresh), so
--         the alert never tells a teen more than their map does. Adults see
--         friends at a court on its card already (court_right_now).
--     Only a known adult, not suspended, sets it off (check_in_at_court lets
--     only adults check in anyway).
--   * How often:
--       - one alert per session: the same person at the same court sends
--         nothing new while their check-in there is still running (a longer
--         stay, "I'm playing here" tapped again, a check-in replacing the
--         running one), nor within 2 hours of the last alert for that court.
--         A new session later the same day sends again (owner: "A same friend
--         at the same court can alert you twice. I practice twice a day");
--       - no per-friend cap (the owner: "a friend can get more than 1 every 3
--         hours"). What still bounds it: a player can check in at no more than
--         6 new check-ins a day (check_in_at_court), the 2-hour rule above,
--         and several friends at one court make one alert that replaces itself;
--       - its own record (friend_court_sends), so it never uses up the
--         once-a-day map alerts (alert_sends is not touched).
--   * Never two alerts for one tap: Up to hit at a court first turns Up to hit
--     on (which may send "Robert (you follow) is up for a hit today") and then
--     checks in at the court a moment later. A friend who got that alert from
--     the same person in the last 10 minutes does not get this one too. (The
--     earlier alert has already reached the phone and cannot be taken back,
--     so the later one is the one left out. Their map shows the court pin.)
--
-- What changes, by name:
--   friend_court_sends (new table, nobody can read it from the app): when each
--     player last told friends about each court.
--   send_push_grouped(target, title, body, href, grp) (new): send_push with a
--     collapse id and Android tag, so a newer alert replaces an older one of
--     the same grp on the phone. send_push itself is not touched.
--   tell_friends_at_court() + trigger on court_checkins (new): the alert.
--     check_in_at_court is not touched.
--   The phone-alert trigger on notifications (push_for_notification, as
--     migration 181 left it) also skips 'friend-court', which sends its own.
--     The trigger's function is not touched.
-- Nothing else: send_map_alert, map-friend-hit, every switch, policy and
-- grant are as they were.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  missing text[] := '{}';
  f text;
  def text;
  kinds text[];
  want181 constant text[] := array['map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite', 'group-invite'];
begin
  foreach f in array array['court_checkins', 'courts', 'notifications', 'follows', 'last_seen', 'exact_spots', 'user_state', 'profiles', 'push_tokens'] loop
    if to_regclass('public.' || f) is null then missing := missing || ('table ' || f); end if;
  end loop;
  foreach f in array array[
    'public.check_in_at_court(text, double precision, double precision, integer)',
    'public.send_push(uuid, text, text, text)',
    'public.known_adult(uuid)',
    'public.is_suspended(uuid)',
    'public.is_blocked_between(uuid, uuid)',
    'public.follow_each_other(uuid, uuid)',
    'public.spot_shown_to(uuid, uuid)',
    'public.km_between(double precision, double precision, double precision, double precision)',
    'public.court_link(text, text, double precision, double precision)',
    'public.push_for_notification()'] loop
    if to_regprocedure(f) is null then missing := missing || f; end if;
  end loop;
  foreach f in array array['push_map_friends', 'tz', 'blocked_ids', 'muted_ids'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = f) then
      missing := missing || ('user_state.' || f);
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'Migration 208 stopped before changing anything: % not found. Run migrations 130 and 204 first.', array_to_string(missing, ', ');
  end if;
  -- The phone-alert trigger: as 181 left it, or as this file leaves it (a re-run).
  select pg_get_triggerdef(t.oid) into def from pg_trigger t
    where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification' and not t.tgisinternal;
  select coalesce(array_agg(m[1] order by m[1]), '{}') into kinds
    from regexp_matches(coalesce(def, ''), '''([^'']+)''::text', 'g') as m;
  if def is null or def not like '%push_for_notification()%'
     or not (kinds @> want181 and kinds <@ (want181 || 'friend-court'::text)) then
    raise exception 'Migration 208 stopped before changing anything: the notifications trigger push_for_notification is not as migration 181 left it (%). Ask Claude to look.', coalesce(def, 'missing');
  end if;
  -- Nobody else has made these names yet (or this file did, on a first run).
  if to_regprocedure('public.send_push_grouped(uuid, text, text, text, text)') is not null
     and not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.send_push_grouped(uuid, text, text, text, text)') and md5(p.prosrc) = '60816997458202b0cb4337e961409432') then
    raise exception 'Migration 208 stopped before changing anything: send_push_grouped already exists and is not this file''s. Ask Claude to look.';
  end if;
  if to_regprocedure('public.tell_friends_at_court()') is not null
     and not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.tell_friends_at_court()') and md5(p.prosrc) = 'b9f34f584d4adb12eec686dc5d4aa969') then
    raise exception 'Migration 208 stopped before changing anything: tell_friends_at_court already exists and is not this file''s. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------------------------ 1. the record
-- One row per player and court: when they last told friends they were playing there.
create table if not exists public.friend_court_sends (
  actor_id uuid not null references public.profiles (id) on delete cascade,
  court_id text not null,
  sent_at  timestamptz not null default now(),
  primary key (actor_id, court_id)
);
alter table public.friend_court_sends enable row level security;
revoke all on public.friend_court_sends from anon, authenticated;

-- ------------------------------------------------------------------ 2. a phone alert that replaces its own kind
-- As send_push (migration 106), plus collapseId (iPhone: a newer alert with the
-- same id replaces the one on the lock screen) and tag (Android: the same).
create or replace function public.send_push_grouped(target uuid, title text, body text, href text, grp text)
returns void language plpgsql security definer set search_path = public as $$
declare
  messages jsonb;
  k text := left(coalesce(nullif(grp, ''), 'courtside'), 64);
begin
  select jsonb_agg(jsonb_build_object(
    'to', token, 'title', title, 'body', left(coalesce(body, ''), 180), 'sound', 'default',
    'priority', 'high', 'channelId', 'activity', 'collapseId', k, 'tag', k,
    'data', jsonb_build_object('href', href)))
    into messages
    from public.push_tokens where user_id = target;
  if messages is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;
revoke all on function public.send_push_grouped(uuid, text, text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 3. the alert
create or replace function public.tell_friends_at_court()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := new.user_id;
  c public.courts;
  who text;
  place text;
  href text;
  r record;
  zone text;
  till text;
  others uuid[];
  other_name text;
  nid uuid;
  title text;
  body text;
  sent boolean := false;
begin
  -- A new check-in, or a move to another court. The same court while the check-in there is still running
  -- (a longer stay, "I'm playing here" tapped again) says nothing.
  if tg_op = 'UPDATE' and old.court_id = new.court_id and old.until > now() then return null; end if;
  if new.until <= now() then return null; end if;
  if not public.known_adult(actor) or public.is_suspended(actor) then return null; end if;
  -- The same session at the same court tells friends once: nothing within 2 hours of the last alert for it
  -- (a re-tap after "I'm done", a check-in replacing one that just ran out). A new session later sends again.
  if exists (select 1 from public.friend_court_sends s where s.actor_id = actor and s.court_id = new.court_id
             and s.sent_at > now() - interval '2 hours') then
    return null;
  end if;
  select * into c from public.courts where id = new.court_id;
  if c.id is null or c.access = 'private' then return null; end if;
  select coalesce(nullif(btrim(p.name), ''), p.handle) into who from public.profiles p where p.id = actor;
  who := coalesce(nullif(who, ''), 'A friend');
  place := coalesce(nullif(btrim(c.name), ''), 'a court');
  href := public.court_link(c.id, c.name, c.lat, c.lng);
  begin
    for r in
      select x.id from (
        select f.follower_id as id, public.km_between(c.lat, c.lng, s.lat, s.lng) as km
        from public.follows f
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = actor and f.follower_id <> actor
          and public.km_between(c.lat, c.lng, s.lat, s.lng) <= 50
          and public.follow_each_other(f.follower_id, actor)
          and public.spot_shown_to(f.follower_id, actor)
        order by 2 limit 200) x
      order by x.id
    loop
      continue when public.is_blocked_between(r.id, actor);
      continue when exists (select 1 from public.user_state us where us.user_id = r.id
                            and (us.push_map_friends is false
                                 or actor::text = any (coalesce(us.blocked_ids, '{}'))
                                 or actor::text = any (coalesce(us.muted_ids, '{}'))));
      continue when exists (select 1 from public.user_state us where us.user_id = actor and r.id::text = any (coalesce(us.blocked_ids, '{}')));
      -- Not known to be an adult: only when their own map already shows you on this court.
      continue when not public.known_adult(r.id) and not exists (
        select 1 from public.exact_spots xs where xs.user_id = actor
          and xs.seen_at > now() - greatest(interval '2 hours', new.until - new.created_at)
          and public.km_between(xs.lat, xs.lng, c.lat, c.lng) <= 0.15);
      -- Up to hit at a court: "is up for a hit today" went a moment ago; not this one too.
      continue when exists (select 1 from public.notifications n where n.user_id = r.id and n.actor_id = actor
                            and n.kind = 'map-friend-hit' and n.created_at > now() - interval '10 minutes');
      begin
        -- Other friends this person was told about at this court in the last hour, still playing there.
        select coalesce(array_agg(y.actor_id order by y.at desc), '{}') into others from (
          select n.actor_id, max(n.created_at) as at
          from public.notifications n
          join public.court_checkins k on k.user_id = n.actor_id and k.court_id = c.id and k.until > now()
          where n.user_id = r.id and n.kind = 'friend-court' and n.target_id = c.id and n.actor_id <> actor
            and n.created_at > now() - interval '60 minutes'
            and not public.is_blocked_between(r.id, n.actor_id)
            and public.spot_shown_to(r.id, n.actor_id)
            -- (Not known to be an adult: only friends their map still shows on this court, as above.)
            and (public.known_adult(r.id) or exists (
              select 1 from public.exact_spots xs where xs.user_id = n.actor_id
                and xs.seen_at > now() - greatest(interval '2 hours', k.until - k.created_at)
                and public.km_between(xs.lat, xs.lng, c.lat, c.lng) <= 0.15))
          group by n.actor_id) y;
        nid := null;
        insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
          values (r.id, actor, 'friend-court', c.id, 'court', left(place, 80))
          returning id into nid;
        -- Not filed (a check on notifications turned it away): no phone alert either.
        continue when nid is null;
        if cardinality(others) = 0 then
          title := who || ' is playing at ' || place;
          select us.tz into zone from public.user_state us where us.user_id = r.id;
          till := null;
          if zone is not null then
            begin
              till := replace(to_char(new.until at time zone zone, 'FMHH12:MIam'), ':00', '');
            exception when others then
              till := null;
            end;
          end if;
          body := case when till is not null then 'Till ' || till || '. See them on the map.' else 'Playing now. See them on the map.' end;
        else
          select coalesce(nullif(btrim(p.name), ''), p.handle) into other_name from public.profiles p where p.id = others[1];
          other_name := coalesce(nullif(other_name, ''), 'a friend');
          title := case when cardinality(others) = 1 then who || ' and ' || other_name
                        else who || ', ' || other_name || ' and ' || (cardinality(others) - 1)
                             || case when cardinality(others) - 1 = 1 then ' other' else ' others' end
                   end || ' are playing at ' || place;
          body := 'Playing now. See them on the map.';
        end if;
        perform public.send_push_grouped(r.id, title, body, href, 'friend-court-' || c.id);
        sent := true;
      exception when others then
        raise warning 'friend court alert % to %: %', actor, r.id, sqlerrm;
      end;
    end loop;
    if sent then
      insert into public.friend_court_sends as s (actor_id, court_id, sent_at) values (actor, c.id, now())
        on conflict (actor_id, court_id) do update set sent_at = excluded.sent_at;
      delete from public.friend_court_sends where actor_id = actor and sent_at < now() - interval '2 days';
    end if;
  exception when others then
    raise warning 'friend court alerts for %: %', actor, sqlerrm;
  end;
  return null;
exception when others then
  -- Never stops the check-in that set it off.
  raise warning 'friend court alerts for %: %', new.user_id, sqlerrm;
  return null;
end $$;
revoke all on function public.tell_friends_at_court() from public, anon, authenticated;

drop trigger if exists tell_friends_at_court on public.court_checkins;
create trigger tell_friends_at_court after insert or update of court_id, until on public.court_checkins
  for each row execute function public.tell_friends_at_court();

-- ------------------------------------------------------------------ 4. phone alerts
-- 'friend-court' sends its own phone alert (above), so the general one skips it.
-- Migration 181's trigger, with 'friend-court' added to the list.
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row when (new.kind not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity', 'hit-invite', 'group-invite', 'friend-court'))
  execute function public.push_for_notification();

-- ------------------------------------------------------------------ 5. afterwards
do $$
begin
  if to_regclass('public.friend_court_sends') is null
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.send_push_grouped(uuid, text, text, text, text)'))) is distinct from '60816997458202b0cb4337e961409432'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.tell_friends_at_court()'))) is distinct from 'b9f34f584d4adb12eec686dc5d4aa969'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.check_in_at_court(text, double precision, double precision, integer)'))) is distinct from '86b6465ede2eeb852104871129d6bfd3'
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.court_checkins'::regclass and t.tgname = 'tell_friends_at_court' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'push_for_notification'
                    and pg_get_triggerdef(t.oid) like '%friend-court%' and pg_get_triggerdef(t.oid) like '%group-invite%') then
    raise exception 'Migration 208 did not finish: something it makes is missing or not as written.';
  end if;
end $$;

commit;
