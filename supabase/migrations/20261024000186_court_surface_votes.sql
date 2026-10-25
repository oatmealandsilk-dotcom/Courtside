-- CourtSide · migration 20261024000186: players say what a court is played on.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. Needs the
-- courts table (47), profiles.suspended_at (23) and the courts guard (60),
-- all live. All-or-nothing: if a check fails, it stops and nothing at all
-- changes. Safe to run more than once.
--
-- What it does (the owner, Oct 24, about a one-tap "What surface?" for
-- courts whose map data has no surface): "Once a court gets 5 taps of the
-- same surface in a row then it registers".
--
--   * court_surface_votes: one answer per player per court, Hard, Clay or
--     Grass. Tapping again changes it, and a change counts as that player's
--     newest answer. Tapping the answer you already gave changes nothing.
--   * courts.player_surface (and player_surface_at): the surface players
--     registered. The courts function's sync from OpenStreetMap never sends
--     these columns, so its upserts leave them alone; the app shows the
--     map's own surface whenever the map names one, and this one only when
--     it does not.
--   * vote_court_surface(court, surface): the one way in. It keeps the
--     answer, then takes each player's newest answer for the court, the
--     newest five by when they were given; when there are five and all five
--     say the same, that surface registers (and switches later the same
--     way, once five in a row say another). Answers it the player's own
--     answer, the court's registered surface, and how many of the newest
--     answers in a row agree.
--   * Limits: signed in and not suspended; answers on at most 60 courts a
--     day; one court's answer changed at most 10 times a day.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  r record;
begin
  if to_regclass('public.courts') is null or to_regclass('public.profiles') is null
     or to_regprocedure('public.guard_court_facts()') is null then
    raise exception 'Migration 186 stopped before changing anything: the courts and profiles tables and migration 60 (guard_court_facts) have to be there first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_at') then
    raise exception 'Migration 186 stopped before changing anything: profiles.suspended_at (23) is missing.';
  end if;
  for r in select p.prosrc as src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'vote_court_surface' loop
    if position('surface_votes_186' in r.src) = 0 then
      raise exception 'Migration 186 stopped before changing anything: public.vote_court_surface already exists and is not this file''s.';
    end if;
  end loop;
end $$;

-- ------------------------------------------------- 1. the registered surface
alter table public.courts
  add column if not exists player_surface text check (player_surface in ('hard', 'clay', 'grass')),
  add column if not exists player_surface_at timestamptz;

-- ----------------------------------------------------------- 2. the answers
create table if not exists public.court_surface_votes (
  court_id  text not null references public.courts(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  surface   text not null check (surface in ('hard', 'clay', 'grass')),
  voted_at  timestamptz not null default now(),
  -- How many times this answer changed in its day (the limit of 10).
  changes   smallint not null default 0,
  primary key (court_id, user_id)
);
create index if not exists court_surface_votes_court_idx on public.court_surface_votes (court_id, voted_at desc);
create index if not exists court_surface_votes_user_idx on public.court_surface_votes (user_id, voted_at desc);

alter table public.court_surface_votes enable row level security;
-- You see your own answers only; nobody sees who said what. No write rules:
-- every answer goes through vote_court_surface.
drop policy if exists "your own surface answers" on public.court_surface_votes;
create policy "your own surface answers" on public.court_surface_votes for select to authenticated using (user_id = auth.uid());
revoke all on public.court_surface_votes from public, anon, authenticated;
grant select on public.court_surface_votes to authenticated;

-- ------------------------------------------------------ 3. vote_court_surface
drop function if exists public.vote_court_surface(text, text);
create function public.vote_court_surface(p_court text, p_surface text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  had public.court_surface_votes;
  newest text[];
  agree int := 0;
  registered text;
  mine text;
begin
  -- surface_votes_186
  if me is null then raise exception 'sign in'; end if;
  if p_surface is null or p_surface not in ('hard', 'clay', 'grass') then raise exception 'surface?'; end if;
  if exists (select 1 from public.profiles where id = me and suspended_at is not null) then raise exception 'suspended'; end if;
  if p_court is null or not exists (select 1 from public.courts where id = p_court) then raise exception 'court?'; end if;
  -- One answer at a time per player (so 60 a day holds even when many are
  -- sent at once), then per court (so two players' taps at once are counted
  -- in order). Always in this order, so two answers never get stuck waiting on each other.
  perform pg_advisory_xact_lock(hashtextextended('court_surface_player:' || me::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('court_surface:' || p_court, 0));

  select * into had from public.court_surface_votes where court_id = p_court and user_id = me;
  if not found then
    if (select count(*) from public.court_surface_votes where user_id = me and voted_at > now() - interval '1 day') >= 60 then
      raise exception 'slow down';
    end if;
    -- clock_timestamp, not now(): answers given in one transaction still keep their order.
    insert into public.court_surface_votes (court_id, user_id, surface, voted_at, changes)
    values (p_court, me, p_surface, clock_timestamp(), 0);
  elsif had.surface <> p_surface then
    if had.voted_at > now() - interval '1 day' and had.changes >= 10 then raise exception 'slow down'; end if;
    update public.court_surface_votes
       set surface = p_surface, voted_at = clock_timestamp(),
           changes = case when had.voted_at > now() - interval '1 day' then had.changes + 1 else 1 end
     where court_id = p_court and user_id = me;
  end if;
  -- The same answer again changes nothing: it stays where it was in the order.

  -- Each player's newest answer (one row each), the newest five.
  select array_agg(t.surface order by t.voted_at desc, t.user_id) into newest
    from (select v.surface, v.voted_at, v.user_id from public.court_surface_votes v
           where v.court_id = p_court order by v.voted_at desc, v.user_id limit 5) t;
  -- How many of the newest, from the newest back, say the same.
  while agree < coalesce(array_length(newest, 1), 0) and newest[agree + 1] = newest[1] loop
    agree := agree + 1;
  end loop;

  select c.player_surface into registered from public.courts c where c.id = p_court;
  if agree = 5 and registered is distinct from newest[1] then
    update public.courts set player_surface = newest[1], player_surface_at = now() where id = p_court;
    registered := newest[1];
  end if;

  select v.surface into mine from public.court_surface_votes v where v.court_id = p_court and v.user_id = me;
  return jsonb_build_object('surface', mine, 'registered', registered, 'agree', agree);
end $$;
revoke all on function public.vote_court_surface(text, text) from public, anon, authenticated;
grant execute on function public.vote_court_surface(text, text) to authenticated;

commit;

-- ------------------------------------------------------- 4. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) It is in (expect 2 columns, the table with RLS on, the function):
-- select column_name from information_schema.columns where table_name = 'courts' and column_name like 'player_surface%';
-- select relrowsecurity from pg_class where oid = 'public.court_surface_votes'::regclass;
-- select has_function_privilege('anon', 'public.vote_court_surface(text, text)', 'execute') as anon_can,   -- false
--        has_function_privilege('authenticated', 'public.vote_court_surface(text, text)', 'execute') as players_can; -- true
--
-- (b) Answers so far, and courts players registered:
-- select court_id, surface, count(*) from public.court_surface_votes group by 1, 2 order by 3 desc limit 20;
-- select id, name, surface, player_surface, player_surface_at from public.courts where player_surface is not null order by player_surface_at desc limit 20;
