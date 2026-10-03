-- 69: more trackers for tennis sessions: Fitbit, Oura and Polar.
--
-- WHOOP (migration 58) and Apple Health already file a private "Tennis
-- detected" row when they record a tennis session. This lets three more
-- trackers do the same, through one server function (supabase/functions/
-- trackers) that signs in to each and reads their tennis workouts. Every
-- session still goes through record_activity, so the same rules hold: only
-- the owner sees it, numbers that make no sense are dropped, the same match
-- seen by two trackers files one alert (the duplicate check is unchanged),
-- and everything is gone after 30 days.
--
--   * detected_activities and health_connections accept 'fitbit', 'oura' and
--     'polar' as sources;
--   * tracker_tokens keeps each person's keys for those three (server only:
--     row security on with no rule, no rights for the app at all), and
--     tracker_pending holds a sign-in for up to ten minutes until the phone
--     that started it collects it, as WHOOP's does. So a sign-in link sent to
--     someone else can never put their tracker (and their heart rate) on the
--     sender's account;
--   * three switches, 'flag:tennis-fitbit', 'flag:tennis-oura' and
--     'flag:tennis-polar', start as whatever WHOOP's switch is set to when
--     this runs ('admins' today: only admin accounts, for testing). A
--     tracker also stays "Coming soon" in the app until its keys are pasted
--     into the server's secrets (see docs/trackers-setup.md).
--     To open one to everyone: update server_settings set value = 'on', updated_at = now() where key = 'flag:tennis-fitbit';
--   * disconnecting a tracker removes its sessions, their alerts and its
--     stats on posts (forget_tracker_data). Practice sessions the player
--     logged stay, as their own day and minutes.
--
-- Replaces record_activity (to accept the new sources) and
-- note_detected_activity (to say "from your Fitbit"); neither changes in any
-- other way from migration 58, and migration 64 does not check either.
-- Does not touch push_for_notification. Needs 27, 35, 58.
-- Safe to run more than once.

-- ---------------------------------------------------------------- switches
insert into public.server_settings (key, value)
select k, coalesce((select value from public.server_settings where key = 'flag:tennis-whoop'), 'off')
from unnest(array['flag:tennis-fitbit', 'flag:tennis-oura', 'flag:tennis-polar']) k
on conflict (key) do nothing;

-- ------------------------------------------------------- the new sources
alter table public.detected_activities drop constraint if exists detected_activities_source_check;
alter table public.detected_activities add constraint detected_activities_source_check
  check (source in ('whoop', 'apple-health', 'health-connect', 'fitbit', 'oura', 'polar'));

alter table public.health_connections drop constraint if exists health_connections_provider_check;
alter table public.health_connections add constraint health_connections_provider_check
  check (provider in ('apple-health', 'whoop', 'cronometer', 'myfitnesspal', 'fitbit', 'oura', 'polar'));

-- ------------------------------------------------------------------ keys
-- One row per person per tracker. Polar's keys do not run out and have no
-- refresh key, so both of those may be empty. Server only.
create table if not exists public.tracker_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('fitbit', 'oura', 'polar')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  -- The tracker's own id for this person (Fitbit's user id, Polar's user id).
  member_id text check (char_length(member_id) <= 100),
  -- A short lock so two requests never refresh at once (Fitbit and Oura
  -- invalidate the old refresh key on every refresh).
  refresh_lock_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.tracker_tokens enable row level security;
revoke all on public.tracker_tokens from anon, authenticated;

-- A sign-in a tracker said yes to, waiting (ten minutes at most) for the
-- phone that started it to collect it. Holds the keys, so server only.
create table if not exists public.tracker_pending (
  n uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('fitbit', 'oura', 'polar')),
  answer jsonb not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.tracker_pending enable row level security;
revoke all on public.tracker_pending from anon, authenticated;

-- --------------------------------------------------------------- functions
-- True for the one request that may refresh this person's key for this
-- tracker for the next 20 seconds.
create or replace function public.claim_tracker_refresh(u uuid, prov text) returns boolean
language sql security definer set search_path = public as $$
  with c as (update public.tracker_tokens set refresh_lock_until = now() + interval '20 seconds'
              where user_id = u and provider = prov and (refresh_lock_until is null or refresh_lock_until < now()) returning 1)
  select exists (select 1 from c)
$$;

-- Disconnecting a tracker removes what it sent: its stats on posts, its
-- sessions and their alerts, and a sign-in still waiting. Practice sessions
-- the player logged stay, as their own day and minutes.
create or replace function public.forget_tracker_data(u uuid, prov text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if prov not in ('fitbit', 'oura', 'polar') then return; end if;
  update public.posts set session = null where author_id = u and session->>'source' = prov;
  delete from public.notifications n using public.detected_activities d
   where d.user_id = u and d.source = prov and n.user_id = u and n.kind = 'activity' and n.target_id = d.id::text;
  delete from public.detected_activities where user_id = u and source = prov;
  delete from public.tracker_pending where user_id = u and provider = prov;
end $$;

-- As in migration 58, with the new sources in the list of what it accepts.
create or replace function public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  mins int;
  pct int;
  hr_ok boolean;
  v_strain numeric;
  v_id uuid;
  v_note text;
  v_status text;
begin
  if u is null or src not in ('whoop', 'apple-health', 'health-connect', 'fitbit', 'oura', 'polar') or coalesce(char_length(ext), 0) not between 1 and 100
     or coalesce(p->>'sport', 'tennis') <> 'tennis' or not public.tennis_allowed(u, src) then
    return null;
  end if;
  begin
    t0 := (p->>'started_at')::timestamptz;
    t1 := (p->>'ended_at')::timestamptz;
  exception when others then
    return null;
  end;
  if t0 is null or t1 is null or t1 <= t0 or t1 > now() + interval '10 minutes' or t0 < now() - interval '30 days' then return null; end if;
  mins := round(extract(epoch from t1 - t0) / 60)::int;
  if mins not between 5 and 600 then return null; end if;
  -- Heart rate from a strap that was barely on is not worth showing.
  pct := public.activity_int(p->>'percent_recorded', 0, 100);
  hr_ok := pct is null or pct >= 50;
  v_strain := case when p->>'strain' ~ '^[0-9]+([.][0-9]+)?$' then case when (p->>'strain')::numeric <= 21 then round((p->>'strain')::numeric, 1) end end;

  insert into public.detected_activities as d (user_id, source, external_id, started_at, ended_at, tz_offset_min, minutes, avg_hr, max_hr, kcal, strain, score_state, device)
  values (
    u, src, ext, t0, t1,
    public.activity_int(p->>'tz_offset_min', -840, 840),
    mins,
    case when hr_ok then public.activity_int(p->>'avg_hr', 30, 250) end,
    case when hr_ok then public.activity_int(p->>'max_hr', 30, 250) end,
    public.activity_int(p->>'kcal', 0, 10000),
    v_strain,
    case when p->>'score_state' in ('SCORED', 'PENDING_SCORE', 'UNSCORABLE') then p->>'score_state' end,
    nullif(left(btrim(p->>'device'), 60), '')
  )
  on conflict (user_id, source, external_id) do update set
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    minutes = excluded.minutes,
    tz_offset_min = coalesce(excluded.tz_offset_min, d.tz_offset_min),
    avg_hr = coalesce(excluded.avg_hr, d.avg_hr),
    max_hr = coalesce(excluded.max_hr, d.max_hr),
    kcal = coalesce(excluded.kcal, d.kcal),
    strain = coalesce(excluded.strain, d.strain),
    score_state = coalesce(excluded.score_state, d.score_state),
    device = coalesce(excluded.device, d.device),
    -- The tracker took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end $$;

-- As in migration 58; only the "from your …" words know the new trackers.
create or replace function public.note_detected_activity(a_id uuid, quiet boolean default false, force_pending boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_a public.detected_activities;
  v_twin uuid;
  v_label text;
  v_who text;
  v_hour int;
  v_push boolean;
begin
  select * into v_a from public.detected_activities where id = a_id;
  if not found then return 'missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('activity:' || v_a.user_id::text, 0));
  -- Again, under the lock: another request may have just filed it.
  select * into v_a from public.detected_activities where id = a_id;
  if v_a.status <> 'new' or v_a.notified_at is not null then return 'already'; end if;
  -- WHOOP is still scoring it; the scored copy (or the sweep) announces it.
  if v_a.score_state = 'PENDING_SCORE' and not force_pending then return 'pending'; end if;

  -- The same match seen twice (WHOOP and the Watch, say): the earlier row
  -- carries the alert, this one stays quiet.
  select o.id into v_twin from public.detected_activities o
   where o.user_id = v_a.user_id and o.id <> v_a.id and o.status in ('new', 'logged', 'dismissed') and o.created_at <= v_a.created_at
     and (abs(extract(epoch from o.started_at - v_a.started_at)) <= 600
          or extract(epoch from least(o.ended_at, v_a.ended_at) - greatest(o.started_at, v_a.started_at))
             >= 0.5 * least(extract(epoch from o.ended_at - o.started_at), extract(epoch from v_a.ended_at - v_a.started_at)))
   order by o.created_at limit 1;
  if v_twin is not null then
    update public.detected_activities set status = 'duplicate', duplicate_of = v_twin, notified_at = now(), updated_at = now() where id = v_a.id;
    return 'duplicate';
  end if;

  -- Too old to be news: it stays in the list, without an alert.
  if v_a.ended_at < now() - interval '48 hours' then return 'stale'; end if;

  -- The player already logged it by hand (a session saved between the start
  -- and 12 hours after the end).
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null
               and s.created_at between v_a.started_at and v_a.ended_at + interval '12 hours') then
    update public.detected_activities set status = 'duplicate', notified_at = now(), updated_at = now() where id = v_a.id;
    return 'logged-by-hand';
  end if;

  update public.detected_activities set notified_at = now(), updated_at = now() where id = v_a.id;
  v_label := case when v_a.minutes < 60 then v_a.minutes || ' min'
                  else (v_a.minutes / 60) || ' hr' || case when v_a.minutes % 60 > 0 then ' ' || (v_a.minutes % 60) || ' min' else '' end end;
  v_who := case v_a.source when 'whoop' then 'your WHOOP'
                           when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'your Apple Watch' else 'Apple Health' end
                           when 'fitbit' then 'your Fitbit'
                           when 'oura' then 'your Oura Ring'
                           when 'polar' then 'your Polar'
                           else 'your tracker' end;
  -- From the player to themselves: the Notifications page shows it, and
  -- push_for_notification skips it (the buzz, if any, is sent below).
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (v_a.user_id, v_a.user_id, 'activity', v_a.id::text, 'activity', v_label || ' · from ' || v_who);

  -- In the app only: the phone found it itself (it shows its own banner),
  -- it is from long ago, the player turned these alerts off, or it is night
  -- where they played.
  if quiet then return 'filed'; end if;
  if v_a.ended_at < now() - interval '12 hours' then return 'filed-old'; end if;
  select push_activity into v_push from public.user_state where user_id = v_a.user_id;
  if v_push is false then return 'filed-off'; end if;
  if v_a.tz_offset_min is not null then
    v_hour := extract(hour from (now() at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min))::int;
    if v_hour >= 22 or v_hour < 7 then return 'filed-night'; end if;
  end if;
  -- No numbers on the lock screen: the time and stats show only in the app.
  perform public.send_push(v_a.user_id, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || v_a.id);
  return 'pushed';
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.claim_tracker_refresh(uuid, text) from public, anon, authenticated;
revoke all on function public.forget_tracker_data(uuid, text) from public, anon, authenticated;
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.claim_tracker_refresh(uuid, text) to service_role;
grant execute on function public.forget_tracker_data(uuid, text) to service_role;
grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;
-- The trackers function asks whether a tracker's switch is on for someone before sending them to sign in.
grant execute on function public.flag_on_for(text, uuid) to service_role;

-- ------------------------------------------------- checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The three new switches (expect tennis-fitbit, tennis-oura, tennis-polar, each as WHOOP's was):
-- select key, value from server_settings where key like 'flag:tennis-%' order by 1;
--
-- (b) The app cannot touch the keys (expect four falses):
-- select has_table_privilege('authenticated', 'public.tracker_tokens', 'select'), has_table_privilege('anon', 'public.tracker_tokens', 'select'),
--        has_table_privilege('authenticated', 'public.tracker_pending', 'select'), has_function_privilege('authenticated', 'public.record_activity(uuid,text,text,jsonb,boolean)', 'execute');
