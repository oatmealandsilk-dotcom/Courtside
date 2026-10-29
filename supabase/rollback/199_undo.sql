-- CourtSide · undo for migration 20261029000199_teen_heart_rate (199).
--
-- NOT A MIGRATION (it lives outside supabase/migrations on purpose). Run it in
-- the Supabase SQL editor as one piece only to take 199 back out.
-- All-or-nothing; safe to run more than once.
--
-- It puts back 193's auto_post_for_session word for word (checked letter for
-- letter at the end): a session that logs itself carries heart rate, zones,
-- calories and Strain only for a player known to be an adult, none for anyone
-- else. And the server posts of players not known to be adults get the empty
-- list back, so their numbers come off, while their tracker record is there.
-- One whose record is gone (30 days after the session) cannot be redone by
-- the posts trigger without losing its tracker link, so it keeps the numbers
-- 199 gave it (counted in the notice). Posts players made themselves are not
-- touched. The app needs no change either way: "Share health data" starting
-- on for every age is the app's own default, and a post's list is still read
-- at any age (72).

begin;

do $$
declare
  v_n int;
  v_now text;
begin
  select count(*), max(md5(p.prosrc)) into v_n, v_now from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'auto_post_for_session';
  if v_n <> 1 or v_now not in ('d9b2a33eb15b24cc0253f627b20455e4', '4b66fb4ad57e0a41a0d27a218ee0028a') then
    raise exception 'Undo 199 stopped before changing anything: auto_post_for_session changed after 199. Ask Claude to look.';
  end if;
end $$;

-- 193's auto_post_for_session, exactly as 193 wrote it.
create or replace function public.auto_post_for_session(s_id uuid, held boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_s public.practice_sessions;
  v_a public.detected_activities;
  v_id uuid;
  v_held boolean;
begin
  select * into v_s from public.practice_sessions where id = s_id;
  if not found or not v_s.auto_logged or v_s.activity_id is null then return null; end if;
  select * into v_a from public.detected_activities where id = v_s.activity_id and user_id = v_s.user_id;
  if not found then return null; end if;
  if exists (select 1 from public.posts p where p.author_id = v_s.user_id and jsonb_typeof(p.session) = 'object'
               and (lower(p.session->>'activityId') = v_a.id::text or lower(p.session->>'sessionId') = v_s.id::text)) then
    return null;
  end if;
  v_held := coalesce(held, false) or v_a.source in ('apple-health', 'health-connect')
    or not exists (select 1 from public.user_state us where us.user_id = v_s.user_id and us.auto_log_audience is not null)
    or ((v_a.unsure and not public.unsure_learned(v_a.user_id, v_a.source)) or v_a.minutes < 20)
       and exists (select 1 from public.detected_activities d
                    where d.user_id = v_a.user_id and d.duplicate_of = v_a.id and d.source in ('apple-health', 'health-connect'));
  begin
    perform set_config('courtside.auto_post', 'on', true);
    insert into public.posts (author_id, kind, body, session, auto_logged, auto_held)
      values (v_s.user_id, 'note', '', jsonb_build_object('activityId', v_a.id, 'drills', '[]'::jsonb,
                     'share', case when public.known_adult(v_s.user_id) then '["hr", "zones", "strain", "kcal"]'::jsonb else '[]'::jsonb end), true, v_held)
      returning id into v_id;
    perform set_config('courtside.auto_post', '', true);
    -- When it was played, not when the tracker sent it (a week caught up arrives at once).
    perform set_config('courtside.counter_ok', 'on', true);
    update public.posts set created_at = least(v_a.ended_at, now()) where id = v_id;
    perform set_config('courtside.counter_ok', '', true);
  exception when others then
    perform set_config('courtside.auto_post', '', true);
    perform set_config('courtside.counter_ok', '', true);
    raise warning 'auto post for session %: %', s_id, sqlerrm;
    return null;
  end;
  return v_id;
end $$;

-- Players not known to be adults: their server posts' numbers come off again.
do $$
declare
  v_done int;
  v_kept int;
begin
  update public.posts p
     set session = jsonb_set(p.session, '{share}', '[]'::jsonb)
   where p.auto_logged and jsonb_typeof(p.session) = 'object'
     and not public.known_adult(p.author_id)
     and (p.session->'share') is distinct from '[]'::jsonb
     and exists (select 1 from public.detected_activities d
                  where d.id::text = p.session->>'activityId' and d.user_id = p.author_id);
  get diagnostics v_done = row_count;
  select count(*) into v_kept from public.posts p
   where p.auto_logged and jsonb_typeof(p.session) = 'object'
     and not public.known_adult(p.author_id)
     and (p.session->'share') is distinct from '[]'::jsonb;
  raise notice 'Numbers taken off: %. Kept (tracker record gone): %.', v_done, v_kept;
end $$;

do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.auto_post_for_session(uuid, boolean)'::regprocedure)
       is distinct from '4b66fb4ad57e0a41a0d27a218ee0028a' then
    raise exception 'Undo 199 stopped: auto_post_for_session is not 193''s. Nothing was changed.';
  end if;
end $$;

commit;
