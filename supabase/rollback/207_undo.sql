-- CourtSide · undo of migration 20261030000207: report_court_status and
-- court_right_now back to exactly as they were before it (migration 60's and
-- migration 204's), and court_status without at_court.
--
-- Run it in the Supabase SQL editor as one piece. All-or-nothing; safe to run
-- more than once. It stops, changing nothing, if either function is neither
-- 207's nor already as before. Afterwards every Busy or Full answer lights its
-- court again, from wherever it was given (as on Oct 29), and an app that
-- sends a position with its answer falls back to the old call by itself.

begin;

do $$
begin
  if not (
       (to_regprocedure('public.report_court_status(text, text, double precision, double precision)') is not null
        and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.report_court_status(text, text, double precision, double precision)') and md5(p.prosrc) = '9cf4bfa335a3f9ad438086b6f7923c0c'))
    or (to_regprocedure('public.report_court_status(text, text, double precision, double precision)') is null
        and exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.report_court_status(text, text)') and md5(p.prosrc) = 'ef84d740d834b759bdf88b704e9630ec'))
  ) then
    raise exception 'Undo 207 stopped before changing anything: report_court_status is not as 207 or 60 left it. Ask Claude to look.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.court_right_now(text[])') and md5(p.prosrc) in ('c462c9ff3b1e6811fbf8a53b43905c1a', 'edbebe69561ce181c8876a60de755221')) then
    raise exception 'Undo 207 stopped before changing anything: court_right_now is not as 207 or 204 left it. Ask Claude to look.';
  end if;
end $$;

drop function if exists public.report_court_status(text, text, double precision, double precision);
create or replace function public.report_court_status(p_court text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_status is null then
    delete from public.court_status where court_id = p_court and user_id = me;
    return;
  end if;
  if p_status not in ('free', 'wait', 'full', 'wet', 'locked') then raise exception 'status?'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'court?'; end if;
  if (select access from public.courts where id = p_court) = 'private' then raise exception 'private_court'; end if;
  if (select count(*) from public.court_status where user_id = me and court_id <> p_court and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'slow down';
  end if;
  insert into public.court_status (court_id, user_id, status, created_at) values (p_court, me, p_status, now())
    on conflict (court_id, user_id) do update set status = excluded.status, created_at = excluded.created_at;
  delete from public.court_status where created_at < now() - interval '90 minutes';
end $$;
revoke all on function public.report_court_status(text, text) from public, anon;
grant execute on function public.report_court_status(text, text) to authenticated, service_role;

drop function if exists public.court_right_now(text[]);
CREATE OR REPLACE FUNCTION public.court_right_now(ids text[])
 RETURNS TABLE(court_id text, status text, status_at timestamp with time zone, playing integer, friend_ids uuid[], you_here boolean, you_until timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Only someone who said yes to "Who can see you on the map?" counts (migration 191); no answer is not a yes.
      and us.map_visibility in ('nearby', 'mutuals')
      and not public.is_blocked_between(me.id, k.user_id)
  )
  select w.id, st.status, st.created_at,
    case when me.adult and coalesce(h.settled, 0) >= 2 then h.n else 0 end,
    case when me.adult then coalesce(h.friends, '{}'::uuid[]) else '{}'::uuid[] end,
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now()),
    -- When yours there ends, so "You're here · till 6:30pm" survives the app reopening (migration 204).
    (select k.until from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
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
$function$;
revoke all on function public.court_right_now(text[]) from public, anon;
grant execute on function public.court_right_now(text[]) to authenticated, service_role;

alter table public.court_status drop column if exists at_court;

do $$
begin
  if to_regprocedure('public.report_court_status(text, text, double precision, double precision)') is not null
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.report_court_status(text, text)'))) is distinct from 'ef84d740d834b759bdf88b704e9630ec'
     or md5((select prosrc from pg_proc where oid = to_regprocedure('public.court_right_now(text[])'))) is distinct from 'edbebe69561ce181c8876a60de755221' then
    raise exception 'Undo 207 stopped: a function did not come out as before. Nothing changed.';
  end if;
  if not has_function_privilege('authenticated', 'public.report_court_status(text, text)', 'execute')
     or has_function_privilege('anon', 'public.report_court_status(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.court_right_now(text[])', 'execute')
     or has_function_privilege('anon', 'public.court_right_now(text[])', 'execute') then
    raise exception 'Undo 207 stopped: who may call the functions changed. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
