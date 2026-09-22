-- People who want to hear when CourtSide opens, gathered from links posted
-- outside the app. Signing up cannot need an account — the whole point is
-- that these people do not have one yet — so the insert is open to anonymous
-- visitors. Reading is not: there is deliberately no select policy, so the
-- addresses come back only through the dashboard (service role), never
-- through the app's public key.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;

-- One row per address, so a second sign-up is rejected rather than duplicated.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));

-- The shape checks live here rather than only in the app: this row can be
-- written by anyone on the internet, and the app is not the only way in.
drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist" on public.waitlist
  for insert to anon, authenticated
  with check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(email) <= 320
    and length(name) <= 120
    and length(note) <= 2000
  );
