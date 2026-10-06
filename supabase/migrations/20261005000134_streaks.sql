-- CourtSide · migration 134: the streak flame (Oct 5, owner picked style 1:
-- the app's own flame and the number, after a player's name, from 3 days in
-- a row).
--
-- A streak is worked out on each player's own phone, from their sessions
-- (private) and their posts and Instants, in their own time zone. So nobody
-- else's phone can work it out. Instead each app puts up just the number,
-- and the last day that number covers (today, or yesterday while today has
-- nothing yet), with set_my_streak(). Other phones show the flame while that
-- last day is today or yesterday on their own calendar; after that it reads
-- as 0. Nothing about the sessions or posts behind it is stored here, and
-- readers get only the number and that day, never the time it last changed.
--
-- Who sees a streak: signed-in players, where they could see that player's
-- posts and stats. A private account's only to its followers, nobody's to
-- someone they are blocked with (either way), and nothing at all to anyone
-- signed out. Only the owner writes their own row, and only through
-- set_my_streak(), which keeps the number between 0 and 3650 (ten years)
-- and the day within a day or two of the server's today (any time zone).
--
-- Before this runs, the app shows the flame only beside your own name; its
-- asks for the table and the function are refused and it stops asking.
-- Safe to run more than once.

begin;

-- Guard: the rules below lean on can_view (migration 2) and blocked_with
-- (migration 21). Without them, stop before changing anything.
do $$
begin
  if to_regprocedure('public.can_view(uuid)') is null or to_regprocedure('public.blocked_with(uuid)') is null then
    raise exception 'Migration 134 stopped before changing anything: can_view or blocked_with is missing. Run the earlier migrations first.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Migration 134 stopped before changing anything: there is no profiles table.';
  end if;
end $$;

create table if not exists public.player_streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Days in a row, as the owner's app counted them.
  days integer not null default 0,
  -- The last of those days, on the owner's own calendar. Empty when days is 0.
  through_day date,
  updated_at timestamptz not null default now()
);

-- The bounds, as named checks: a second run replaces them rather than adding copies.
alter table public.player_streaks drop constraint if exists player_streaks_days_check;
alter table public.player_streaks add constraint player_streaks_days_check check (days between 0 and 3650);
alter table public.player_streaks drop constraint if exists player_streaks_through_check;
alter table public.player_streaks add constraint player_streaks_through_check check (days = 0 or through_day is not null);

-- Readers ask for running streaks only (3 days or more, a recent last day).
create index if not exists player_streaks_running_idx on public.player_streaks (through_day) where days >= 3;

alter table public.player_streaks enable row level security;
-- Read only, signed in only. No one writes the table directly: set_my_streak() does.
-- Only the number and its day can be read: updated_at (the minute a row last
-- changed) would tell others when someone logged or removed a private session,
-- so it stays with the server. Revoking the whole table also clears these
-- column grants, so a second run starts clean.
revoke all on table public.player_streaks from public, anon, authenticated;
grant select (user_id, days, through_day) on public.player_streaks to authenticated;

drop policy if exists "streaks show where stats do" on public.player_streaks;
create policy "streaks show where stats do" on public.player_streaks
  for select to authenticated
  using (public.can_view(user_id) and not public.blocked_with(user_id));

-- Your own streak, put up by your app whenever it changes.
create or replace function public.set_my_streak(streak integer, last_day date)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if streak is null or streak < 0 or streak > 3650 then raise exception 'streak out of range'; end if;
  -- A phone's today is within a day of the server's (time zones), and a streak's last day is today or yesterday.
  if streak > 0 and (last_day is null or last_day < current_date - 2 or last_day > current_date + 1) then
    raise exception 'streak day out of range';
  end if;
  insert into public.player_streaks (user_id, days, through_day, updated_at)
  values (me, streak, case when streak > 0 then last_day end, now())
  on conflict (user_id) do update
    set days = excluded.days, through_day = excluded.through_day, updated_at = now();
end $$;
revoke all on function public.set_my_streak(integer, date) from public, anon;
grant execute on function public.set_my_streak(integer, date) to authenticated;

commit;
