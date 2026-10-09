-- CourtSide · migration 20261008000155: WHOOP workouts keep their heart rate
-- and heart-rate zones (bug found Oct 8).
--
-- NOT APPLIED — the lead applies it. Run it in the Supabase SQL editor as one
-- piece. It is all-or-nothing: if a check fails it stops, and nothing at all
-- changes. Safe to run more than once.
--
-- The bug, in plain words: every WHOOP workout lost its average heart rate,
-- max heart rate and zone times on the way in, and kept only its Strain and
-- calories. The owner's 2h40m tennis on Oct 8 (avg ~125, max ~178 in the
-- WHOOP app) showed only "Strain 15.0 · 1197 cal". All 17 WHOOP workouts on
-- the live database looked the same (no heart rate, no zones, every one with
-- Strain and calories); all 26 from Apple Health had their heart rate.
--
-- Why: record_activity drops the heart rate when WHOOP says its strap heard
-- the heart for under half the workout ("percent_recorded" under 50). WHOOP's
-- docs say that number runs 0 to 100, but WHOOP sends it as a fraction, 0 to 1:
-- a whole session is 1.0, which read as 1%. Strain and calories are never
-- held back that way, which is why they alone survived. Apple Health never
-- sends that number (report_activity takes it off), so Apple's heart rate was
-- always kept.
--
-- What changes, by name:
--   record_activity (migration 107's, word for word apart from the lines that
--     read "percent_recorded" and one new variable, v_pct): 1 or less is now
--     read as a fraction (0.85 → 85%, 1 → 100%); anything over 1 is read
--     exactly as before (85 → 85%). Under 50% still drops the heart rate and
--     zones, as before. Every other check is unchanged. Same name, same
--     inputs, same "server only" permissions.
--   whoop_tokens.hr_refilled_at (new, private like the rest of that table):
--     when the whoop function filled in this person's earlier WHOOP
--     workouts. Empty for everyone connected today, so the next look from
--     their app (it checks when opened, at most hourly) asks WHOOP once more
--     for the WHOOP workouts already here without a heart rate (back to the
--     oldest, 30 days at most) and fills in their heart rate and zones; then
--     it is set and never done again. Nothing new is added and nothing is
--     taken away by it. A connection made after this file starts with it set
--     (nothing to fill). Until the new whoop function is deployed, nothing
--     reads it.
--
-- What does not change: a post already shared keeps exactly the numbers its
-- author chose when sharing it. The app only offered the numbers the workout
-- had, so those posts list Strain and calories at most, never heart rate.
-- Nothing here adds heart rate to anyone's post. The author adds it from
-- Edit post → "Share health data" → Choose (see the report).
--
-- Stops without changing anything if record_activity has changed since the
-- version this file was written against (107, as live on Oct 8).
--
-- To try it first without keeping anything: put "rollback;" in place of the
-- last "commit;" below, run the whole file, then put "commit;" back. Every
-- check runs and nothing is kept.
--
-- To undo (the bug comes back for new WHOOP workouts; ones already filled in
-- keep their heart rate): run migration 107's section "4. a tracker's session
-- comes in" (its create or replace function public.record_activity … end $$;)
-- and then
--   revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
--   grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;
-- The new column can stay: it only tells the whoop function the filling-in is
-- done.

begin;

do $$
declare
  is_now text;
begin
  if to_regclass('public.detected_activities') is null or to_regclass('public.whoop_tokens') is null
     or to_regprocedure('public.activity_int(text, int, int)') is null or to_regprocedure('public.activity_zones(jsonb, int)') is null
     or to_regprocedure('public.activity_allowed(uuid, text, text)') is null or to_regprocedure('public.note_detected_activity(uuid, boolean, boolean)') is null
     or to_regprocedure('public.expire_activities(uuid)') is null
     or to_regprocedure('public.record_activity(uuid, text, text, jsonb, boolean)') is null then
    raise exception 'Migration 155 stopped before changing anything: it needs detected_activities, whoop_tokens and record_activity with its helpers from migrations 58, 65 and 107.';
  end if;
  select md5(p.prosrc) into is_now from pg_proc p where p.oid = 'public.record_activity(uuid, text, text, jsonb, boolean)'::regprocedure;
  -- Migration 107's version, or this file's own (run again).
  if is_now is distinct from '204b3c5b813b86e4128786eb7bddabfc' and is_now is distinct from '7dd7db000e6fe7421b6147c4d8b18eca' then
    raise exception 'Migration 155 stopped before changing anything: record_activity changed since migration 107. This file must be brought up to date with that change first.';
  end if;
end $$;

-- ------------------------------------------- 1. a tracker's session comes in
-- Migration 107's, word for word, but for "percent_recorded" (v_pct and the
-- lines under "How much of it").
create or replace function public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  mins int;
  pct int;
  v_pct text;
  hr_ok boolean;
  v_strain numeric;
  v_sport text;
  v_id uuid;
  v_note text;
  v_status text;
begin
  -- What it was: 'tennis' when the sender does not say (WHOOP and the other trackers, older phones).
  v_sport := coalesce(nullif(lower(btrim(p->>'sport')), ''), 'tennis');
  if u is null or src not in ('whoop', 'apple-health', 'health-connect', 'fitbit', 'oura', 'polar') or coalesce(char_length(ext), 0) not between 1 and 100
     or v_sport !~ '^[a-z][a-z0-9-]{1,39}$' or not public.activity_allowed(u, src, v_sport) then
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
  -- Heart rate (and its zones) from a strap that was barely on is not worth showing.
  -- How much of it the strap heard, as a percent. WHOOP sends a fraction, 0 to
  -- 1 (1 for a whole session), though its docs say 0 to 100: so 1 or less is a
  -- fraction (migration 155). Anything else is read exactly as before.
  v_pct := p->>'percent_recorded';
  if v_pct ~ '^[0-9]+([.][0-9]+)?$' then
    if v_pct::numeric <= 1 then v_pct := (v_pct::numeric * 100)::text; end if;
  end if;
  pct := public.activity_int(v_pct, 0, 100);
  hr_ok := pct is null or pct >= 50;
  v_strain := case when p->>'strain' ~ '^[0-9]+([.][0-9]+)?$' then case when (p->>'strain')::numeric <= 21 then round((p->>'strain')::numeric, 1) end end;

  insert into public.detected_activities as d (user_id, source, external_id, sport, started_at, ended_at, tz_offset_min, minutes, avg_hr, max_hr, kcal, strain, score_state, device, hr_zones, distance_m)
  values (
    u, src, ext, v_sport, t0, t1,
    public.activity_int(p->>'tz_offset_min', -840, 840),
    mins,
    case when hr_ok then public.activity_int(p->>'avg_hr', 30, 250) end,
    case when hr_ok then public.activity_int(p->>'max_hr', 30, 250) end,
    public.activity_int(p->>'kcal', 0, 10000),
    v_strain,
    case when p->>'score_state' in ('SCORED', 'PENDING_SCORE', 'UNSCORABLE') then p->>'score_state' end,
    nullif(left(btrim(p->>'device'), 60), ''),
    case when hr_ok then public.activity_zones(p->'hr_zones', mins) end,
    public.activity_int(p->>'distance_m', 0, 1000000)
  )
  on conflict (user_id, source, external_id) do update set
    sport = excluded.sport,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    minutes = excluded.minutes,
    tz_offset_min = coalesce(excluded.tz_offset_min, d.tz_offset_min),
    -- A re-score from a strap that was barely on takes the heart rate (and
    -- its zones) off, rather than keeping the earlier numbers.
    avg_hr = case when hr_ok then coalesce(excluded.avg_hr, d.avg_hr) end,
    max_hr = case when hr_ok then coalesce(excluded.max_hr, d.max_hr) end,
    kcal = coalesce(excluded.kcal, d.kcal),
    strain = coalesce(excluded.strain, d.strain),
    score_state = coalesce(excluded.score_state, d.score_state),
    device = coalesce(excluded.device, d.device),
    hr_zones = case when hr_ok then coalesce(excluded.hr_zones, d.hr_zones) end,
    distance_m = coalesce(excluded.distance_m, d.distance_m),
    -- The tracker took it back and then sent it again: it is news once more.
    status = case when d.status = 'withdrawn' then 'new' else d.status end,
    updated_at = now()
  returning d.id into v_id;

  v_note := public.note_detected_activity(v_id, quiet);
  select status into v_status from public.detected_activities where id = v_id;
  perform public.expire_activities(u);
  return jsonb_build_object('id', v_id, 'status', v_status, 'note', v_note);
end $$;

-- Server only, as before (58, 65, 107): the whoop and trackers functions call it.
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.record_activity(uuid, text, text, jsonb, boolean) to service_role;

-- ------------------------------------------- 2. filling in what was lost, once
-- Empty (to do) for every WHOOP connection there is now; set for any made
-- from here on. The whoop function sets it once it has asked WHOOP again for
-- that person's workouts without a heart rate (30 days at most).
alter table public.whoop_tokens add column if not exists hr_refilled_at timestamptz;
alter table public.whoop_tokens alter column hr_refilled_at set default now();
comment on column public.whoop_tokens.hr_refilled_at is 'When the whoop function asked WHOOP again for this person''s workouts (30 days at most) to fill in the heart rate and zones lost before migration 155. Null = still to do. Private, like the rest of whoop_tokens.';

-- ------------------------------------------------------------ 3. last check
do $$
declare
  f record;
begin
  select md5(p.prosrc) as src, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('service_role', p.oid, 'execute') as server,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as signed_in
    into f from pg_proc p where p.oid = 'public.record_activity(uuid, text, text, jsonb, boolean)'::regprocedure;
  if f.src is distinct from '7dd7db000e6fe7421b6147c4d8b18eca' or not f.definer or f.config is distinct from array['search_path=public'] then
    raise exception 'Migration 155 stopped: record_activity is not this file''s. Nothing was changed.';
  end if;
  if not f.server or f.anon or f.signed_in then
    raise exception 'Migration 155 stopped: record_activity''s permissions are not server only. Nothing was changed.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'whoop_tokens' and column_name = 'hr_refilled_at') then
    raise exception 'Migration 155 stopped: whoop_tokens.hr_refilled_at is not there. Nothing was changed.';
  end if;
  if has_table_privilege('anon', 'public.whoop_tokens', 'select') or has_table_privilege('authenticated', 'public.whoop_tokens', 'select') then
    raise exception 'Migration 155 stopped: whoop_tokens can be read from the app. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 4. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) record_activity is this file's (expect 7dd7db000e6fe7421b6147c4d8b18eca):
-- select md5(prosrc) from pg_proc where oid = 'public.record_activity(uuid, text, text, jsonb, boolean)'::regprocedure;
--
-- (b) Who is still to have their WHOOP workouts filled in (expect one row per
--     WHOOP connection, refilled empty, until each person next opens the app):
-- select user_id, hr_refilled_at from public.whoop_tokens order by hr_refilled_at nulls first;
--
-- (c) WHOOP workouts of the last 30 days with and without heart rate (after
--     each person's next look, expect with_hr to be most of them):
-- select count(*) as whoop, count(avg_hr) as with_hr, count(hr_zones) as with_zones
--   from public.detected_activities where source = 'whoop' and started_at > now() - interval '30 days';
