-- CourtSide · undo for migration 20261024000185_auto_log.
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take the auto log back out.
-- It puts back, word for word, the live versions of the functions 185
-- replaced, as read from the live database on Oct 24 2026 before 185 (138's
-- note_detected_activity and sweep_activities, record_activity,
-- mark_activity_logged, withdraw_activity, 183's send_activity_pushes, 116's
-- invite_second_day and invite_first_action), and takes out 185's new
-- trigger and functions. All-or-nothing; safe to run more than once.
--
-- What stays: the new columns (auto_logged, unsure, auto_log), unused, and
-- any session already logged for a player (it is an ordinary session in
-- their log from then on; they can remove it from Your sessions). The app
-- update shows "Not tennis? Remove" only on those; after this undo that
-- button says "That didn't remove", so remove them from Your sessions.

begin;

CREATE OR REPLACE FUNCTION public.note_detected_activity(a_id uuid, quiet boolean DEFAULT false, force_pending boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a public.detected_activities;
  v_twin uuid;
  v_label text;
  v_who text;
  v_day text;
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

  -- The same session seen twice (WHOOP and the Watch, say): the earlier row
  -- carries the alert, this one stays quiet. Only ever the same sport.
  select o.id into v_twin from public.detected_activities o
   where o.user_id = v_a.user_id and o.id <> v_a.id and o.sport = v_a.sport and o.status in ('new', 'logged', 'dismissed') and o.created_at <= v_a.created_at
     and (abs(extract(epoch from o.started_at - v_a.started_at)) <= 600
          or extract(epoch from least(o.ended_at, v_a.ended_at) - greatest(o.started_at, v_a.started_at))
             >= 0.5 * least(extract(epoch from o.ended_at - o.started_at), extract(epoch from v_a.ended_at - v_a.started_at)))
   order by o.created_at limit 1;
  if v_twin is not null then
    update public.detected_activities set status = 'duplicate', duplicate_of = v_twin, notified_at = now(), updated_at = now() where id = v_a.id;
    return 'duplicate';
  end if;

  -- Too old to be news: it stays in the list, without an alert. Eight days,
  -- so the phone's first look back over the past week files each one.
  if v_a.ended_at < now() - interval '8 days' then return 'stale'; end if;

  -- The player already logged it by hand (a session of the same kind, saved
  -- between the start and 12 hours after the end): tennis for tennis. For any
  -- other workout, a fitness session about as long (within 30%, or 5
  -- minutes) that no other workout already stands for, so one session logged
  -- by hand never hides a whole day's workouts.
  if exists (select 1 from public.practice_sessions s where s.user_id = v_a.user_id and s.activity_id is null
               and s.created_at between v_a.started_at and v_a.ended_at + interval '12 hours'
               and case when v_a.sport = 'tennis' then s.kind in ('practice', 'match', 'drills')
                        else s.kind = 'fitness' and abs(s.minutes - v_a.minutes) <= greatest(5, 0.3 * v_a.minutes)
                             and not exists (select 1 from public.detected_activities o
                                              where o.user_id = v_a.user_id and o.id <> v_a.id and o.sport <> 'tennis'
                                                and o.status = 'duplicate' and o.duplicate_of is null
                                                and s.created_at between o.started_at and o.ended_at + interval '12 hours'
                                                and abs(s.minutes - o.minutes) <= greatest(5, 0.3 * o.minutes)) end) then
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
  -- Found long after it ended (catching up on the past week): which day, where it was played.
  if v_a.ended_at < now() - interval '20 hours' and v_a.tz_offset_min is not null then
    v_day := to_char((v_a.started_at at time zone 'UTC') + make_interval(mins => v_a.tz_offset_min), 'Dy');
  end if;
  -- From the player to themselves: the Notifications page shows it, and
  -- push_for_notification skips it (the buzz, if any, is sent below).
  -- "32 min · from your Apple Watch" (tennis, as before); "Run · 32 min · from your Apple Watch".
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (v_a.user_id, v_a.user_id, 'activity', v_a.id::text, 'activity',
            concat_ws(' · ', case when v_a.sport <> 'tennis' then public.workout_name(v_a.sport) end, v_day, v_label) || ' · from ' || v_who);

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
  -- The lock-screen alert: on its own, as before ("Tennis detected", "Activity
  -- detected"), unless it is the fourth or more in one go, when ONE "4 workouts
  -- found" stands for them all ('pushed-found'; any more in that go, 'folded').
  return public.send_activity_pushes(v_a.user_id, array[v_a.id]);
end $function$;

CREATE OR REPLACE FUNCTION public.send_activity_pushes(u uuid, ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_due uuid[];
  v_ones uuid[];
  v_go uuid[];
  v_found boolean;
  v_n int;
  v_tennis boolean;
  r record;
begin
  if u is null or coalesce(cardinality(ids), 0) = 0 then return 'none'; end if;
  -- One person's alerts one at a time (note_detected_activity holds the same lock).
  perform pg_advisory_xact_lock(hashtextextended('activity:' || u::text, 0));
  -- Theirs, still waiting to be logged, not alerted since they were filed: newest first.
  -- Only sessions of 20 minutes or more buzz (owner, Oct 24: "I like only sessions
  -- over 20"); a shorter one is already filed quietly in To do and Notifications.
  select array_agg(d.id order by d.ended_at desc) into v_due from public.detected_activities d
   where d.user_id = u and d.id = any(ids) and d.status = 'new' and d.minutes >= 20
     and (d.pushed_at is null or d.pushed_at < d.notified_at);
  if v_due is null then return 'none'; end if;
  -- The go under way: their alerts in the last ten minutes. Already told "N workouts found" in it?
  select coalesce(bool_or(d.pushed_as = 'found'), false) into v_found
    from public.detected_activities d
   where d.user_id = u and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  -- These join it quietly (the app's one row counts them).
  if v_found then
    update public.detected_activities set pushed_at = now(), pushed_as = 'folded' where id = any(v_due);
    return 'folded';
  end if;
  -- Its single alerts, those still waiting to be logged (one logged or hidden since is not counted).
  select coalesce(array_agg(d.id order by d.ended_at desc), '{}') into v_ones
    from public.detected_activities d
   where d.user_id = u and d.pushed_as = 'one' and d.status = 'new'
     and d.pushed_at > now() - interval '10 minutes' and not (d.id = any(v_due));
  v_n := cardinality(v_ones) + cardinality(v_due);
  -- Three or fewer in the go: one each, as before. No numbers on the lock screen: the time and stats show only in the app.
  if v_n <= 3 then
    for r in select d.id, d.sport from public.detected_activities d where d.id = any(v_due) order by d.ended_at loop
      if r.sport = 'tennis' then
        perform public.send_push(u, 'Tennis detected', 'Log it on CourtSide.', '/log-session?activity=' || r.id);
      else
        perform public.send_push(u, 'Activity detected', public.workout_name(r.sport) || ' · Log it on CourtSide.', '/log-session?activity=' || r.id);
      end if;
    end loop;
    update public.detected_activities set pushed_at = now(), pushed_as = 'one' where id = any(v_due);
    return 'pushed';
  end if;
  -- More than three: ONE alert for the go, opening its list in the app.
  select array_agg(d.id order by d.ended_at desc), coalesce(bool_and(d.sport = 'tennis'), false) into v_go, v_tennis
    from public.detected_activities d where d.id = any(v_due || v_ones);
  perform public.send_push(u, v_n || case when v_tennis then ' tennis sessions found' else ' workouts found' end,
                           'Tap to log them on CourtSide.', '/notifications?workouts=' || array_to_string(v_go[1:40], ','));
  update public.detected_activities set pushed_at = now(), pushed_as = case when id = v_due[1] then 'found' else 'folded' end where id = any(v_due);
  return 'pushed-found';
end $function$;

CREATE OR REPLACE FUNCTION public.sweep_activities()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_filed uuid[] := '{}';
  v_due uuid[];
  v_push boolean;
begin
  for r in select id from public.detected_activities
            where status = 'new' and notified_at is null and score_state = 'PENDING_SCORE'
              and ended_at between now() - interval '12 hours' and now() - interval '45 minutes'
              and public.activity_allowed(user_id, source, sport) loop
    if public.note_detected_activity(r.id, true, true) = 'filed' then v_filed := v_filed || r.id; end if;
  end loop;
  for r in select distinct d.user_id from public.detected_activities d where d.id = any(v_filed) loop
    select push_activity into v_push from public.user_state where user_id = r.user_id;
    if v_push is false then continue; end if;
    select array_agg(d.id) into v_due from public.detected_activities d
     where d.id = any(v_filed) and d.user_id = r.user_id
       and (d.tz_offset_min is null
            or extract(hour from (now() at time zone 'UTC') + make_interval(mins => d.tz_offset_min))::int between 7 and 21);
    perform public.send_activity_pushes(r.user_id, v_due);
  end loop;
  perform public.expire_activities(null);
  -- WHOOP sign-ins nobody collected.
  delete from public.whoop_pending where expires_at < now();
end $function$;

CREATE OR REPLACE FUNCTION public.record_activity(u uuid, src text, ext text, p jsonb, quiet boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.mark_activity_logged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' and new.activity_id is not null then
    update public.detected_activities set status = 'logged', session_id = new.id, updated_at = now() where id = new.activity_id and user_id = new.user_id;
  elsif tg_op = 'DELETE' and old.activity_id is not null then
    update public.detected_activities set status = 'new', session_id = null, updated_at = now() where id = old.activity_id and status = 'logged';
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.withdraw_activity(u uuid, src text, ext text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.detected_activities set status = 'withdrawn', notified_at = null, updated_at = now() where user_id = u and source = src and external_id = ext and status in ('new', 'duplicate');
  delete from public.notifications n using public.detected_activities d
   where d.user_id = u and d.source = src and d.external_id = ext and d.status = 'withdrawn' and n.user_id = u and n.kind = 'activity' and n.target_id = d.id::text;
$function$;

CREATE OR REPLACE FUNCTION public.invite_first_action(u uuid, inviter uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select min(t) from (
              select created_at as t from public.follows           where follower_id = u and following_id is distinct from inviter
    union all select created_at        from public.posts             where author_id = u
    union all select created_at        from public.questions         where author_id = u
    union all select created_at        from public.answers           where author_id = u
    union all select created_at        from public.comments          where author_id = u
    union all select created_at        from public.hit_requests      where author_id = u
    union all select created_at        from public.hit_joins         where user_id = u
    union all select created_at        from public.messages          where sender_id = u
    union all select created_at        from public.practice_sessions where user_id = u
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.invite_second_day(u uuid, joined timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s(t) as (
              select updated_at        from public.push_tokens    where user_id = u
    union all select last_seen_at      from public.device_sightings where user_id = u
    union all select first_seen_at     from public.device_sightings where user_id = u
    union all select seen_at           from public.last_seen      where user_id = u
    union all select seen_at           from public.exact_spots    where user_id = u
    union all select first_seen_at     from public.feed_signals   where user_id = u
    union all select last_seen_at      from public.feed_signals   where user_id = u
    union all select updated_at        from public.user_state     where user_id = u
    union all select first_at          from public.app_opens      where user_id = u
    union all select created_at        from public.posts          where author_id = u
    union all select created_at        from public.comments       where author_id = u
    union all select created_at        from public.post_likes     where user_id = u
    union all select created_at        from public.questions      where author_id = u
    union all select created_at        from public.answers        where author_id = u
    union all select created_at        from public.messages       where sender_id = u
    union all select viewed_at         from public.story_views    where user_id = u
    union all select created_at        from public.hit_joins      where user_id = u
    union all select created_at        from public.hit_requests   where author_id = u
    union all select created_at        from public.court_checkins where user_id = u
    union all select created_at        from public.follows        where follower_id = u
    union all select created_at        from public.practice_sessions where user_id = u
  )
  select min(t) from s
   where t >= joined + interval '20 hours' and t < joined + interval '14 days' and t <= now()
$function$;

drop trigger if exists hand_log_replaces_auto on public.practice_sessions;
drop function if exists public.replace_auto_log();
drop function if exists public.remove_auto_log(uuid);
drop function if exists public.auto_log_activity(uuid, uuid);
drop function if exists public.session_unposted(uuid, uuid);
drop function if exists public.activity_day(uuid, timestamptz, int);

-- Server only, as before 185.
revoke all on function public.note_detected_activity(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.send_activity_pushes(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.sweep_activities() from public, anon, authenticated;
revoke all on function public.record_activity(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.withdraw_activity(uuid, text, text) from public, anon, authenticated;
revoke all on function public.invite_first_action(uuid, uuid) from public, anon, authenticated;
revoke all on function public.invite_second_day(uuid, timestamptz) from public, anon, authenticated;

do $$
declare
  k text;
  want jsonb := '{
    "note_detected_activity(uuid,boolean,boolean)": "804e5d88e5a616bd9890a116f8d749bd",
    "send_activity_pushes(uuid,uuid[])": "662ae4e0364d645f59480587a15c2b5c",
    "sweep_activities()": "f4f320c3bf39edc4bb488c1966b4900b",
    "record_activity(uuid,text,text,jsonb,boolean)": "7dd7db000e6fe7421b6147c4d8b18eca",
    "mark_activity_logged()": "044c9ee535f1637deae6e5efea2e9bfe",
    "withdraw_activity(uuid,text,text)": "18f79010bf2780b2719160e9a7d44962",
    "invite_first_action(uuid,uuid)": "d908956bf0346e22406b4ba45e4b6ba2",
    "invite_second_day(uuid,timestamp with time zone)": "b2da94c30b820977f86e3b77c8ceb0f7"
  }';
begin
  for k in select jsonb_object_keys(want) loop
    if (select md5(p.prosrc) from pg_proc p where p.oid = ('public.' || k)::regprocedure) is distinct from want->>k then
      raise exception 'Undo of 185 stopped: % did not go back. Nothing was changed.', k;
    end if;
  end loop;
end $$;

commit;
