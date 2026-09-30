-- The beta invite email goes to each person on the waitlist once: this marks
-- when it went (see supabase/functions/waitlist-welcome). Safe to run more than once.
alter table public.waitlist add column if not exists beta_invited_at timestamptz;
