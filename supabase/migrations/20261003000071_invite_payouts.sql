-- CourtSide · migration 71: paying people for the players they bring.
--
-- A promoter is paid $1 for each person who joins through their link and
-- sticks. Admins see, on Settings → Admin → Invites, one row per person who
-- has invited anyone: how many qualified, how many were paid for, and what
-- is owed; "Mark paid" records a payout here.
--
-- Qualified means all three:
--   1. Signed up through their link: profiles.referred_by (migration 28,
--      set once inside a day of signing up by claim_referral). Never their
--      own link.
--   2. Finished setting up: the profile has onboardedAt, or goals (the
--      same test the app uses for "set up").
--   3. Came back: seen on a later calendar day (UTC) than the one they
--      signed up on. There is no single "opened the app" record, so this
--      takes the earliest sign of them on a later day from every place the
--      app leaves one:
--        - push_tokens.updated_at: refreshed each time the phone app opens
--          signed in (once alerts are allowed);
--        - last_seen / exact_spots.seen_at: refreshed while Location is on;
--        - feed_signals: what they scrolled past in the feed;
--        - user_state.updated_at: any settings change;
--        - anything they made: a post, comment, like, question, answer,
--          message, story view, hit joined or court check-in.
--      Several of these are overwritten or cleared later (a push address
--      goes on sign-out, a spot when Location goes off, feed rows after two
--      months), so the moment someone qualifies it is written down in
--      invite_qualifications and never taken back by a later quiet spell.
--
-- Never counted: an account that has been deleted (its row is gone) or is
-- suspended, and anyone whose inviter is themselves.
--
-- The page only ever sees names, @handles and dates. Nothing here is
-- readable from the app except through the three admin functions below,
-- and each of them refuses anyone who is not an admin.
--
-- Needs migrations 23 (is_admin, suspended_at) and 28 (referred_by); reads
-- tables from 08, 14, 20, 43, 46, 60 and 63. Safe to run more than once.

-- ============================================================ 1. the records
-- Who qualified, for whom, and when (written once, never changed).
create table if not exists public.invite_qualifications (
  invitee_id   uuid primary key references public.profiles(id) on delete cascade,
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  qualified_at timestamptz not null,
  recorded_at  timestamptz not null default now()
);
create index if not exists invite_qualifications_referrer_idx on public.invite_qualifications (referrer_id);
alter table public.invite_qualifications enable row level security;
revoke all on public.invite_qualifications from public, anon, authenticated;

-- Each payout: to whom, how many players it covers, how much, when and by
-- which admin. A payout record outlives an account that is later deleted
-- (the person's id is then left empty), so the money paid stays on file.
create table if not exists public.invite_payouts (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid references public.profiles(id) on delete set null,
  count        int not null check (count between 1 and 100000),
  amount_cents int not null check (amount_cents >= 0),
  paid_at      timestamptz not null default now(),
  paid_by      uuid references public.profiles(id) on delete set null,
  note         text check (note is null or char_length(note) <= 500)
);
create index if not exists invite_payouts_referrer_idx on public.invite_payouts (referrer_id, paid_at desc);
alter table public.invite_payouts enable row level security;
revoke all on public.invite_payouts from public, anon, authenticated;
-- No policies on either table: the app can neither read nor write them.

-- ============================================================ 2. helpers (server only)
-- $1 for each player, in cents.
create or replace function public.invite_rate_cents()
returns int language sql immutable set search_path = public as $$ select 100 $$;
revoke all on function public.invite_rate_cents() from public, anon, authenticated;

-- Finished setting up: what the app checks (onboardedAt, or any goals).
create or replace function public.invite_set_up(pr jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(pr->>'onboardedAt', '') <> ''
      or (jsonb_typeof(pr->'goals') = 'array' and jsonb_array_length(pr->'goals') > 0)
$$;
revoke all on function public.invite_set_up(jsonb) from public, anon, authenticated;

-- The earliest sign of this person on a calendar day (UTC) after the one
-- they joined on, or null if there is none yet.
create or replace function public.invite_back_at(u uuid, joined timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  with day_after as (
    select (date_trunc('day', joined at time zone 'utc') + interval '1 day') at time zone 'utc' as t
  )
  select min(s.t) from (
              select updated_at as t   from public.push_tokens   where user_id = u
    union all select seen_at           from public.last_seen     where user_id = u
    union all select seen_at           from public.exact_spots   where user_id = u
    union all select first_seen_at     from public.feed_signals  where user_id = u
    union all select last_seen_at      from public.feed_signals  where user_id = u
    union all select updated_at        from public.user_state    where user_id = u
    union all select created_at        from public.posts         where author_id = u
    union all select created_at        from public.comments      where author_id = u
    union all select created_at        from public.post_likes    where user_id = u
    union all select created_at        from public.questions     where author_id = u
    union all select created_at        from public.answers       where author_id = u
    union all select created_at        from public.messages      where sender_id = u
    union all select viewed_at         from public.story_views   where user_id = u
    union all select created_at        from public.hit_joins     where user_id = u
    union all select created_at        from public.court_checkins where user_id = u
  ) s, day_after d
  where s.t >= d.t
$$;
revoke all on function public.invite_back_at(uuid, timestamptz) from public, anon, authenticated;

-- Writes down everyone who has qualified since last time (optionally only
-- one inviter's people). Never removes or changes a row.
create or replace function public.invite_settle(only_referrer uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.invite_qualifications (invitee_id, referrer_id, qualified_at)
  select x.id, x.referred_by, x.back_at
  from (
    select p.id, p.referred_by, public.invite_back_at(p.id, p.created_at) as back_at
    from public.profiles p
    where p.referred_by is not null
      and p.referred_by <> p.id
      and (only_referrer is null or p.referred_by = only_referrer)
      and public.invite_set_up(p.profile)
      and not exists (select 1 from public.invite_qualifications q where q.invitee_id = p.id)
  ) x
  where x.back_at is not null
  on conflict (invitee_id) do nothing;
end $$;
revoke all on function public.invite_settle(uuid) from public, anon, authenticated;

-- What has been counted and paid for one inviter.
create or replace function public.invite_counts(r uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with people as (
    select p.id, p.profile from public.profiles p
    where p.referred_by = r and p.id <> r and p.suspended_at is null
  ), counts as (
    select
      (select count(*) from people)::int as invited,
      (select count(*) from people where public.invite_set_up(profile))::int as set_up,
      (select count(*) from public.invite_qualifications q
         join public.profiles p on p.id = q.invitee_id
        where q.referrer_id = r and q.invitee_id <> r and p.suspended_at is null)::int as qualified,
      (select coalesce(sum(count), 0) from public.invite_payouts where referrer_id = r)::int as paid,
      (select coalesce(sum(amount_cents), 0) from public.invite_payouts where referrer_id = r)::int as paid_cents,
      (select max(paid_at) from public.invite_payouts where referrer_id = r) as last_paid_at
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'invited', c.invited, 'setUp', c.set_up, 'qualified', c.qualified,
    'paid', c.paid, 'paidCents', c.paid_cents, 'lastPaidAt', c.last_paid_at,
    'owed', greatest(c.qualified - c.paid, 0),
    'owedCents', greatest(c.qualified - c.paid, 0) * public.invite_rate_cents()))
  from counts c
$$;
revoke all on function public.invite_counts(uuid) from public, anon, authenticated;

-- ============================================================ 3. for admins
-- One row per person who has invited anyone (or been paid for it), most
-- owed first.
create or replace function public.admin_invite_summary()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admins only'; end if;
  perform public.invite_settle(null);
  with inviters as (
    select referred_by as id from public.profiles where referred_by is not null and referred_by <> id
    union select referrer_id from public.invite_qualifications
    union select referrer_id from public.invite_payouts where referrer_id is not null
  ), listed as (
    select pr.id, pr.name, pr.handle, pr.avatar_url, pr.suspended_at is not null as suspended, public.invite_counts(pr.id) as c
    from inviters i join public.profiles pr on pr.id = i.id
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', id, 'name', name, 'handle', handle, 'avatarUrl', avatar_url,
      'suspended', case when suspended then true end)) || c
    order by (c->>'owed')::int desc, (c->>'qualified')::int desc, (c->>'invited')::int desc, lower(name)), '[]'::jsonb)
  into out from listed;
  return out;
end $$;
revoke all on function public.admin_invite_summary() from public, anon;
grant execute on function public.admin_invite_summary() to authenticated;

-- The people one person brought, newest first: name, @handle, when they
-- joined, whether they set up, and when they qualified. Nothing else.
create or replace function public.admin_invitees(referrer uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admins only'; end if;
  if referrer is null then return '[]'::jsonb; end if;
  perform public.invite_settle(referrer);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'name', p.name, 'handle', p.handle, 'avatarUrl', p.avatar_url,
      'joinedAt', p.created_at,
      'setUp', public.invite_set_up(p.profile) or q.invitee_id is not null,
      'qualifiedAt', q.qualified_at))
    order by p.created_at desc), '[]'::jsonb)
  into out
  from public.profiles p
  left join public.invite_qualifications q on q.invitee_id = p.id and q.referrer_id = referrer
  where p.id <> referrer
    and p.suspended_at is null
    and (p.referred_by = referrer or q.invitee_id is not null);
  return out;
end $$;
revoke all on function public.admin_invitees(uuid) from public, anon;
grant execute on function public.admin_invitees(uuid) to authenticated;

-- Records a payout of `count` players (at most what is owed right now, so a
-- second tap cannot pay twice). Answers that person's counts afterwards.
create or replace function public.admin_mark_invites_paid(referrer uuid, count int, note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owed int;
begin
  if me is null or not public.is_admin() then raise exception 'admins only'; end if;
  if referrer is null or not exists (select 1 from public.profiles where id = referrer) then raise exception 'no such person'; end if;
  if count is null or count < 1 then raise exception 'count must be at least 1'; end if;
  -- One payout for this person at a time: a second one waits, then sees the first.
  perform pg_advisory_xact_lock(hashtext('invite_payout:' || referrer::text));
  perform public.invite_settle(referrer);
  owed := (public.invite_counts(referrer)->>'owed')::int;
  if count > owed then raise exception 'only % owed', owed; end if;
  insert into public.invite_payouts (referrer_id, count, amount_cents, paid_by, note)
  values (referrer, count, count * public.invite_rate_cents(), me, nullif(left(btrim(coalesce(note, '')), 500), ''));
  return public.invite_counts(referrer);
end $$;
revoke all on function public.admin_mark_invites_paid(uuid, int, text) from public, anon;
grant execute on function public.admin_mark_invites_paid(uuid, int, text) to authenticated;

-- ============================================================ 4. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The app cannot touch the tables (expect false, false, false, false):
-- select has_table_privilege('authenticated', 'public.invite_payouts', 'select'),
--        has_table_privilege('authenticated', 'public.invite_payouts', 'insert'),
--        has_table_privilege('anon', 'public.invite_payouts', 'select'),
--        has_table_privilege('authenticated', 'public.invite_qualifications', 'select');
--
-- (b) Payouts so far (expect zero rows at first):
-- select p.handle, x.count, x.amount_cents, x.paid_at, x.note
--   from public.invite_payouts x left join public.profiles p on p.id = x.referrer_id order by x.paid_at desc;
