-- CourtSide · migration 102: small guards from the security review (Oct 5).
-- Each part says what someone could do before, and what stops it now.
-- Nothing changes for anyone using the app. Safe to run more than once.

-- ---------------------------------------- 1. no dating your own posts ahead
-- Before: the author of a discussion thread, a reply or a coach question
-- could set its date to next year and sit at the top of the list for good
-- (lists are newest first). Now a date can never be later than "now". An edit
-- still re-dates a thread to the moment of the edit, exactly as before.
create or replace function public.no_future_dates()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.created_at > now() then
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists no_future_dates on public.questions;
create trigger no_future_dates before update on public.questions
  for each row execute function public.no_future_dates();
drop trigger if exists no_future_dates on public.answers;
create trigger no_future_dates before update on public.answers
  for each row execute function public.no_future_dates();
drop trigger if exists no_future_dates on public.coach_questions;
create trigger no_future_dates before update on public.coach_questions
  for each row execute function public.no_future_dates();

-- ------------------------------------------------ 2. no reading ahead in a chat
-- Before: "read up to" in a chat could be set to a time in the future, so the
-- other person saw "Seen" on messages not yet sent. Now it is never later
-- than the moment it was saved.
create or replace function public.no_reading_ahead()
returns trigger language plpgsql as $$
begin
  if new.last_read_at > now() then new.last_read_at := now(); end if;
  return new;
end $$;

drop trigger if exists no_reading_ahead on public.conversation_members;
create trigger no_reading_ahead before insert or update of last_read_at on public.conversation_members
  for each row execute function public.no_reading_ahead();

-- ------------------------------------------ 3. invite payouts: nothing from the future
-- Before: an invited player's own "last changed" times (their settings row,
-- their phone's alert key, a follow) can be written by the player, and the
-- "came back on a second day" rule took any time within two weeks of joining,
-- even one that had not happened yet. One write dated tomorrow made a brand
-- new account count as a qualified invite at once. Now times later than
-- "now" are not counted, and an invite qualifies only once its moment has
-- actually come. (Payouts are still marked paid by an admin by hand.)
-- Both are migration 80's versions with that one condition added.
create or replace function public.invite_second_day(u uuid, joined timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  with s(t) as (
              select joined
    union all select updated_at        from public.push_tokens    where user_id = u
    union all select last_seen_at      from public.device_sightings where user_id = u
    union all select first_seen_at     from public.device_sightings where user_id = u
    union all select seen_at           from public.last_seen      where user_id = u
    union all select seen_at           from public.exact_spots    where user_id = u
    union all select first_seen_at     from public.feed_signals   where user_id = u
    union all select last_seen_at      from public.feed_signals   where user_id = u
    union all select updated_at        from public.user_state     where user_id = u
    union all select created_at        from public.posts          where author_id = u
    union all select created_at        from public.comments       where author_id = u
    union all select created_at        from public.post_likes     where user_id = u
    union all select created_at        from public.questions      where author_id = u
    union all select created_at        from public.answers        where author_id = u
    union all select created_at        from public.messages       where sender_id = u
    union all select viewed_at         from public.story_views    where user_id = u
    union all select created_at        from public.hit_joins      where user_id = u
    union all select created_at        from public.hit_requests   where author_id = u
    union all select created_at        from public.court_checkins where user_id = u
    union all select created_at        from public.follows        where follower_id = u
    union all select created_at        from public.practice_sessions where user_id = u
  ), days as (
    select date_trunc('day', t at time zone 'utc') d, min(t) first_t
    from s where t >= joined and t < joined + interval '14 days' and t <= now() group by 1
  )
  select first_t from days order by d offset 1 limit 1
$$;

create or replace function public.invite_settle(only_referrer uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- invite_real_users_80
  insert into public.invite_qualifications (invitee_id, referrer_id, qualified_at)
  select x.id, x.referred_by, x.qualified_at
  from (
      select p.id, p.referred_by, d.second_day, a.first_action, greatest(d.second_day, a.first_action) as qualified_at
      from public.profiles p
      cross join lateral (select public.invite_second_day(p.id, p.created_at) as second_day) d
      cross join lateral (select public.invite_first_action(p.id, p.referred_by) as first_action) a
      where p.referred_by is not null
        and p.referred_by <> p.id
        and (only_referrer is null or p.referred_by = only_referrer)
        and p.suspended_at is null
        and public.invite_set_up(p.profile)
        and not exists (select 1 from public.invite_qualifications q where q.invitee_id = p.id)
        and public.invite_verified(p.id)
        and not public.invite_same_device(p.id, p.referred_by)
  ) x
  where x.qualified_at is not null and x.second_day is not null and x.first_action is not null
    and x.qualified_at <= now()
  on conflict (invitee_id) do nothing;
end $$;

-- --------------------------------------- 4. tables only the server should touch
-- Before: the signed-out and signed-in roles still held every permission on
-- these tables (read, write, empty them), held back only because they have
-- row rules that let nobody in. One rule added by mistake, or row security
-- switched off for a moment, would have opened the Stripe webhook secrets
-- (server_settings), WHOOP sign-in keys (whoop_tokens) and the handle
-- history. Now only the server can touch them at all. Crash reports keep
-- exactly what the app uses: filing one.
revoke all on public.server_settings from anon, authenticated;
revoke all on public.whoop_tokens from anon, authenticated;
revoke all on public.handle_history from anon, authenticated;
revoke all on public.app_errors from anon, authenticated;
grant insert on public.app_errors to anon, authenticated;

-- Checks after running:
-- (a) nothing left for the app's roles on the server tables (expect 0):
--   select count(*) from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated')
--      and table_name in ('server_settings', 'whoop_tokens', 'handle_history');
-- (b) crash reports: insert only (expect 2 rows, both INSERT):
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'app_errors' and grantee in ('anon', 'authenticated');
