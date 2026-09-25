-- Health inputs, for real: a day of numbers per person (from Apple Health,
-- WHOOP or a Cronometer export), which sources are connected, and WHOOP's
-- tokens (readable by the server only). Safe to run more than once.

create table if not exists public.health_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  calories integer,
  protein_g integer,
  carb_g integer,
  fat_g integer,
  resting_hr integer,
  hrv_ms integer,
  sleep_hours numeric(4,2),
  recovery integer,
  steps integer,
  -- Which source gave which numbers, e.g. {"sleep_hours":"whoop","calories":"cronometer"}.
  sources jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.health_days enable row level security;
drop policy if exists "your health is yours" on public.health_days;
create policy "your health is yours" on public.health_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.health_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('apple-health', 'whoop', 'cronometer')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (user_id, provider)
);
alter table public.health_connections enable row level security;
drop policy if exists "your connections are yours" on public.health_connections;
create policy "your connections are yours" on public.health_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- WHOOP's keys to a person's data. No policy at all: only the server (service role) reads or writes these.
create table if not exists public.whoop_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.whoop_tokens enable row level security;
