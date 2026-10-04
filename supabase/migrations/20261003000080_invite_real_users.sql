-- CourtSide · migration 80: only real players earn a promoter money, and
-- "Invited by?" can be typed in at sign-up.
--
-- 1. The code box. A new player can type who invited them during setup:
--    the inviter's @handle (any case, with or without the @). It goes
--    through the same claim as an invite link (claim_referral, migration
--    68), so the same rules hold: once only, inside a day of signing up,
--    never yourself, never someone you have blocked (or who blocked you),
--    and never changed afterwards. claim_invite_code answers why a code did
--    not take, so the app can say so; my_inviter tells the app who invited
--    you, so setup shows "Invited by @x" instead of the box.
--
-- 2. Stricter "qualified" (replaces 71's rule for anyone not yet counted).
--    A player now counts for their inviter only when ALL hold:
--      a. joined through the inviter's link or code (profiles.referred_by);
--      b. finished setting up;
--      c. email confirmed, or signed in with Apple or Google;
--      d. used the app on at least 2 different days (UTC) in their first
--         14 days: the day they joined plus at least one later day (the
--         same signs of use 71 reads);
--      e. did one real thing: followed someone (not the inviter: joining
--         from a link follows them automatically), posted, asked or
--         answered, commented, posted or joined a hit, sent a message, or
--         logged a session;
--      f. is not the inviter on a second account: never signed in on the
--         same phone as the inviter. A phone is known by its push address
--         (push_tokens). That table keeps only the latest owner of each
--         address, so from now on every (address, person) pair is written
--         down in device_sightings, scrambled (md5), never readable by the
--         app. A phone without alerts allowed leaves no trace, so this
--         catches the common case, not every case.
--      g. not deleted (row gone) and not suspended.
--    Once counted, it is written down (invite_qualifications) and never
--    taken back, exactly as before; rows counted under 71's rule stay.
--
-- 3. Admin → Invites shows "Suspicious" beside an inviter whose people
--    signed in on the same phone as them or as each other, who got more
--    than 10 sign-ups inside one hour, or more than 20 players counted on
--    one day (UTC). It is only a flag: nothing is held back, so a video
--    that takes off still pays.
--
-- Replaces invite_settle and admin_invite_summary (migration 71) only after
-- checking they are still 71's (or this file's) versions. Safe to run more
-- than once.

-- ============================================================ 0. still the versions this was written against?
do $$
declare
  want constant jsonb := '{"invite_settle":"6d00e45b4ac9f18ee4dae823547d5fe9","admin_invite_summary":"3646f3f8eb7715a0a5da1f476cbb6449"}';
  r record;
begin
  for r in select p.proname, md5(p.prosrc) m, p.prosrc s from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('invite_settle', 'admin_invite_summary') loop
    if r.m <> want->>r.proname and position('invite_real_users_80' in r.s) = 0 then
      raise exception 'migration 80: public.% has changed since migration 71 (md5 %); stop and compare before replacing it', r.proname, r.m;
    end if;
  end loop;
end $$;

-- ============================================================ 1. phones seen
create table if not exists public.device_sightings (
  token_hash    text not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (token_hash, user_id)
);
create index if not exists device_sightings_user_idx on public.device_sightings (user_id);
alter table public.device_sightings enable row level security;
revoke all on public.device_sightings from public, anon, authenticated;
-- No policies: the app can neither read nor write it.

create or replace function public.note_device_sighting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.device_sightings (token_hash, user_id, first_seen_at, last_seen_at)
  values (md5(new.token), new.user_id, coalesce(new.updated_at, now()), coalesce(new.updated_at, now()))
  on conflict (token_hash, user_id) do update set last_seen_at = greatest(public.device_sightings.last_seen_at, excluded.last_seen_at);
  return new;
end $$;
revoke all on function public.note_device_sighting() from public, anon, authenticated;
drop trigger if exists push_tokens_sighting on public.push_tokens;
create trigger push_tokens_sighting after insert or update on public.push_tokens
  for each row execute function public.note_device_sighting();

-- Who is on each phone right now, as a start.
insert into public.device_sightings (token_hash, user_id, first_seen_at, last_seen_at)
select md5(token), user_id, updated_at, updated_at from public.push_tokens
on conflict (token_hash, user_id) do nothing;

-- Have these two people ever signed in on the same phone?
create or replace function public.invite_same_device(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.device_sightings x join public.device_sightings y on y.token_hash = x.token_hash
    where x.user_id = a and y.user_id = b)
$$;
revoke all on function public.invite_same_device(uuid, uuid) from public, anon, authenticated;

-- ============================================================ 2. the code box
-- Who invited me, and whether I may still type a code.
create or replace function public.my_inviter()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when me.id is null then null
    when me.referred_by is null then jsonb_build_object('canSet', me.created_at >= now() - interval '1 day')
    else jsonb_strip_nulls(jsonb_build_object('id', r.id, 'handle', r.handle, 'name', r.name, 'canSet', false))
  end
  from (select 1) one
  left join public.profiles me on me.id = auth.uid()
  left join public.profiles r on r.id = me.referred_by
$$;
revoke all on function public.my_inviter() from public, anon;
grant execute on function public.my_inviter() to authenticated;

-- Typing a code: the inviter's handle. Answers {ok, id, handle, followed}
-- or {error: 'not-found' | 'self' | 'already' | 'too-late'}.
create or replace function public.claim_invite_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(p_code, '')));
  mine public.profiles;
  who uuid;
  followed uuid;
  them public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  wanted := btrim(ltrim(wanted, '@'));
  select * into mine from public.profiles where id = me;
  if mine.id is null then return jsonb_build_object('error', 'not-found'); end if;
  if mine.referred_by is not null then
    select * into them from public.profiles where id = mine.referred_by;
    return jsonb_strip_nulls(jsonb_build_object('error', 'already', 'handle', them.handle));
  end if;
  if mine.created_at < now() - interval '1 day' then return jsonb_build_object('error', 'too-late'); end if;
  if wanted !~ '^[a-z0-9_]{2,24}$' then return jsonb_build_object('error', 'not-found'); end if;
  select id into who from public.profiles where handle = wanted;
  if who is null and to_regclass('public.handle_history') is not null then
    execute 'select user_id from public.handle_history where handle = $1 order by released_at desc limit 1' into who using wanted;
  end if;
  if who = me then return jsonb_build_object('error', 'self'); end if;
  -- Someone blocked either way looks the same as no such person.
  if who is null or public.is_blocked_between(me, who) then return jsonb_build_object('error', 'not-found'); end if;
  followed := public.claim_referral(wanted);
  select * into mine from public.profiles where id = me;
  if mine.referred_by is distinct from who then return jsonb_build_object('error', 'not-found'); end if;
  select * into them from public.profiles where id = who;
  return jsonb_build_object('ok', true, 'id', who, 'handle', them.handle, 'followed', followed is not null);
end $$;
revoke all on function public.claim_invite_code(text) from public, anon;
grant execute on function public.claim_invite_code(text) to authenticated;

-- ============================================================ 3. the stricter test (server only)
-- Signed in with email confirmed, or with Apple or Google.
create or replace function public.invite_verified(u uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users a where a.id = u and (
      a.email_confirmed_at is not null
      or coalesce(a.raw_app_meta_data->>'provider', '') in ('apple', 'google')
      or coalesce(a.raw_app_meta_data->'providers', '[]'::jsonb) ?| array['apple', 'google']))
$$;
revoke all on function public.invite_verified(uuid) from public, anon, authenticated;

-- The moment this person first did one real thing (null if never).
create or replace function public.invite_first_action(u uuid, inviter uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(t) from (
              select created_at as t from public.follows           where follower_id = u and following_id is distinct from inviter
    union all select created_at        from public.posts             where author_id = u
    union all select created_at        from public.questions         where author_id = u
    union all select created_at        from public.answers           where author_id = u
    union all select created_at        from public.comments          where author_id = u
    union all select created_at        from public.hit_requests      where author_id = u
    union all select created_at        from public.hit_joins         where user_id = u
    union all select created_at        from public.messages          where sender_id = u
    union all select created_at        from public.practice_sessions where user_id = u
  ) s
$$;
revoke all on function public.invite_first_action(uuid, uuid) from public, anon, authenticated;

-- The start of the second different day (UTC) this person used the app in
-- their first 14 days (null if not yet). The day they joined counts.
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
    from s where t >= joined and t < joined + interval '14 days' group by 1
  )
  select first_t from days order by d offset 1 limit 1
$$;
revoke all on function public.invite_second_day(uuid, timestamptz) from public, anon, authenticated;

-- Writes down everyone who has qualified since last time (optionally only
-- one inviter's people). Never removes or changes a row.
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
  on conflict (invitee_id) do nothing;
end $$;
revoke all on function public.invite_settle(uuid) from public, anon, authenticated;

-- Worth a second look: their people share phones (with them or each
-- other), more than 10 of them joined inside one hour, or more than 20 were
-- counted on one day (UTC). Only a flag.
create or replace function public.invite_suspicious(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with people as (select id, created_at from public.profiles where referred_by = r and id <> r)
  select exists (
      select 1 from people p join public.device_sightings x on x.user_id = p.id
      join public.device_sightings y on y.token_hash = x.token_hash and y.user_id <> p.id
      where y.user_id = r or y.user_id in (select id from people))
    or exists (
      select 1 from people p
      where (select count(*) from people q where q.created_at >= p.created_at and q.created_at < p.created_at + interval '1 hour') > 10)
    or exists (
      select 1 from public.invite_qualifications q where q.referrer_id = r
      group by date_trunc('day', q.qualified_at at time zone 'utc') having count(*) > 20)
$$;
revoke all on function public.invite_suspicious(uuid) from public, anon, authenticated;

-- ============================================================ 4. for admins
-- As in 71, plus "suspicious".
create or replace function public.admin_invite_summary()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  -- invite_real_users_80
  if auth.uid() is null or not public.is_admin() then raise exception 'admins only'; end if;
  perform public.invite_settle(null);
  with inviters as (
    select referred_by as id from public.profiles where referred_by is not null and referred_by <> id
    union select referrer_id from public.invite_qualifications
    union select referrer_id from public.invite_payouts where referrer_id is not null
  ), listed as (
    select pr.id, pr.name, pr.handle, pr.avatar_url, pr.suspended_at is not null as suspended,
           public.invite_suspicious(pr.id) as suspicious, public.invite_counts(pr.id) as c
    from inviters i join public.profiles pr on pr.id = i.id
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', id, 'name', name, 'handle', handle, 'avatarUrl', avatar_url,
      'suspended', case when suspended then true end,
      'suspicious', case when suspicious then true end)) || c
    order by (c->>'owed')::int desc, (c->>'qualified')::int desc, (c->>'invited')::int desc, lower(name)), '[]'::jsonb)
  into out from listed;
  return out;
end $$;
revoke all on function public.admin_invite_summary() from public, anon;
grant execute on function public.admin_invite_summary() to authenticated;

-- ============================================================ 5. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The app cannot touch the phone records (expect false, false):
-- select has_table_privilege('authenticated', 'public.device_sightings', 'select'),
--        has_table_privilege('anon', 'public.device_sightings', 'select');
--
-- (b) Phones on file (expect about as many as push addresses):
-- select count(*) from public.device_sightings;
