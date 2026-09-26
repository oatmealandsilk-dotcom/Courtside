-- Real coaching: approved coaches, their services and prices, paid requests,
-- answers, refunds, reviews and results. Safe to run more than once.
--
-- How money moves (Stripe Connect, "destination charges"):
--   a player pays CourtSide through Stripe Checkout; Stripe keeps its fee,
--   CourtSide keeps its platform fee, and the rest goes to the coach's own
--   Stripe account, which pays out to their bank. CourtSide never holds card
--   details. The Edge Functions `coach-payments` and `stripe-webhook` do the
--   Stripe side; this file is the database side.

-- ------------------------------------------------------------------ coaches
create table if not exists public.coaches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles (id) on delete cascade,
  headline            text not null default '' check (char_length(headline) <= 140),
  credentials         text[] not null default '{}' check (cardinality(credentials) <= 8),
  specialties         text[] not null default '{}' check (cardinality(specialties) <= 9),
  years_coaching      int not null default 0 check (years_coaching between 0 and 70),
  response_time_hours int not null default 48 check (response_time_hours between 1 and 336),
  verified            boolean not null default true,
  -- On the Coaching tab for everyone. The coach turns it on once they have a
  -- service and payouts; the app only offers the switch then.
  listed              boolean not null default false,
  stripe_account_id   text,
  payouts_ready       boolean not null default false,
  rating_avg          numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  created_at          timestamptz not null default now()
);
alter table public.coaches add column if not exists payouts_started boolean generated always as (stripe_account_id is not null) stored;
alter table public.coaches enable row level security;
-- Everyone may read a listing, but not the coach's Stripe account number:
-- the app reads the columns below by name, and payouts_started says enough.
revoke select on public.coaches from anon, authenticated;
grant select (id, user_id, headline, credentials, specialties, years_coaching, response_time_hours, verified, listed,
  payouts_ready, payouts_started, rating_avg, rating_count, created_at) on public.coaches to anon, authenticated;
drop policy if exists "listed coaches are public" on public.coaches;
create policy "listed coaches are public" on public.coaches for select
  using (listed or user_id = auth.uid() or public.is_admin());
drop policy if exists "coaches edit their own listing" on public.coaches;
create policy "coaches edit their own listing" on public.coaches for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The money and trust columns move only on the server (the payments function,
-- the review trigger), never from the app.
create or replace function public.guard_coach_columns()
returns trigger language plpgsql as $$
begin
  -- A signed-in person's request (the app). The server's own requests and
  -- Supabase's SQL editor have nobody signed in, and pass.
  if auth.uid() is not null and coalesce(current_setting('courtside.coach_system', true), '') <> 'on' then
    new.user_id := old.user_id;
    new.verified := old.verified;
    new.stripe_account_id := old.stripe_account_id;
    new.payouts_ready := old.payouts_ready;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.created_at := old.created_at;
    -- Listing needs a way to be paid.
    if new.listed and not old.payouts_ready then new.listed := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_coach_columns on public.coaches;
create trigger guard_coach_columns before update on public.coaches
  for each row execute function public.guard_coach_columns();

-- ----------------------------------------------------------------- services
create table if not exists public.coach_services (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  title            text not null check (char_length(title) between 2 and 80),
  description      text not null default '' check (char_length(description) <= 600),
  price_cents      int not null check (price_cents between 500 and 100000),
  turnaround_hours int not null default 48 check (turnaround_hours between 1 and 336),
  kind             text not null check (kind in ('video-review', 'written-qa', 'live-session', 'plan')),
  active           boolean not null default true,
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists coach_services_coach_idx on public.coach_services (coach_id, position);
alter table public.coach_services enable row level security;
drop policy if exists "services of listed coaches are public" on public.coach_services;
create policy "services of listed coaches are public" on public.coach_services for select
  using (exists (select 1 from public.coaches c where c.id = coach_id and (c.listed or c.user_id = auth.uid() or public.is_admin())));
drop policy if exists "coaches manage their own services" on public.coach_services;
create policy "coaches manage their own services" on public.coach_services for all
  using (exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------- requests
alter table public.coaching_requests add column if not exists coach_user_id uuid references public.profiles (id) on delete set null;
alter table public.coaching_requests add column if not exists price_cents int;
alter table public.coaching_requests add column if not exists fee_cents int;
alter table public.coaching_requests add column if not exists paid_at timestamptz;
alter table public.coaching_requests add column if not exists stripe_session_id text;
alter table public.coaching_requests add column if not exists payment_intent_id text;
alter table public.coaching_requests add column if not exists refunded_at timestamptz;
alter table public.coaching_requests add column if not exists video_url text;
alter table public.coaching_requests add column if not exists due_at timestamptz;
create index if not exists coaching_requests_coach_idx on public.coaching_requests (coach_user_id, created_at desc);

-- A request is made only by the payments function, after it has priced it;
-- the app can no longer file one directly (that would be a free booking).
drop policy if exists "request as yourself" on public.coaching_requests;
drop policy if exists "your requests are yours" on public.coaching_requests;
create policy "your requests are yours" on public.coaching_requests for select
  using (auth.uid() = user_id or (auth.uid() = coach_user_id and paid_at is not null) or public.is_admin());

-- A coach answers a paid request sent to them. The player hears about it.
create or replace function public.answer_coaching_request(p_request uuid, p_response text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.coaching_requests;
  words text := btrim(coalesce(p_response, ''));
begin
  select * into r from public.coaching_requests where id = p_request for update;
  if r.id is null or r.coach_user_id is distinct from auth.uid() then raise exception 'not your request'; end if;
  if r.paid_at is null or r.refunded_at is not null then raise exception 'This request is not open.'; end if;
  if char_length(words) < 2 then raise exception 'Write an answer first.'; end if;
  if char_length(words) > 8000 then raise exception 'Keep the answer under 8,000 characters.'; end if;
  update public.coaching_requests set response = words, responded_at = now(), status = 'answered' where id = p_request;
  perform public.file_notification(r.user_id, r.coach_user_id, 'coach-answer', r.id::text, 'coaching-request', words, false);
end $$;
revoke all on function public.answer_coaching_request(uuid, text) from public;
grant execute on function public.answer_coaching_request(uuid, text) to authenticated;

-- A coach marks a request as being worked on, so the player sees it moving.
create or replace function public.start_coaching_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.coaching_requests set status = 'in-review'
  where id = p_request and coach_user_id = auth.uid() and paid_at is not null and refunded_at is null and status = 'submitted';
end $$;
revoke all on function public.start_coaching_request(uuid) from public;
grant execute on function public.start_coaching_request(uuid) to authenticated;

-- The guard on profiles, again: is_coach moves only inside approve_coach,
-- the handle only inside change_handle (migration 34). Requests with nobody
-- signed in (the server, the SQL editor) pass.
alter table public.profiles add column if not exists handle_changed_at timestamptz;
create or replace function public.guard_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.is_coach is distinct from old.is_coach and coalesce(current_setting('courtside.coach_system', true), '') <> 'on' then
      raise exception 'is_coach is not editable';
    end if;
    if (new.handle is distinct from old.handle or new.handle_changed_at is distinct from old.handle_changed_at)
       and coalesce(current_setting('courtside.handle_change', true), '') <> 'on' then
      raise exception 'handle is not editable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------ approving a coach
-- An admin approves an application: the applicant becomes a coach, with a
-- listing started from what they applied with (not shown until they list it).
create or replace function public.approve_coach(p_application uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.coach_applications;
  coach uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into a from public.coach_applications where id = p_application;
  if a.id is null then raise exception 'no such application'; end if;
  update public.coach_applications set status = 'approved', review_note = nullif(btrim(coalesce(p_note, '')), '') where id = a.id;
  -- is_coach is guarded; this flag, raised only inside this function, is the one way it is set.
  perform set_config('courtside.coach_system', 'on', true);
  update public.profiles set is_coach = true where id = a.user_id;
  insert into public.coaches (user_id, headline, credentials, specialties, years_coaching)
  values (
    a.user_id,
    left(coalesce(nullif(btrim(split_part(a.about, E'\n', 1)), ''), 'Tennis coach'), 140),
    array_remove(array[nullif(btrim(a.certifications), ''), case when a.utr is not null and a.utr <> '' then 'UTR ' || a.utr end, case when a.ntrp is not null and a.ntrp <> '' then 'NTRP ' || a.ntrp end], null),
    coalesce(a.specialties, '{}'),
    coalesce(a.years_coaching, 0)
  )
  on conflict (user_id) do update set verified = true
  returning id into coach;
  perform set_config('courtside.coach_system', 'off', true);
  return coach;
end $$;
revoke all on function public.approve_coach(uuid, text) from public;
grant execute on function public.approve_coach(uuid, text) to authenticated;

create or replace function public.reject_coach(p_application uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.coach_applications set status = 'rejected', review_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_application;
end $$;
revoke all on function public.reject_coach(uuid, text) from public;
grant execute on function public.reject_coach(uuid, text) to authenticated;

-- Admins read every application (and the applicant's résumé file).
drop policy if exists "admins read applications" on public.coach_applications;
create policy "admins read applications" on public.coach_applications for select using (public.is_admin());
drop policy if exists "admins read résumés" on storage.objects;
create policy "admins read résumés" on storage.objects for select to authenticated
  using (bucket_id = 'coach-applications' and public.is_admin());

-- ------------------------------------------------------ reviews and results
create table if not exists public.coach_reviews (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text not null default '' check (char_length(body) <= 1200),
  created_at timestamptz not null default now(),
  unique (coach_id, author_id)
);
alter table public.coach_reviews enable row level security;
drop policy if exists "reviews are public" on public.coach_reviews;
create policy "reviews are public" on public.coach_reviews for select using (true);
-- Only someone a coach has actually answered can review them.
drop policy if exists "review a coach who answered you" on public.coach_reviews;
create policy "review a coach who answered you" on public.coach_reviews for insert with check (
  auth.uid() = author_id and exists (
    select 1 from public.coaching_requests r
    where r.user_id = auth.uid() and r.coach_id = coach_reviews.coach_id::text and r.status = 'answered'
  )
);
drop policy if exists "remove your own review" on public.coach_reviews;
create policy "remove your own review" on public.coach_reviews for delete using (auth.uid() = author_id);

create or replace function public.refresh_coach_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.coach_id, old.coach_id);
begin
  perform set_config('courtside.coach_system', 'on', true);
  update public.coaches c set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.coach_reviews where coach_id = target), 0),
    rating_count = (select count(*) from public.coach_reviews where coach_id = target)
  where c.id = target;
  perform set_config('courtside.coach_system', 'off', true);
  return null;
end $$;
drop trigger if exists refresh_coach_rating on public.coach_reviews;
create trigger refresh_coach_rating after insert or delete on public.coach_reviews
  for each row execute function public.refresh_coach_rating();

create table if not exists public.coach_results (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  client_name text not null check (char_length(client_name) <= 60),
  focus       text not null check (char_length(focus) <= 80),
  before      text not null check (char_length(before) <= 40),
  after       text not null check (char_length(after) <= 40),
  weeks       int not null check (weeks between 1 and 520),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
alter table public.coach_results enable row level security;
drop policy if exists "results are public" on public.coach_results;
create policy "results are public" on public.coach_results for select using (true);
drop policy if exists "coaches post their own results" on public.coach_results;
create policy "coaches post their own results" on public.coach_results for all
  using (exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.coaches c where c.id = coach_id and c.user_id = auth.uid()));

-- --------------------------------------------------- settings the server keeps
-- A private shelf for what the payments functions set up for themselves (the
-- Stripe webhook's signing secret). No policies: the app can never read it.
create table if not exists public.server_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.server_settings enable row level security;

-- ------------------------------------------------------------- push alerts
-- New kinds: a booking arrives for a coach, a coach answers, money comes back.
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
begin
  if new.kind = 'coach-application' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-apply');
    return new;
  end if;
  if new.kind = 'refund' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'posted' or new.user_id = new.actor_id then return new; end if;
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind = 'like' and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'hit' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'hit' else 'post' end
    when 'answer' then 'replied to your thread'
    when 'coach-reply' then 'answered your question'
    when 'coach-answer' then 'answered your request'
    when 'booking' then 'booked you'
    when 'helpful' then 'found your reply helpful'
    when 'share' then 'shared your post'
    when 'follow' then 'started following you'
    when 'tag' then 'tagged you in a post'
    when 'follow-request' then 'asked to follow you'
    when 'follow-accepted' then 'accepted your follow request'
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    else '/notifications' end;
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;
