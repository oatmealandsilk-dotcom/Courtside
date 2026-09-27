-- Practice log: a row per session you play, so streaks, hours and win rate
-- are real. Private to its owner (other people see a streak only as the
-- owner's own posts show it). Two taps to log: kind and length.
create table if not exists public.practice_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  minutes    int  not null check (minutes between 5 and 600),
  kind       text not null default 'practice' check (kind in ('practice', 'match', 'drills', 'fitness')),
  won        boolean,
  opponent   text check (opponent is null or char_length(opponent) <= 60),
  note       text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index if not exists practice_sessions_user_day on public.practice_sessions (user_id, day desc);

alter table public.practice_sessions enable row level security;
drop policy if exists "own sessions: read" on public.practice_sessions;
create policy "own sessions: read" on public.practice_sessions for select using (user_id = auth.uid());
drop policy if exists "own sessions: add" on public.practice_sessions;
create policy "own sessions: add" on public.practice_sessions for insert with check (user_id = auth.uid());
drop policy if exists "own sessions: change" on public.practice_sessions;
create policy "own sessions: change" on public.practice_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own sessions: remove" on public.practice_sessions;
create policy "own sessions: remove" on public.practice_sessions for delete using (user_id = auth.uid());
-- A day's worth of logging is plenty; this stops a runaway script, not a person.
create or replace function public.limit_practice_sessions() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.practice_sessions where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of sessions for one day. Try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists limit_practice_sessions on public.practice_sessions;
create trigger limit_practice_sessions before insert on public.practice_sessions for each row execute function public.limit_practice_sessions();
