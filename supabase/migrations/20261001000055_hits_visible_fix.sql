-- 55: nobody signed in could read open hits. The rule that hides a hit from
-- people blocked with its poster called is_blocked_between, which the app's
-- signed-in role may not run (migration 21 keeps it internal), so every read
-- of hit_requests (and of hit_joins, whose rule reads hit_requests) failed
-- with "permission denied" and Find Players showed no open hits.
-- blocked_with() asks the same question, about yourself only, and is open to
-- signed-in players: the same helper the map's last_seen rule already uses.
-- Safe to run more than once.
drop policy if exists "hits are visible" on public.hit_requests;
create policy "hits are visible" on public.hit_requests for select
  using (auth.uid() is not null and not public.blocked_with(author_id));
