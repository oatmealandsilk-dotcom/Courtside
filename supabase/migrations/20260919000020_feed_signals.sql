-- What people do in the feed, saved for a smarter feed later.
--
-- One small row per person per post (or hit, or thread) they came across:
--   * when they first and last saw it, and how many times;
--   * how many seconds it was on their screen (for a clip, the watch time);
--   * how many times they swiped past it within a second and a half (a skip);
--   * how many times they tapped through to its author's profile.
-- Nobody can read these from the app, the person included: they exist only
-- for ranking the feed. Rows untouched for about two months are cleared, and
-- all of a person's rows go with their account.
-- Needs migration 00 (profiles). Safe to run more than once.

create table if not exists public.feed_signals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_id text not null,
  target_kind text not null check (target_kind in ('post', 'hit', 'question')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen int not null default 0,
  watch_seconds real not null default 0,
  skips int not null default 0,
  profile_taps int not null default 0,
  primary key (user_id, target_id, target_kind)
);
create index if not exists feed_signals_recent_idx on public.feed_signals (user_id, last_seen_at desc);
create index if not exists feed_signals_target_idx on public.feed_signals (target_id, target_kind);
alter table public.feed_signals enable row level security;
-- No policies: the app can neither read nor write the table directly; the
-- function below is the only way in, and it only ever writes your own rows.

-- A bundle of what one phone saw, sent every few seconds. Each item:
--   { "id": "...", "kind": "post" | "hit" | "question",
--     "seen": true, "watched": 12.5, "skipped": false, "profileTap": false }
create or replace function public.record_feed_signals(items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  item jsonb;
  kind text;
  target text;
  seen boolean;
  watched real;
begin
  if me is null or items is null or jsonb_typeof(items) <> 'array' then return; end if;
  for item in select value from jsonb_array_elements(items) limit 60 loop
    kind := item ->> 'kind';
    target := left(item ->> 'id', 64);
    if target is null or kind not in ('post', 'hit', 'question') then continue; end if;
    seen := coalesce((item ->> 'seen')::boolean, false);
    -- One look counts for at most five minutes (a phone left on a paused clip is not watching).
    watched := greatest(0, least(coalesce((item ->> 'watched')::real, 0), 300));
    insert into public.feed_signals as f (user_id, target_id, target_kind, times_seen, watch_seconds, skips, profile_taps)
      values (
        me, target, kind,
        case when seen then 1 else 0 end,
        watched,
        case when coalesce((item ->> 'skipped')::boolean, false) then 1 else 0 end,
        case when coalesce((item ->> 'profileTap')::boolean, false) then 1 else 0 end
      )
      on conflict (user_id, target_id, target_kind) do update set
        last_seen_at = case when seen then now() else f.last_seen_at end,
        times_seen = f.times_seen + excluded.times_seen,
        watch_seconds = least(f.watch_seconds + excluded.watch_seconds, 100000),
        skips = f.skips + excluded.skips,
        profile_taps = f.profile_taps + excluded.profile_taps;
  end loop;
  -- Now and then, clear this person's rows from more than about two months ago.
  if random() < 0.05 then
    delete from public.feed_signals where user_id = me and last_seen_at < now() - interval '60 days';
  end if;
end $$;
revoke all on function public.record_feed_signals(jsonb) from public, anon;
grant execute on function public.record_feed_signals(jsonb) to authenticated;
