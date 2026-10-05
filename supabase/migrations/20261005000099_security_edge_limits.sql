-- CourtSide · migration 99: a counter the server functions use to say "not so
-- often" (security review, Oct 5).
--
-- The problem: the server functions that cost money each time they run (the
-- welcome email through Resend, the AI coach through Anthropic) had no limit
-- that anyone could not get around. The welcome email needs no sign-in at
-- all, so a script could make CourtSide email up to about 86,000 strangers a
-- day, spending the Resend allowance and the domain's good name; the AI
-- coach was limited per account, and accounts are free.
--
-- What this adds: one shared counter, kept in the database and reachable only
-- by the server functions themselves (with the service key, which never
-- leaves Supabase). A function asks "may this happen again?" for a bucket
-- (say "welcome email") and a key (say a hashed internet address, or "all"
-- for a total across everyone), with a most-allowed count over a time window.
-- The answer is yes (and it is counted) or no. Checks for the same bucket and
-- key take turns, so a burst sent at once cannot all slip under the limit.
-- Internet addresses are never stored as they are: the functions send a
-- one-way scramble of them.
--
-- Used by waitlist-welcome (per address, and a daily total) and ai-coach (a
-- daily total across everyone). Those functions carry on as before when this
-- has not run yet. Nothing here touches the app. Safe to run more than once.

create table if not exists public.edge_rate_hits (
  bucket text not null,
  key    text not null,
  at     timestamptz not null default now()
);
create index if not exists edge_rate_hits_lookup on public.edge_rate_hits (bucket, key, at);
alter table public.edge_rate_hits enable row level security;
revoke all on public.edge_rate_hits from public, anon, authenticated;

create or replace function public.take_edge_rate(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  used integer;
begin
  if p_bucket is null or p_key is null or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 7 * 86400 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('edge_rate:' || p_bucket || ':' || p_key));
  select count(*) into used from public.edge_rate_hits
   where bucket = p_bucket and key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if used >= p_max then return false; end if;
  insert into public.edge_rate_hits (bucket, key) values (p_bucket, p_key);
  -- Now and then, what no window can need any more goes (no scheduled job needed).
  if random() < 0.02 then
    delete from public.edge_rate_hits where at < now() - interval '8 days';
  end if;
  return true;
end $$;
revoke all on function public.take_edge_rate(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_edge_rate(text, text, integer, integer) to service_role;

-- Check after running (expect anon false, app false, server true):
-- select has_function_privilege('anon', 'public.take_edge_rate(text,text,integer,integer)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.take_edge_rate(text,text,integer,integer)', 'execute') as app,
--        has_function_privilege('service_role', 'public.take_edge_rate(text,text,integer,integer)', 'execute') as server;
