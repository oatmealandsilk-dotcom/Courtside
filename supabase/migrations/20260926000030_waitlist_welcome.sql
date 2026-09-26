-- The welcome email goes to each person once: this marks when it went.
-- Safe to run more than once.
alter table public.waitlist add column if not exists welcomed_at timestamptz;
