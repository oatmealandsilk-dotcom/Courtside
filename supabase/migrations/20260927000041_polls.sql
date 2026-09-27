-- Polls in Community threads: 2 to 4 options, one vote each, which can be
-- changed. Votes are private (you see only your own); the totals live on the
-- poll and are kept by the server, so nobody can inflate them from the app.
create or replace function public.poll_options_ok(opts text[]) returns boolean language sql immutable as $$
  select coalesce(array_length(opts, 1), 0) between 2 and 4
     and not exists (select 1 from unnest(opts) o where char_length(btrim(o)) not between 1 and 80);
$$;

create table if not exists public.polls (
  question_id uuid primary key references public.questions (id) on delete cascade,
  options     text[] not null check (public.poll_options_ok(options)),
  counts      int[]  not null default '{0,0,0,0}',
  created_at  timestamptz not null default now()
);
alter table public.polls enable row level security;
drop policy if exists "polls are public" on public.polls;
create policy "polls are public" on public.polls for select using (true);
-- Only the person who started the thread adds its poll, and only once (the primary key).
drop policy if exists "thread author adds the poll" on public.polls;
create policy "thread author adds the poll" on public.polls for insert
  with check (exists (select 1 from public.questions q where q.id = question_id and q.author_id = auth.uid()));
-- Totals are the server's: nobody sets them on the way in.
create or replace function public.stamp_new_poll() returns trigger language plpgsql as $$
begin new.counts := '{0,0,0,0}'; new.created_at := now(); return new; end $$;
drop trigger if exists stamp_new_poll on public.polls;
create trigger stamp_new_poll before insert on public.polls for each row execute function public.stamp_new_poll();

create table if not exists public.poll_votes (
  question_id uuid not null references public.polls (question_id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option      smallint not null check (option between 0 and 3),
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "own poll votes: read" on public.poll_votes;
create policy "own poll votes: read" on public.poll_votes for select using (user_id = auth.uid());
drop policy if exists "own poll votes: cast" on public.poll_votes;
create policy "own poll votes: cast" on public.poll_votes for insert with check (user_id = auth.uid());
drop policy if exists "own poll votes: change" on public.poll_votes;
create policy "own poll votes: change" on public.poll_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own poll votes: take back" on public.poll_votes;
create policy "own poll votes: take back" on public.poll_votes for delete using (user_id = auth.uid());

-- An option the poll does not have is refused.
create or replace function public.check_poll_vote() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.option >= (select array_length(options, 1) from public.polls where question_id = new.question_id) then
    raise exception 'That poll does not have that option.';
  end if;
  return new;
end $$;
drop trigger if exists check_poll_vote on public.poll_votes;
create trigger check_poll_vote before insert or update on public.poll_votes for each row execute function public.check_poll_vote();

-- Totals recounted from the votes themselves whenever one changes.
create or replace function public.recount_poll() returns trigger language plpgsql security definer set search_path = public as $$
declare q uuid := coalesce(new.question_id, old.question_id);
begin
  update public.polls set counts = array[
    (select count(*) from public.poll_votes where question_id = q and option = 0),
    (select count(*) from public.poll_votes where question_id = q and option = 1),
    (select count(*) from public.poll_votes where question_id = q and option = 2),
    (select count(*) from public.poll_votes where question_id = q and option = 3)
  ]::int[] where question_id = q;
  return null;
end $$;
drop trigger if exists recount_poll on public.poll_votes;
create trigger recount_poll after insert or update or delete on public.poll_votes for each row execute function public.recount_poll();
