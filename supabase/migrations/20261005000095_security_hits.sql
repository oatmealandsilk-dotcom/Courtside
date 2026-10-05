-- CourtSide · migration 95: a minor's hits stop reaching strangers, and
-- posting hits gets the same brakes as everything else (security review, Oct 5).
--
-- 1. Who can read a hit, and who is in it.
--    The problem: every signed-in account could read every open hit with its
--    court and time, a teen's included, and see every teen who had joined
--    someone's hit, live, through the hits feed. The app only hid a teen's
--    own hits, and only on screen, so anyone reading the database directly
--    (or the live feed) got all of it. Accounts are free, so "signed in" is
--    no protection.
--    Now the database itself applies the rule the app already shows: a hit
--    reaches its poster, the people in it, the poster's followers, and (when
--    the poster is known to be an adult) everyone else signed in. A teen's
--    place in "who's in" shows only to the poster, the others in that hit,
--    and people who follow the teen. The invite rules of migration 76 stay
--    on top ("hits wait for their invite"). Live updates follow the same
--    rule. These are word for word migration 64's versions of the two rules
--    (64 is still waiting on its app release); running 64 later simply
--    writes them again.
--    So that "2 in · 1 spot left" stays right for someone who cannot see a
--    teen in the list, each hit now also carries how many are in
--    (joined_count, kept by the server, never by the app); the app version
--    that comes with this counts from it.
--
-- 2. A suspended account can no longer post hits. Hits were missing from the
--    list of things suspension stops (posts, messages, comments... migration
--    23), so a suspended adult could keep posting hits and inviting people,
--    which sends a push to each person invited.
--
-- 3. At most 20 hits a day each. There was no limit at all, and every hit
--    "for everyone" alerts nearby players and every invite-first hit pushes
--    up to 20 people. The busiest real day so far is 7. Hits you delete
--    still count (they are counted from a log only the server writes).
--
-- What anyone sees differently: a teen who joined someone's hit no longer
-- shows (face and name) in its "who's in" to people who do not follow them;
-- they still count in "2 in" and in the spots left. Nothing else changes for
-- anyone using the app normally. Safe to run more than once.

-- ------------------------------------------------------------ 1. who sees a hit
create or replace function public.hit_shown_to_you(hit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = auth.uid()
      or public.known_adult(h.author_id)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = h.author_id)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
$$;
revoke all on function public.hit_shown_to_you(uuid) from public, anon;
grant execute on function public.hit_shown_to_you(uuid) to authenticated;

create or replace function public.join_shown_to_you(hit uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = who)
      or exists (select 1 from public.hit_joins m where m.hit_id = hit and m.user_id = auth.uid())))
$$;
revoke all on function public.join_shown_to_you(uuid, uuid) from public, anon;
grant execute on function public.join_shown_to_you(uuid, uuid) to authenticated;

drop policy if exists "hits are visible" on public.hit_requests;
create policy "hits are visible" on public.hit_requests for select to authenticated
  using (auth.uid() is not null and not public.blocked_with(author_id)
         and (author_id = auth.uid() or public.hit_shown_to_you(id)));
drop policy if exists "joins are visible" on public.hit_joins;
create policy "joins are visible" on public.hit_joins for select to authenticated
  using (exists (select 1 from public.hit_requests h where h.id = hit_id) and public.join_shown_to_you(hit_id, user_id));

-- How many are in, whoever may see them. Kept by the server only.
alter table public.hit_requests add column if not exists joined_count integer not null default 0;
update public.hit_requests h
   set joined_count = c.n
  from (select h2.id, (select count(*)::int from public.hit_joins j where j.hit_id = h2.id) as n from public.hit_requests h2) c
 where c.id = h.id and h.joined_count is distinct from c.n;

create or replace function public.count_hit_joins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hit uuid := coalesce(new.hit_id, old.hit_id);
  before_flag text := coalesce(current_setting('courtside.hit_system', true), '');
begin
  perform set_config('courtside.hit_system', 'on', true);
  update public.hit_requests
     set joined_count = (select count(*)::int from public.hit_joins where hit_id = hit)
   where id = hit;
  perform set_config('courtside.hit_system', before_flag, true);
  return null;
end $$;

drop trigger if exists count_hit_joins on public.hit_joins;
create trigger count_hit_joins after insert or delete on public.hit_joins
  for each row execute function public.count_hit_joins();

-- guard_hit_request as in migration 43, plus: the count is the server's alone.
create or replace function public.guard_hit_request()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.conversation_id := null; new.created_at := now(); new.cancelled := false; new.joined_count := 0; return new; end if;
  if auth.uid() is not null and coalesce(current_setting('courtside.hit_system', true), '') <> 'on' then
    new.conversation_id := old.conversation_id; new.created_at := old.created_at; new.author_id := old.author_id;
    new.joined_count := old.joined_count;
  end if;
  return new;
end $$;

-- ------------------------------------------------- 2. suspension stops hits too
drop trigger if exists refuse_if_suspended on public.hit_requests;
create trigger refuse_if_suspended before insert on public.hit_requests
  for each row execute function public.refuse_if_suspended();

-- invite_to_hit as in migration 76, refusing a suspended caller first.
create or replace function public.invite_to_hit(hit uuid, people uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  who uuid;
  added uuid[] := '{}';
  have int;
  me_name text;
  words text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.author_id <> me then raise exception 'not_yours'; end if;
  if h.cancelled or h.starts_at < now() - interval '1 hour' then raise exception 'That hit is no longer on.'; end if;
  if h.audience = 'everyone' then return added; end if;
  select count(*) into have from public.hit_invites where hit_id = hit;
  select coalesce(nullif(name, ''), handle, 'Someone') into me_name from public.profiles where id = me;
  -- chr(183) is the middle dot, written so it survives any copy and paste.
  words := public.hit_when(h.starts_at, h.place) || ' ' || chr(183) || ' ' || coalesce(h.place->>'name', 'a court');
  for who in select distinct x from unnest(coalesce(people, '{}')) as x where x is not null loop
    exit when have >= 20;
    continue when who = me;
    continue when not exists (select 1 from public.profiles p where p.id = who and p.suspended_at is null);
    continue when public.is_blocked_between(me, who);
    continue when (not public.known_adult(me) or not public.known_adult(who))
      and not (exists (select 1 from public.follows where follower_id = me and following_id = who)
           and exists (select 1 from public.follows where follower_id = who and following_id = me));
    insert into public.hit_invites (hit_id, user_id) values (hit, who) on conflict do nothing;
    continue when not found;
    have := have + 1;
    added := added || who;
    continue when exists (select 1 from public.user_state s where s.user_id = who
      and (me::text = any (coalesce(s.blocked_ids, '{}')) or me::text = any (coalesce(s.muted_ids, '{}'))));
    perform public.file_notification(who, me, 'hit-invite', hit::text, 'hit-request', words, true);
    begin
      perform public.send_push(who, coalesce(me_name, 'Someone') || ' invited you to hit', upper(left(words, 1)) || substr(words, 2), '/hit-request/' || hit);
    exception when others then
      null;
    end;
  end loop;
  -- Touch the hit, so the live feed tells the people just invited (the row reaches them now).
  if cardinality(added) > 0 then
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set include_groups = include_groups where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  end if;
  return added;
end $$;

-- ------------------------------------------------------------ 3. 20 hits a day
-- A log only the server writes: deleting a hit does not give its place back.
create table if not exists public.hit_post_log (
  author_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists hit_post_log_author_at on public.hit_post_log (author_id, at);
alter table public.hit_post_log enable row level security;
revoke all on public.hit_post_log from public, anon, authenticated;

create or replace function public.limit_hit_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  -- One at a time per player, so a burst sent at once cannot all squeeze under the count.
  perform pg_advisory_xact_lock(hashtext('hit_post:' || auth.uid()::text));
  if (select count(*) from public.hit_post_log where author_id = auth.uid() and at > now() - interval '1 day') >= 20 then
    raise exception 'slow down' using errcode = '54000';
  end if;
  insert into public.hit_post_log (author_id) values (auth.uid());
  -- Older than a week is never asked about again.
  delete from public.hit_post_log where author_id = auth.uid() and at < now() - interval '7 days';
  return new;
end $$;

drop trigger if exists limit_hit_requests on public.hit_requests;
create trigger limit_hit_requests before insert on public.hit_requests
  for each row execute function public.limit_hit_requests();

-- Checks after running:
-- (a) the two rules (expect "hits are visible" and "joins are visible", both {authenticated}):
--   select tablename, policyname, roles from pg_policies where tablename in ('hit_requests', 'hit_joins') and cmd = 'SELECT';
-- (b) the two new triggers (expect limit_hit_requests and refuse_if_suspended):
--   select tgname from pg_trigger where tgrelid = 'public.hit_requests'::regclass and tgname in ('limit_hit_requests', 'refuse_if_suspended');
