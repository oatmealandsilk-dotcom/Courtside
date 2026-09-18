-- Everything that used to live only in the app's memory: discussions and
-- their answers and votes, coach questions and replies, coaching requests,
-- notifications, reports, and each person's own settings (mutes, blocks,
-- saved threads, payment methods, preferences).

-- ------------------------------------------------------------ discussions
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  topic text not null default 'technique',
  tags text[] not null default '{}',
  votes int not null default 0,
  voted_by jsonb not null default '{}'::jsonb,
  accepted_answer_id uuid,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_answer_id uuid,
  body text not null,
  votes int not null default 0,
  voted_by jsonb not null default '{}'::jsonb,
  from_coach boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists answers_question_idx on public.answers (question_id, created_at);
alter table public.questions enable row level security;
alter table public.answers enable row level security;
drop policy if exists "threads are public" on public.questions;
create policy "threads are public" on public.questions for select using (true);
drop policy if exists "ask as yourself" on public.questions;
create policy "ask as yourself" on public.questions for insert with check (auth.uid() = author_id);
drop policy if exists "edit your own thread" on public.questions;
create policy "edit your own thread" on public.questions for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "delete your own thread" on public.questions;
create policy "delete your own thread" on public.questions for delete using (auth.uid() = author_id);
drop policy if exists "answers are public" on public.answers;
create policy "answers are public" on public.answers for select using (true);
drop policy if exists "answer as yourself" on public.answers;
create policy "answer as yourself" on public.answers for insert with check (auth.uid() = author_id);
drop policy if exists "edit your own answer" on public.answers;
create policy "edit your own answer" on public.answers for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Votes are the one thing on a thread that other people change, so they go
-- through a function rather than a row update. Tapping the same way twice
-- takes the vote back; the other way flips it.
create or replace function public.apply_vote(current_votes int, current_by jsonb, voter uuid, dir int)
returns jsonb language plpgsql immutable as $$
declare
  existing int := (current_by ->> voter::text)::int;
  votes int := current_votes;
  voters jsonb := coalesce(current_by, '{}'::jsonb);
begin
  if existing = dir then
    voters := voters - voter::text; votes := votes - dir;
  elsif existing is not null then
    voters := jsonb_set(voters, array[voter::text], to_jsonb(dir)); votes := votes + 2 * dir;
  else
    voters := jsonb_set(voters, array[voter::text], to_jsonb(dir)); votes := votes + dir;
  end if;
  return jsonb_build_object('votes', votes, 'voted_by', voters);
end $$;

create or replace function public.vote_question(q uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.questions where id = q;
  if r is null then return; end if;
  update public.questions set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = q;
end $$;
create or replace function public.vote_answer(a uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.answers where id = a;
  if r is null then return; end if;
  update public.answers set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = a;
end $$;
grant execute on function public.vote_question(uuid, int) to authenticated;
grant execute on function public.vote_answer(uuid, int) to authenticated;

-- The author may change the words, never the tally.
create or replace function public.guard_vote_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and (new.votes <> old.votes or new.voted_by <> old.voted_by) then
    raise exception 'votes go through vote_question / vote_answer';
  end if;
  return new;
end $$;
drop trigger if exists guard_question_votes on public.questions;
create trigger guard_question_votes before update on public.questions for each row execute function public.guard_vote_columns();
drop trigger if exists guard_answer_votes on public.answers;
create trigger guard_answer_votes before update on public.answers for each row execute function public.guard_vote_columns();

-- ------------------------------------------------------------ coaching
create table if not exists public.coach_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  specialty text not null default 'serve',
  video_url text,
  media_label text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.coach_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.coach_questions(id) on delete cascade,
  coach_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  helpful_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.coaching_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id text not null,
  question text not null default '',
  video_label text,
  status text not null default 'submitted',
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.coach_questions enable row level security;
alter table public.coach_replies enable row level security;
alter table public.coaching_requests enable row level security;
drop policy if exists "coach questions are public" on public.coach_questions;
create policy "coach questions are public" on public.coach_questions for select using (true);
drop policy if exists "ask a coach as yourself" on public.coach_questions;
create policy "ask a coach as yourself" on public.coach_questions for insert with check (auth.uid() = author_id);
drop policy if exists "edit your own coach question" on public.coach_questions;
create policy "edit your own coach question" on public.coach_questions for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "coach replies are public" on public.coach_replies;
create policy "coach replies are public" on public.coach_replies for select using (true);
drop policy if exists "reply as yourself" on public.coach_replies;
create policy "reply as yourself" on public.coach_replies for insert with check (auth.uid() = coach_user_id);
drop policy if exists "your requests are yours" on public.coaching_requests;
create policy "your requests are yours" on public.coaching_requests for select using (auth.uid() = user_id);
drop policy if exists "request as yourself" on public.coaching_requests;
create policy "request as yourself" on public.coaching_requests for insert with check (auth.uid() = user_id);

create or replace function public.toggle_reply_helpful(r uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.coach_replies
    set helpful_by = case when auth.uid() = any(helpful_by) then array_remove(helpful_by, auth.uid()) else array_append(helpful_by, auth.uid()) end
    where id = r;
end $$;
grant execute on function public.toggle_reply_helpful(uuid) to authenticated;

-- ------------------------------------------------------------ notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  target_id text not null,
  target_kind text not null,
  preview text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "your notifications are yours" on public.notifications;
create policy "your notifications are yours" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notify as the one who acted" on public.notifications;
create policy "notify as the one who acted" on public.notifications for insert with check (auth.uid() = actor_id and actor_id <> user_id);
drop policy if exists "mark your own read" on public.notifications;
create policy "mark your own read" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------ reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid,
  target text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "report as yourself" on public.reports;
create policy "report as yourself" on public.reports for insert with check (auth.uid() = reporter_id);

-- ------------------------------------------------------------ your own settings
create table if not exists public.user_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_ids text[] not null default '{}',
  blocked_ids text[] not null default '{}',
  saved_question_ids text[] not null default '{}',
  payment_methods jsonb not null default '[]'::jsonb,
  default_payment_id text,
  show_activity boolean not null default true,
  push_likes boolean not null default true,
  push_coach boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "your settings are yours" on public.user_state;
create policy "your settings are yours" on public.user_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
