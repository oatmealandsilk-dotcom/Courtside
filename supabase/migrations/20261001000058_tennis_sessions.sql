-- 58: tennis sessions a tracker picked up, ready to log.
--
-- When a player's WHOOP (or, read on their phone, their Apple Watch or the
-- Health app) records a tennis session, the server keeps one private row for
-- it and files a 'Tennis detected' alert. One tap logs it as a practice
-- session, with the time on court already filled in. From here:
--   * detected_activities holds those sessions. Only their owner can read
--     them; nothing in the app can write them directly. Every write goes
--     through the functions below, which check the switches, drop numbers
--     that make no sense, and file the alert once, even when WHOOP sends the
--     same workout twice or the Watch and WHOOP both saw the same match;
--   * the phone alert carries no numbers ('Tennis detected' / 'Log it on
--     CourtSide.'), only for WHOOP, only within 12 hours of the session, and
--     never between 10pm and 7am where it was played. The alert row is
--     addressed from the player to themselves, so push_for_notification
--     skips it and there is never a second buzz;
--   * logging links the practice session to its tracker row (unique, so a
--     session can only be logged once); deleting the practice session frees
--     it again;
--   * a post that carries tracker stats is rebuilt here from the private row:
--     time on court and where it came from, plus heart rate only when the
--     author asked for it and is a confirmed adult. No start time, no device,
--     no calories or Strain, and never offered for CourtSide's Instagram;
--   * nothing is kept for long: 30 days after a session ended its row and
--     alert go. One the player logged lives on only as their practice
--     session (the day and the minutes). Disconnecting WHOOP removes its
--     sessions, and once WHOOP's switch is on, everything else it sent;
--   * a WHOOP sign-in that turns tennis on waits in whoop_pending until the
--     phone that started it, signed in as the same player, collects it. So a
--     sign-in link sent to someone else can never put their WHOOP (and their
--     heart rate) on the sender's account.
--
-- Switched off by default. Two rows in the private server_settings table
-- decide who gets it: 'flag:tennis-apple' and 'flag:tennis-whoop', each
-- 'off' (nobody), 'admins' (admin accounts only, for testing) or 'on'
-- (everyone). They start 'off'; with both off nothing new happens anywhere.
-- To change one: update server_settings set value = 'admins', updated_at = now() where key = 'flag:tennis-whoop';
--
-- Needs 08, 13, 14, 23, 27, 28, 35, 39. Does not touch push_for_notification.
-- Safe to run more than once.

-- ---------------------------------------------------------------- switches
insert into public.server_settings (key, value) values ('flag:tennis-apple', 'off'), ('flag:tennis-whoop', 'off') on conflict (key) do nothing;

-- Whether a switch is on for one person. Server only.
create or replace function public.flag_on_for(flag text, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case (select value from public.server_settings where key = 'flag:' || flag)
    when 'on' then true
    when 'admins' then coalesce((select is_admin from public.profiles where id = u), false)
    else false end
$$;

-- The app's view of the switches, as true/false for whoever asks. Only
-- 'flag:' rows are ever read: the Stripe secret on the same shelf never is.
create or replace function public.my_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(substr(key, 6), public.flag_on_for(substr(key, 6), auth.uid())), '{}'::jsonb)
  from public.server_settings where key like 'flag:%'
$$;

-- ------------------------------------------------------- detected sessions
create table if not exists public.detected_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('whoop', 'apple-health', 'health-connect')),
  external_id text not null check (char_length(external_id) between 1 and 100),
  sport text not null default 'tennis' check (sport in ('tennis')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  tz_offset_min int check (tz_offset_min between -840 and 840),
  minutes int not null check (minutes between 5 and 600),
  avg_hr int check (avg_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  kcal int check (kcal between 0 and 10000),
  strain numeric(3,1) check (strain between 0 and 21),
  score_state text check (score_state in ('SCORED', 'PENDING_SCORE', 'UNSCORABLE')),
  device text check (char_length(device) <= 60),
  status text not null default 'new' check (status in ('new', 'logged', 'dismissed', 'duplicate', 'withdrawn')),
  duplicate_of uuid references public.detected_activities (id) on delete set null,
  session_id uuid references public.practice_sessions (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id),
  check (ended_at > started_at)
);
create index if not exists detected_activities_user_time on public.detected_activities (user_id, started_at desc);
create index if not exists detected_activities_ended on public.detected_activities (ended_at);
-- Private to its owner. The app may read its own rows and nothing more:
-- every write goes through the security-definer functions below.
alter table public.detected_activities enable row level security;
drop policy if exists "your detected sessions" on public.detected_activities;
create policy "your detected sessions" on public.detected_activities for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.detected_activities from anon, authenticated;

-- The practice session a tracker row was logged as (one each).
alter table public.practice_sessions add column if not exists activity_id uuid references public.detected_activities (id) on delete set null;
create unique index if not exists practice_sessions_activity on public.practice_sessions (activity_id) where activity_id is not null;
-- Settings → Notifications → Tennis sessions.
alter table public.user_state add column if not exists push_activity boolean not null default true;
-- Tennis sessions switched on for this source; the owner's existing rule lets the app set it.
alter table public.health_connections add column if not exists reads_workouts boolean not null default false;
-- Which WHOOP member a token belongs to (webhooks name only that), what it
-- was allowed to read, and a short lock so two requests never refresh it at
-- once (WHOOP invalidates the old key on every refresh). Still server-only.
alter table public.whoop_tokens add column if not exists whoop_user_id bigint;
alter table public.whoop_tokens add column if not exists scope text;
alter table public.whoop_tokens add column if not exists refresh_lock_until timestamptz;
-- One CourtSide account per WHOOP member, so a member's workouts reach one person.
create unique index if not exists whoop_tokens_one_member on public.whoop_tokens (whoop_user_id) where whoop_user_id is not null;

-- A tennis sign-in WHOOP said yes to, waiting (ten minutes at most) for the
-- phone that started it to collect it. Holds WHOOP's keys, so server only:
-- row security on with no rule, and no rights for the app at all.
create table if not exists public.whoop_pending (
  n uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer jsonb not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.whoop_pending enable row level security;
revoke all on public.whoop_pending from anon, authenticated;

-- --------------------------------------------------------------- helpers
-- A whole number from a payload value, or null when it is missing, not a
-- number, or outside the range.
create or replace function public.activity_int(v text, lo int, hi int) returns int language sql immutable as $$
  select case when v ~ '^-?[0-9]+([.][0-9]+)?$' then case when v::numeric between lo and hi then round(v::numeric)::int end end
$$;

-- The switch for this source is on for this person, and they turned tennis
-- sessions on for it.
create or replace function public.tennis_allowed(u uuid, src text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.flag_on_for(case src when 'whoop' then 'tennis-whoop' when 'apple-health' then 'tennis-apple' else 'tennis-' || src end, u)
     and exists (select 1 from public.health_connections c where c.user_id = u and c.provider = src and c.reads_workouts)
$$;

-- The CourtSide accounts a WHOOP webhook is about, among those with tennis on.
create or replace function public.whoop_tennis_users(w bigint) returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select t.user_id from public.whoop_tokens t where t.whoop_user_id = w and public.tennis_allowed(t.user_id, 'whoop')
$$;

-- Files the alert for one detected session, at most once, and says what it
-- did. Runs under a lock per person, so a webhook, a retry and the app's own
-- check arriving together still file one alert.
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

-- Thirty days: every tracker session (and its alert) goes, logged or not.
-- A logged one lives on as its practice session, which already holds the
-- day and the minutes; its link is cleared (on delete set null). Nothing
-- else is kept: not the start time, the heart rate, the device or WHOOP's id.
create or replace function public.expire_activities(u uuid default null) returns void
language sql security definer set search_path = public as $$
  delete from public.notifications n using public.detected_activities d
   where (u is null or d.user_id = u) and d.ended_at < now() - interval '30 days' and n.user_id = d.user_id and n.kind = 'activity' and n.target_id = d.id::text;
  delete from public.detected_activities where (u is null or user_id = u) and ended_at < now() - interval '30 days';
$$;

-- The server's one way in (the whoop function, and report_activity below).
-- Returns {id, status, note}, or null when tennis is not on for this person
-- and source or the session does not make sense. Sending the same session
-- again updates it and never files a second alert.
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
  if u is null or src not in ('whoop', 'apple-health', 'health-connect') or coalesce(char_length(ext), 0) not between 1 and 100
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
    -- WHOOP took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end $$;

-- The phone's way in for Apple Health, as the signed-in player. Always
-- quiet (no server push: Health numbers never pass through a push service);
-- 'notify' tells the phone it filed the alert, so it may show its banner.
create or replace function public.report_activity(ext text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_r jsonb;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  -- A day's worth is plenty; this stops a runaway phone, not a player.
  if (select count(*) from public.detected_activities where user_id = v_me and created_at > now() - interval '1 day') >= 40 then return null; end if;
  -- Only WHOOP has Strain and a scoring state.
  v_r := public.record_activity(v_me, 'apple-health', ext, coalesce(p, '{}'::jsonb) - 'strain' - 'score_state' - 'percent_recorded', true);
  if v_r is null then return null; end if;
  return jsonb_build_object('id', v_r->'id', 'status', v_r->'status', 'notify', (v_r->>'note') = 'filed');
end $$;

-- 'Not tennis? Hide it': only your own, only before it is logged.
create or replace function public.dismiss_activity(a uuid) returns void
language sql security definer set search_path = public as $$
  update public.detected_activities set status = 'dismissed', updated_at = now() where id = a and user_id = auth.uid() and status in ('new', 'duplicate');
  delete from public.notifications where user_id = auth.uid() and kind = 'activity' and target_id = a::text
    and exists (select 1 from public.detected_activities where id = a and user_id = auth.uid() and status = 'dismissed');
$$;

-- WHOOP deleted the workout (or it stopped being tennis): take back the
-- alert unless the player already logged it.
create or replace function public.withdraw_activity(u uuid, src text, ext text) returns void
language sql security definer set search_path = public as $$
  update public.detected_activities set status = 'withdrawn', notified_at = null, updated_at = now() where user_id = u and source = src and external_id = ext and status in ('new', 'duplicate');
  delete from public.notifications n using public.detected_activities d
   where d.user_id = u and d.source = src and d.external_id = ext and d.status = 'withdrawn' and n.user_id = u and n.kind = 'activity' and n.target_id = d.id::text;
$$;

-- True for the one request that may refresh this person's WHOOP key for the
-- next 20 seconds.
create or replace function public.claim_whoop_refresh(u uuid) returns boolean
language sql security definer set search_path = public as $$
  with c as (update public.whoop_tokens set refresh_lock_until = now() + interval '20 seconds'
              where user_id = u and (refresh_lock_until is null or refresh_lock_until < now()) returning 1)
  select exists (select 1 from c)
$$;

-- Disconnecting WHOOP removes what WHOOP sent: its stats on posts, its
-- sessions and their alerts, a sign-in still waiting, and (once WHOOP's
-- switch is on for this person) its numbers in the daily health rows.
-- Practice sessions the player logged stay, as their own day and minutes.
create or replace function public.forget_whoop_data(u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.posts set session = null where author_id = u and session->>'source' = 'whoop';
  delete from public.notifications n using public.detected_activities d where d.user_id = u and d.source = 'whoop' and n.user_id = u and n.kind = 'activity' and n.target_id = d.id::text;
  delete from public.detected_activities where user_id = u and source = 'whoop';
  delete from public.whoop_pending where user_id = u;
  -- With the switch off the Health screen still says "what was already read
  -- stays until you delete your account", so it does, as it always has.
  if not public.flag_on_for('tennis-whoop', u) then return; end if;
  update public.health_days h set
    recovery = case when h.sources->>'recovery' = 'whoop' then null else h.recovery end,
    resting_hr = case when h.sources->>'resting_hr' = 'whoop' then null else h.resting_hr end,
    hrv_ms = case when h.sources->>'hrv_ms' = 'whoop' then null else h.hrv_ms end,
    sleep_hours = case when h.sources->>'sleep_hours' = 'whoop' then null else h.sleep_hours end,
    calories = case when h.sources->>'calories' = 'whoop' then null else h.calories end,
    sources = coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(h.sources) e where e.value <> '"whoop"'::jsonb), '{}'::jsonb),
    updated_at = now()
  where h.user_id = u and exists (select 1 from jsonb_each_text(h.sources) e where e.value = 'whoop');
end $$;

-- Every 15 minutes (and on each WHOOP sync): announce sessions WHOOP has
-- been scoring for 45 minutes or more, without their stats, then tidy up.
create or replace function public.sweep_activities() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select id from public.detected_activities
            where status = 'new' and notified_at is null and score_state = 'PENDING_SCORE'
              and ended_at between now() - interval '12 hours' and now() - interval '45 minutes'
              and public.tennis_allowed(user_id, source) loop
    perform public.note_detected_activity(r.id, false, true);
  end loop;
  perform public.expire_activities(null);
  -- WHOOP sign-ins nobody collected.
  delete from public.whoop_pending where expires_at < now();
end $$;

-- ---------------------------------------------------------------- triggers
-- A practice session can only point at its owner's tracker row, and only
-- when it is first saved. Later it may lose the link (the tracker row was
-- deleted) but never be pointed somewhere else.
create or replace function public.guard_session_activity() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- May become null (an activity deleted, on delete set null); never re-pointed.
    if new.activity_id is distinct from old.activity_id and new.activity_id is not null then new.activity_id := old.activity_id; end if;
  elsif new.activity_id is not null and not exists (select 1 from public.detected_activities d where d.id = new.activity_id and d.user_id = new.user_id) then
    new.activity_id := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_session_activity on public.practice_sessions;
create trigger guard_session_activity before insert or update on public.practice_sessions for each row execute function public.guard_session_activity();

-- Security definer: the app has no update right on detected_activities.
create or replace function public.mark_activity_logged() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.activity_id is not null then
    update public.detected_activities set status = 'logged', session_id = new.id, updated_at = now() where id = new.activity_id and user_id = new.user_id;
  elsif tg_op = 'DELETE' and old.activity_id is not null then
    update public.detected_activities set status = 'new', session_id = null, updated_at = now() where id = old.activity_id and status = 'logged';
  end if;
  return null;
end $$;
drop trigger if exists mark_activity_logged on public.practice_sessions;
create trigger mark_activity_logged after insert or delete on public.practice_sessions for each row execute function public.mark_activity_logged();

-- Posts are public, so a post's tracker stats are rebuilt here from the
-- private row rather than trusted from the phone: time on court and where it
-- came from, heart rate only when the author sent a maxHr key and is a
-- confirmed adult, never a start time, device, calories or Strain, and never
-- offered for CourtSide's Instagram. Runs as the author, so only their own
-- rows can be found.
create or replace function public.fill_post_session_stats() returns trigger language plpgsql as $$
declare v_a public.detected_activities; v_adult boolean; v_src text; v_s jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' and new.session is not distinct from old.session then
    if new.session ? 'activityId' then new.feature_ok := false; end if;
    return new;
  end if;
  if pg_column_size(new.session) > 4000 then raise exception 'session too large'; end if;
  if not (new.session ? 'activityId') then
    new.session := new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show';
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show';
    return new;
  end if;
  v_adult := coalesce((select age_group = 'adult' from public.profiles where id = new.author_id), false);
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', 'Tennis', 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
  if v_adult and new.session ? 'maxHr' then v_s := v_s || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr)); end if;
  if (new.session->>'intensity') in ('1', '2', '3', '4', '5') then v_s := v_s || jsonb_build_object('intensity', (new.session->>'intensity')::int); end if;
  new.session := v_s;
  new.feature_ok := false;
  return new;
end $$;
drop trigger if exists fill_post_session_stats on public.posts;
create trigger fill_post_session_stats before insert or update of session, feature_ok on public.posts for each row execute function public.fill_post_session_stats();

-- ------------------------------------------------------------------ grants
-- Server only (the whoop function and the other functions here).
revoke all on function public.activity_int(text, int, int) from public, anon, authenticated;
revoke all on function public.flag_on_for(text, uuid) from public, anon, authenticated;
revoke all on function public.tennis_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public.whoop_tennis_users(bigint) from public, anon, authenticated;
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.withdraw_activity(uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_whoop_refresh(uuid) from public, anon, authenticated;
revoke all on function public.forget_whoop_data(uuid) from public, anon, authenticated;
revoke all on function public.expire_activities(uuid) from public, anon, authenticated;
revoke all on function public.sweep_activities() from public, anon, authenticated;
grant execute on function public.tennis_allowed(uuid, text) to service_role;
grant execute on function public.whoop_tennis_users(bigint) to service_role;
grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function public.withdraw_activity(uuid, text, text) to service_role;
grant execute on function public.claim_whoop_refresh(uuid) to service_role;
grant execute on function public.forget_whoop_data(uuid) to service_role;
grant execute on function public.sweep_activities() to service_role;
-- Signed-in players.
revoke all on function public.report_activity(text, jsonb) from public, anon;
grant execute on function public.report_activity(text, jsonb) to authenticated;
revoke all on function public.dismiss_activity(uuid) from public, anon;
grant execute on function public.dismiss_activity(uuid) to authenticated;
-- Anyone, signed in or not (signed out, every switch reads false).
revoke all on function public.my_flags() from public;
grant execute on function public.my_flags() to anon, authenticated;

-- --------------------------------------------------------------- scheduler
-- Supabase's free scheduler runs the sweep every 15 minutes. Where it is not
-- available this says so and carries on: the whoop function's /sync runs the
-- sweep too. Scheduling the same job name again replaces it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('courtside-activity-sweep', '*/15 * * * *', 'select public.sweep_activities()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): /sync runs the sweep instead', sqlerrm;
end $$;

-- ------------------------------------------------- checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The switches (expect tennis-apple and tennis-whoop, both 'off' the first time):
-- select key, value from server_settings where key like 'flag:%';
--
-- (b) The new tables and columns (expect detected_activities and whoop_pending plus practice_sessions.activity_id,
--     user_state.push_activity, health_connections.reads_workouts, whoop_tokens.scope):
-- select table_name, column_name from information_schema.columns
--   where table_schema = 'public'
--   and (table_name in ('detected_activities', 'whoop_pending')
--     or (table_name, column_name) in (('practice_sessions', 'activity_id'), ('user_state', 'push_activity'),
--                                      ('health_connections', 'reads_workouts'), ('whoop_tokens', 'scope')))
--   order by 1, 2;
--
-- (c) Who may call what (expect report_activity, dismiss_activity and my_flags true; record_activity and forget_whoop_data false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('record_activity', 'report_activity', 'dismiss_activity', 'my_flags', 'forget_whoop_data') order by 1;
--
-- (d) The 15-minute sweep (expect courtside-activity-sweep, */15 * * * *; if this errors, pg_cron is not set up and /sync runs the sweep):
-- select jobname, schedule from cron.job;
--
-- (e) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
