-- CourtSide · AI coach: memory, cached weekly plans, usage caps, handoffs.
--
-- The app never touches these tables directly except to read and clear its
-- own memory. The ai-coach Edge Function writes them with the service role.

-- ------------------------------------------------------------- coach memory
-- One row per player: a running summary plus the last exchanges verbatim.
create table public.coach_memory (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  summary     text not null default '',
  -- [{role:'user'|'coach', body, topic, created_at}], newest last, capped by the function
  exchanges   jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ weekly plans
-- The model's plan for one player for one week, keyed by the profile that
-- produced it so a profile edit regenerates and an app open does not.
create table public.training_plans (
  user_id      uuid not null references auth.users (id) on delete cascade,
  week_of      date not null,
  profile_hash text not null,
  plan         jsonb not null,
  model        text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, week_of)
);

-- --------------------------------------------------------------- usage cap
create table public.coach_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  messages int  not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------- handoffs
-- Every time the AI pointed a player at a human coach, and whether it turned
-- into a booking. This is the number that says if the feature earns its keep.
create table public.coach_handoffs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  coach_id    text not null,
  reason      text not null,   -- 'repeat-topic' | 'needs-eyes' | 'injury'
  topic       text,
  created_at  timestamptz not null default now(),
  booked_at   timestamptz
);
create index coach_handoffs_user_idx on public.coach_handoffs (user_id, created_at desc);

alter table public.coach_memory    enable row level security;
alter table public.training_plans  enable row level security;
alter table public.coach_usage     enable row level security;
alter table public.coach_handoffs  enable row level security;

-- Players can read what the coach remembers about them and wipe it.
create policy "read own memory"   on public.coach_memory   for select using (auth.uid() = user_id);
create policy "clear own memory"  on public.coach_memory   for delete using (auth.uid() = user_id);
create policy "read own plan"     on public.training_plans for select using (auth.uid() = user_id);
create policy "read own usage"    on public.coach_usage    for select using (auth.uid() = user_id);
create policy "read own handoffs" on public.coach_handoffs for select using (auth.uid() = user_id);
-- Booking a suggested coach is the one write the app makes here.
create policy "book own handoff"  on public.coach_handoffs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
