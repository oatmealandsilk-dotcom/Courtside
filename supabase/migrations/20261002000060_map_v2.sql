-- 60: the map, version 2 (the database side).
--
-- *** NOT APPLIED. Nothing here has been run on the live database. ***
--
-- What this adds, in plain words:
--
-- 1. Who may play at a court. Every court gets an answer: public, members
--    only, pay to book, private (someone's home) or unknown. It starts as
--    unknown, and unknown courts are never hidden. Three things can set it,
--    and nothing else can: what OpenStreetMap says (kept on its own, filled
--    by the courts function and a one-off backfill), what players say in
--    "Add what you know", and an admin. Only adults' answers count here.
--    One adult is enough to mark a court members only or private when the
--    map has no answer; it takes two to close a court the map says anyone
--    may play at, and two to open up a court the map or a player called
--    closed. Each player's "closed" answers count on five courts at most, so
--    one account cannot grey out a town.
-- 2. Court reviews ("Add what you know"): lights, nets, surface, busy times,
--    rules and notes, and access. One set per player per court; saving again
--    replaces yours. You read back only your own. Everyone else sees totals
--    ("Lights · Usually busy weekday evenings · Some cracks (3 players)"),
--    never who said what, and the same totals whoever is asking (a block
--    never changes them, or it would show who said what). Teens can add
--    facts too; free-text notes are shown only from adults.
-- 3. Following a court (the heart). Your own list is yours; everyone else
--    sees a count, never names. "Your courts" reads what is new at each.
-- 4. Right now at a court: "Free · 20 min ago", gone after 90 minutes (not
--    at someone's home). And an optional "I'm playing here" for adults, at
--    courts anyone may play at, gone after 2 hours or the moment Location
--    goes off. Strangers see only a count, and only when at least two other
--    adults with week-old accounts are there; people who follow each other
--    see names. Teens cannot check in. Six check-ins a day at most. Where a
--    phone says it is cannot be checked, so these rules are what keep a
--    lone player from being found. A block never changes what anyone sees.
-- 5. Court rings and "who you follow plays here" are worked out here, so a
--    teen's posts and hits never light up a court for adults they don't
--    follow back, and blocked people never count.
-- 6. Alerts that open the map, each with its own switch in Settings:
--      map-friend-hit   "Dev (you follow) is up for a hit today · 3 mi"
--      map-new-hit      "New open hit 2 mi from you"
--      map-new-player   "A new player shared their spot near you"
--      court-activity   "New hit at Millbrook" (a court you follow)
--    At most one a day from the three map alerts together, and at most one
--    a day from courts you follow. The map alerts go to and from adults
--    only; a court alert reaches a teen only from someone they follow back;
--    a post or hit by someone not known to be an adult never sets off any
--    of them; never between blocked people. One person's posts and hits set
--    off alerts three times a day at most, and a post only once.
-- 7. "Just joined near you" (migration 37) stops announcing teens, and is
--    only sent to adults (owner decision 4).
--
-- Needs 02, 08, 13, 14, 21, 22, 23, 31, 37, 43, 46, 47, 51, 53 (all live).
-- push_for_notification itself is unchanged: its trigger now skips the four
-- new kinds, which send their own phone alert.
-- Safe to run more than once.

-- ============================================================ 0. helpers
-- Whether someone is known to be an adult. No age on file counts as a minor.
create or replace function public.known_adult(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select age_group = 'adult' from public.profiles where id = u), false)
$$;

-- Whether two people follow each other.
create or replace function public.follow_each_other(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows where follower_id = a and following_id = b)
     and exists (select 1 from public.follows where follower_id = b and following_id = a)
$$;

-- Whether a post or hit by `author` may count at a court for `viewer`:
-- never across a block, a private account only for its followers, and
-- someone not known to be an adult only for people they follow back.
create or replace function public.shows_at_court(viewer uuid, author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and author is not null and (viewer = author or (
    not public.is_blocked_between(viewer, author)
    and exists (
      select 1 from public.profiles p where p.id = author
        and (not p.is_private or exists (select 1 from public.follows f where f.follower_id = viewer and f.following_id = author))
        and (p.age_group = 'adult' or public.follow_each_other(viewer, author)))))
$$;

-- A piece of a link, safe to put after "?name=" (spaces, accents, "&").
create or replace function public.url_part(t text) returns text
language sql immutable as $$
  select coalesce(string_agg(case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (45, 46, 95, 126)
                                  then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
  from (select i, get_byte(convert_to(coalesce(t, ''), 'UTF8'), i) as b
        from generate_series(0, octet_length(convert_to(coalesce(t, ''), 'UTF8')) - 1) as i) x
$$;

-- "3 mi", never less than 1 (spots are only known to about a kilometre).
create or replace function public.miles_text(km double precision) returns text
language sql immutable as $$ select greatest(1, round(km / 1.609))::int || ' mi' $$;

-- The map, opened on one court.
create or replace function public.court_link(cid text, cname text, clat double precision, clng double precision) returns text
language sql immutable as $$
  select '/map?court=' || public.url_part(cid) || '&lat=' || clat || '&lng=' || clng || '&name=' || public.url_part(coalesce(cname, 'Tennis courts'))
$$;

revoke all on function public.known_adult(uuid) from public, anon, authenticated;
revoke all on function public.follow_each_other(uuid, uuid) from public, anon, authenticated;
revoke all on function public.shows_at_court(uuid, uuid) from public, anon, authenticated;
revoke all on function public.url_part(text) from public, anon, authenticated;
revoke all on function public.miles_text(double precision) from public, anon, authenticated;
revoke all on function public.court_link(text, text, double precision, double precision) from public, anon, authenticated;

-- ============================================================ 1. who may play at a court
-- osm_access: what OpenStreetMap says. access: what the app shows, worked
-- out by the guard below. access_by: where that answer came from (null
-- while unknown). A Book link only ever comes from the map data or an admin.
alter table public.courts
  add column if not exists osm_access text not null default 'unknown' check (osm_access in ('public', 'members', 'pay', 'private', 'unknown')),
  add column if not exists access text not null default 'unknown' check (access in ('public', 'members', 'pay', 'private', 'unknown')),
  add column if not exists access_by text check (access_by in ('map', 'players', 'admin')),
  add column if not exists fee boolean,
  add column if not exists indoor boolean,
  add column if not exists book_url text check (book_url is null or (book_url ~ '^https?://[^[:space:]]+$' and char_length(book_url) <= 300));

-- ============================================================ 2. court reviews ("Add what you know")
create table if not exists public.court_reviews (
  court_id   text not null references public.courts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  lights     boolean,
  nets       text check (nets in ('good', 'bad')),
  surface    text check (surface in ('good', 'cracked', 'wet-prone')),
  -- When it is usually busy. An empty list means "never seen it busy".
  busy       text[] check (busy is null or (cardinality(busy) <= 6 and busy <@ array['weekday-morning', 'weekday-afternoon', 'weekday-evening', 'weekend-morning', 'weekend-afternoon', 'weekend-evening']::text[])),
  access     text check (access in ('public', 'members', 'pay', 'private')),
  notes      text check (notes is null or char_length(notes) <= 280),
  -- Filled in after a hit you posted or joined (the after-hit prompt).
  from_hit   uuid references public.hit_requests(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (court_id, user_id)
);
create index if not exists court_reviews_user_idx on public.court_reviews (user_id, updated_at desc);

alter table public.court_reviews enable row level security;
drop policy if exists "your own court reviews" on public.court_reviews;
create policy "your own court reviews" on public.court_reviews for select to authenticated using (user_id = auth.uid());
drop policy if exists "add your own court review" on public.court_reviews;
create policy "add your own court review" on public.court_reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "change your own court review" on public.court_reviews;
create policy "change your own court review" on public.court_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "remove your own court review" on public.court_reviews;
create policy "remove your own court review" on public.court_reviews for delete to authenticated using (user_id = auth.uid());
revoke all on public.court_reviews from anon;
revoke truncate on public.court_reviews from authenticated;

-- The time is the database's; notes are tidied; "from a hit" only for a hit
-- you posted or joined; at most 30 courts a day per player.
create or replace function public.stamp_court_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.court_id := old.court_id; new.user_id := old.user_id; end if;
  new.updated_at := now();
  new.notes := nullif(btrim(regexp_replace(coalesce(new.notes, ''), '\s+', ' ', 'g')), '');
  if new.busy is not null then
    new.busy := coalesce((select array_agg(distinct b order by b) from unnest(new.busy) as b where b is not null), '{}'::text[]);
  end if;
  if new.from_hit is not null and not exists (
       select 1 from public.hit_requests h where h.id = new.from_hit
         and (h.author_id = new.user_id or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = new.user_id))) then
    new.from_hit := null;
  end if;
  if auth.uid() is not null and (select count(*) from public.court_reviews
       where user_id = new.user_id and court_id <> new.court_id and updated_at > now() - interval '1 day') >= 30 then
    raise exception 'slow down';
  end if;
  return new;
end $$;
drop trigger if exists stamp_court_review on public.court_reviews;
create trigger stamp_court_review before insert or update on public.court_reviews for each row execute function public.stamp_court_review();
drop trigger if exists refuse_if_suspended on public.court_reviews;
create trigger refuse_if_suspended before insert or update on public.court_reviews for each row execute function public.refuse_if_suspended();

-- Players' answer on access, or null when they have not settled it. The
-- most common answer in the last 18 months wins (ties: the newest). Only
-- known adults' answers count (a teen's is kept with their facts but never
-- greys a court out), and each player's members-only or private answers
-- count on their first five courts only, so a throwaway account cannot
-- close a town's courts. Closing a court the map says anyone may play at
-- (public or pay) needs two players; where the map has no answer, one is
-- enough. Opening up a court that the map or a standing players' answer
-- called closed needs two.
create or replace function public.players_court_access(court text, osm text) returns text
language sql stable security definer set search_path = public as $$
  with said as (
    select v.access, v.updated_at from public.court_reviews v
    join public.profiles p on p.id = v.user_id and p.age_group = 'adult'
    where v.court_id = court and v.access is not null and v.updated_at > now() - interval '18 months'
      and (v.access not in ('members', 'private') or (
        select count(*) from public.court_reviews w
        where w.user_id = v.user_id and w.access in ('members', 'private') and w.updated_at > now() - interval '18 months'
          and (w.updated_at, w.court_id) < (v.updated_at, v.court_id)) < 5)
  ), votes as (
    select access, count(*)::int as n, max(updated_at) as last from said group by access
  ), need as (select case when osm in ('public', 'pay') then 2 else 1 end as close),
  top as (select access, n from votes order by n desc, last desc limit 1),
  -- The players' closed answer, only once enough of them said it to stand.
  closed as (select v.access from votes v, need where v.access in ('members', 'private') and v.n >= need.close order by v.n desc, v.last desc limit 1)
  select case
    when (select access from top) is null then null
    when (select access from top) in ('public', 'pay') and (select n from top) < 2
         and (osm in ('members', 'private') or exists (select 1 from closed))
      then (select access from closed)
    when (select access from top) in ('members', 'private') and (select n from top) < (select close from need) then null
    else (select access from top) end
$$;
revoke all on function public.players_court_access(text, text) from public, anon, authenticated;

-- The guard: works out `access` again on every change to a court, from the
-- map's answer and players' answers, and keeps an admin's answer until an
-- admin clears it. A signed-in player can never set any of these directly
-- (the courts table has no write rules for players anyway); the import
-- (the courts function, with the server key) sets only the map's answer.
create or replace function public.guard_court_facts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mode text := coalesce(current_setting('courtside.court_facts', true), '');
  answer text;
begin
  if mode = 'admin' then return new; end if;
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.osm_access := 'unknown'; new.fee := null; new.indoor := null; new.book_url := null;
    else
      new.osm_access := old.osm_access; new.fee := old.fee; new.indoor := old.indoor; new.book_url := old.book_url;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.access_by = 'admin' and mode <> 'unlock' then
    new.access := old.access; new.access_by := 'admin'; new.book_url := old.book_url; new.indoor := old.indoor;
    return new;
  end if;
  answer := public.players_court_access(new.id, new.osm_access);
  if answer is not null then
    new.access := answer; new.access_by := 'players';
  else
    new.access := new.osm_access; new.access_by := case when new.osm_access = 'unknown' then null else 'map' end;
  end if;
  return new;
end $$;
drop trigger if exists guard_court_facts on public.courts;
create trigger guard_court_facts before insert or update on public.courts for each row execute function public.guard_court_facts();

-- A review saved, changed or removed: touch the court so the guard works its answer out again.
create or replace function public.recount_court_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  cid := case when tg_op = 'DELETE' then old.court_id else new.court_id end;
  update public.courts set osm_access = osm_access where id = cid;
  return null;
end $$;
drop trigger if exists recount_court_access on public.court_reviews;
create trigger recount_court_access after insert or update or delete on public.court_reviews for each row execute function public.recount_court_access();

-- An admin settles a court's access (and its Book link, or whether it is
-- indoors). Passing no access clears the admin's answer again.
create or replace function public.set_court_access(p_court text, p_access text, p_book_url text default null, p_indoor boolean default null)
returns text language plpgsql security definer set search_path = public as $$
declare result text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'court?'; end if;
  if p_access is null then
    perform set_config('courtside.court_facts', 'unlock', true);
    update public.courts set access_by = null where id = p_court returning access into result;
  else
    if p_access not in ('public', 'members', 'pay', 'private', 'unknown') then raise exception 'access?'; end if;
    if p_book_url is not null and not (p_book_url ~ '^https?://[^[:space:]]+$' and char_length(p_book_url) <= 300) then raise exception 'link?'; end if;
    perform set_config('courtside.court_facts', 'admin', true);
    update public.courts set access = p_access, access_by = 'admin', book_url = coalesce(p_book_url, book_url), indoor = coalesce(p_indoor, indoor)
      where id = p_court returning access into result;
  end if;
  perform set_config('courtside.court_facts', '', true);
  return result;
end $$;
revoke all on function public.set_court_access(text, text, text, boolean) from public, anon;
grant execute on function public.set_court_access(text, text, text, boolean) to authenticated;

-- The one-off backfill (scripts/backfill-court-access.mjs): the map's
-- answer for courts already stored, [{id, access, fee, indoor, book_url}],
-- up to 2,000 at a time. Server only. Returns how many courts changed.
create or replace function public.import_court_access(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with r as (
    select x->>'id' as id,
      case when x->>'access' in ('public', 'members', 'pay', 'private') then x->>'access' else 'unknown' end as acc,
      case when jsonb_typeof(x->'fee') = 'boolean' then (x->>'fee')::boolean end as fee,
      case when jsonb_typeof(x->'indoor') = 'boolean' then (x->>'indoor')::boolean end as indoor,
      case when x->>'book_url' ~ '^https?://[^[:space:]]+$' and char_length(x->>'book_url') <= 300 then x->>'book_url' end as book
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as x
    where jsonb_typeof(x) = 'object'
    limit 2000
  )
  update public.courts c set osm_access = r.acc, fee = r.fee, indoor = r.indoor, book_url = r.book
    from r
   where c.id = r.id and (c.osm_access, c.fee, c.indoor, c.book_url) is distinct from (r.acc, r.fee, r.indoor, r.book);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.import_court_access(jsonb) from public, anon, authenticated;
grant execute on function public.import_court_access(jsonb) to service_role;

-- What everyone has said about some courts (up to 50), added up. Never who:
-- no ids, and notes only from adults, newest three, with the day. The same
-- totals and notes for everyone, signed in or not: leaving out the people
-- you blocked would let a block show which courts they reviewed and what
-- they said. busy_never: how many said they have never seen it busy.
-- (Dropped first: the columns changed while 60 was being written.)
drop function if exists public.court_facts(text[]);
create function public.court_facts(ids text[])
returns table (court_id text, players integer, lights_yes integer, lights_no integer, nets_good integer, nets_bad integer,
  surface_good integer, surface_cracked integer, surface_wet integer, busy jsonb, busy_answers integer, busy_never integer, notes jsonb,
  access text, access_by text, fee boolean, indoor boolean, book_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  said as (
    select v.* from public.court_reviews v
    where v.court_id in (select id from wanted) and v.updated_at > now() - interval '18 months'
      and (v.lights is not null or v.nets is not null or v.surface is not null or v.busy is not null or v.access is not null or v.notes is not null)
  )
  select c.id,
    coalesce(t.players, 0), coalesce(t.lights_yes, 0), coalesce(t.lights_no, 0), coalesce(t.nets_good, 0), coalesce(t.nets_bad, 0),
    coalesce(t.surface_good, 0), coalesce(t.surface_cracked, 0), coalesce(t.surface_wet, 0),
    coalesce(b.busy, '{}'::jsonb), coalesce(t.busy_answers, 0), coalesce(t.busy_never, 0), coalesce(n.notes, '[]'::jsonb),
    c.access, c.access_by, c.fee, c.indoor, c.book_url, t.last
  from public.courts c
  left join lateral (
    select count(*)::int as players,
      count(*) filter (where s.lights)::int as lights_yes, count(*) filter (where not s.lights)::int as lights_no,
      count(*) filter (where s.nets = 'good')::int as nets_good, count(*) filter (where s.nets = 'bad')::int as nets_bad,
      count(*) filter (where s.surface = 'good')::int as surface_good, count(*) filter (where s.surface = 'cracked')::int as surface_cracked,
      count(*) filter (where s.surface = 'wet-prone')::int as surface_wet,
      count(*) filter (where s.busy is not null)::int as busy_answers,
      count(*) filter (where cardinality(s.busy) = 0)::int as busy_never, max(s.updated_at) as last
    from said s where s.court_id = c.id) t on true
  left join lateral (
    select jsonb_object_agg(part, k) as busy from (
      select part, count(*)::int as k from said s, unnest(s.busy) as part where s.court_id = c.id group by part) x) b on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('text', y.notes, 'on', y.updated_at::date) order by y.updated_at desc) as notes from (
      select s.notes, s.updated_at from said s join public.profiles p on p.id = s.user_id and p.age_group = 'adult'
      where s.court_id = c.id and s.notes is not null order by s.updated_at desc limit 3) y) n on true
  where c.id in (select id from wanted)
$$;
revoke all on function public.court_facts(text[]) from public;
grant execute on function public.court_facts(text[]) to anon, authenticated;

-- ============================================================ 3. following a court
create table if not exists public.court_follows (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  court_id   text not null references public.courts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, court_id)
);
create index if not exists court_follows_court_idx on public.court_follows (court_id);

alter table public.court_follows enable row level security;
drop policy if exists "your own followed courts" on public.court_follows;
create policy "your own followed courts" on public.court_follows for select to authenticated using (user_id = auth.uid());
drop policy if exists "follow a court" on public.court_follows;
create policy "follow a court" on public.court_follows for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unfollow a court" on public.court_follows;
create policy "unfollow a court" on public.court_follows for delete to authenticated using (user_id = auth.uid());
revoke all on public.court_follows from anon;
revoke update, truncate on public.court_follows from authenticated;

create or replace function public.limit_court_follows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.court_follows where user_id = new.user_id) >= 100 then
    raise exception 'You can follow up to 100 courts.';
  end if;
  return new;
end $$;
drop trigger if exists limit_court_follows on public.court_follows;
create trigger limit_court_follows before insert on public.court_follows for each row execute function public.limit_court_follows();

-- "6 players follow this court": a count only, and whether you do.
create or replace function public.court_follow_counts(ids text[])
returns table (court_id text, followers integer, following boolean)
language sql stable security definer set search_path = public as $$
  select w.id,
    (select count(*)::int from public.court_follows f where f.court_id = w.id),
    exists (select 1 from public.court_follows f where f.court_id = w.id and f.user_id = auth.uid())
  from (select distinct x as id from unnest(ids[1:50]) as x where x is not null) w
$$;
revoke all on function public.court_follow_counts(text[]) from public;
grant execute on function public.court_follow_counts(text[]) to anon, authenticated;

-- ============================================================ 4. right now at a court
-- "How is it right now?": one answer per player per court; shown for 90 minutes.
create table if not exists public.court_status (
  court_id   text not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('free', 'wait', 'full', 'wet', 'locked')),
  created_at timestamptz not null default now(),
  primary key (court_id, user_id)
);
create index if not exists court_status_recent_idx on public.court_status (court_id, created_at desc);
create index if not exists court_status_user_idx on public.court_status (user_id, created_at desc);

-- "I'm playing here": one court per player at a time, for 2 hours.
create table if not exists public.court_checkins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  court_id   text not null references public.courts(id) on delete cascade,
  created_at timestamptz not null default now(),
  until      timestamptz not null
);
create index if not exists court_checkins_court_idx on public.court_checkins (court_id, until);

-- Both are written only through the functions below, and each player reads only their own rows.
alter table public.court_status enable row level security;
alter table public.court_checkins enable row level security;
drop policy if exists "your own court reports" on public.court_status;
create policy "your own court reports" on public.court_status for select to authenticated using (user_id = auth.uid());
drop policy if exists "your own check-in" on public.court_checkins;
create policy "your own check-in" on public.court_checkins for select to authenticated using (user_id = auth.uid());
revoke all on public.court_status, public.court_checkins from anon;
revoke insert, update, delete, truncate on public.court_status, public.court_checkins from authenticated;
drop trigger if exists refuse_if_suspended on public.court_status;
create trigger refuse_if_suspended before insert on public.court_status for each row execute function public.refuse_if_suspended();
drop trigger if exists refuse_if_suspended on public.court_checkins;
create trigger refuse_if_suspended before insert on public.court_checkins for each row execute function public.refuse_if_suspended();

-- How many times each player checked in today, so a spare account cannot
-- hop from court to court looking for who is where. Server only.
create table if not exists public.court_checkin_days (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  n       integer not null default 0
);
alter table public.court_checkin_days enable row level security;
revoke all on public.court_checkin_days from anon, authenticated;

-- Free / A wait / Full / Wet / Locked. No status clears yours. Never at
-- someone's home: a report there would put people on a private court.
create or replace function public.report_court_status(p_court text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_status is null then
    delete from public.court_status where court_id = p_court and user_id = me;
    return;
  end if;
  if p_status not in ('free', 'wait', 'full', 'wet', 'locked') then raise exception 'status?'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'court?'; end if;
  if (select access from public.courts where id = p_court) = 'private' then raise exception 'private_court'; end if;
  if (select count(*) from public.court_status where user_id = me and court_id <> p_court and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'slow down';
  end if;
  insert into public.court_status (court_id, user_id, status, created_at) values (p_court, me, p_status, now())
    on conflict (court_id, user_id) do update set status = excluded.status, created_at = excluded.created_at;
  delete from public.court_status where created_at < now() - interval '90 minutes';
end $$;
revoke all on function public.report_court_status(text, text) from public, anon;
grant execute on function public.report_court_status(text, text) to authenticated;

-- "I'm playing here". Adults only (a teen's spot is never on the map), with
-- Location on, near the court, and only where anyone may play (never a
-- club's or someone's home court). Six a day; checking in again where you
-- already are is free. Returns when it ends.
create or replace function public.check_in_at_court(p_court text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.courts;
  spot public.last_seen;
  ends timestamptz := now() + interval '2 hours';
  tries integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.known_adult(me) then raise exception 'adults_only'; end if;
  select * into c from public.courts where id = p_court;
  if c.id is null then raise exception 'court?'; end if;
  if c.access in ('members', 'private') then raise exception 'closed_court'; end if;
  select * into spot from public.last_seen where user_id = me;
  if spot.user_id is null then raise exception 'location_off'; end if;
  if spot.seen_at < now() - interval '12 hours' or public.km_between(spot.lat, spot.lng, c.lat, c.lng) > 5 then
    raise exception 'too_far';
  end if;
  if not exists (select 1 from public.court_checkins where user_id = me and court_id = c.id and until > now()) then
    insert into public.court_checkin_days as d (user_id, day, n) values (me, current_date, 1)
      on conflict (user_id) do update set n = case when d.day = current_date then d.n + 1 else 1 end, day = current_date
      returning n into tries;
    if tries > 6 then raise exception 'slow down'; end if;
  end if;
  insert into public.court_checkins (user_id, court_id, created_at, until) values (me, c.id, now(), ends)
    on conflict (user_id) do update set court_id = excluded.court_id, created_at = excluded.created_at, until = excluded.until;
  delete from public.court_checkins where until < now();
  return ends;
end $$;
revoke all on function public.check_in_at_court(text) from public, anon;
grant execute on function public.check_in_at_court(text) to authenticated;

create or replace function public.check_out_of_court() returns void
language sql security definer set search_path = public as $$
  delete from public.court_checkins where user_id = auth.uid();
$$;
revoke all on function public.check_out_of_court() from public, anon;
grant execute on function public.check_out_of_court() to authenticated;

-- Location off: the spot goes (migration 46), and now any check-in with it.
create or replace function public.forget_last_seen()
returns void language sql security definer set search_path = public as $$
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
$$;
revoke all on function public.forget_last_seen() from public, anon;
grant execute on function public.forget_last_seen() to authenticated;

-- What a signed-in player sees right now at some courts (up to 50): the
-- latest answer in the last 90 minutes, and, for adults only, how many
-- other adults are playing there and which of them follow each other with
-- you. The answer and the count leave nobody out for being blocked: if a
-- block changed them, blocking and unblocking would show who made a report
-- or who is there (a block already removes follows, so it never adds a
-- name). The count shows only once two or more of those adults have
-- accounts at least a week old, so a spare account made today and checked
-- in cannot turn one real player into a count.
create or replace function public.court_right_now(ids text[])
returns table (court_id text, status text, status_at timestamptz, playing integer, friend_ids uuid[], you_here boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  here as (
    select k.court_id, k.user_id, k.created_at, p.created_at < now() - interval '7 days' as settled
    from public.court_checkins k
    join public.profiles p on p.id = k.user_id and p.age_group = 'adult'
    cross join me
    where k.court_id in (select id from wanted) and k.until > now() and k.user_id <> me.id
  )
  select w.id, st.status, st.created_at,
    case when me.adult and coalesce(h.settled, 0) >= 2 then h.n else 0 end,
    case when me.adult then coalesce(h.friends, '{}'::uuid[]) else '{}'::uuid[] end,
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
  from wanted w cross join me
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  left join lateral (
    select count(*)::int as n, (count(*) filter (where here.settled))::int as settled,
      array_agg(here.user_id order by here.created_at desc) filter (where public.follow_each_other(me.id, here.user_id)) as friends
    from here where here.court_id = w.id) h on true
  where me.id is not null
$$;
revoke all on function public.court_right_now(text[]) from public, anon;
grant execute on function public.court_right_now(text[]) to authenticated;

-- Old answers and ended check-ins go (every 15 minutes where pg_cron runs;
-- every new answer or check-in also tidies).
create or replace function public.sweep_court_status() returns void
language sql security definer set search_path = public as $$
  delete from public.court_status where created_at < now() - interval '90 minutes';
  delete from public.court_checkins where until < now();
  delete from public.court_checkin_days where day < current_date - 1;
$$;
revoke all on function public.sweep_court_status() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('courtside-court-status-sweep', '*/15 * * * *', 'select public.sweep_court_status()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%): answers and check-ins are still hidden once old, and tidied on each new one', sqlerrm;
end $$;

-- ============================================================ 5. what the map reads
-- Court rings: real courts in the map's view with a post or an open hit in
-- the last 7 days that you may see there.
create or replace function public.court_rings(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
returns table (court_id text, name text, lat double precision, lng double precision, posts integer, hits integer, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with act as (
    select p.court_id as cid, 1 as is_post, p.created_at as at from public.posts p
    where p.court_id is not null and p.created_at > now() - interval '7 days' and not p.archived and p.removed_at is null
      and public.shows_at_court(auth.uid(), p.author_id)
    union all
    select h.place->>'id', 0, h.created_at from public.hit_requests h
    where h.place ? 'id' and h.created_at > now() - interval '7 days' and not h.cancelled
      and public.shows_at_court(auth.uid(), h.author_id)
  ), per as (
    select cid, sum(is_post)::int as posts, (count(*) - sum(is_post))::int as hits, max(at) as last_at from act group by cid
  )
  select c.id, c.name, c.lat, c.lng, per.posts, per.hits, per.last_at
  from per join public.courts c on c.id = per.cid
  where c.lat between least(min_lat, max_lat) and greatest(min_lat, max_lat)
    and c.lng between least(min_lng, max_lng) and greatest(min_lng, max_lng)
  order by per.last_at desc
  limit 300
$$;
revoke all on function public.court_rings(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.court_rings(double precision, double precision, double precision, double precision) to authenticated;

-- "Sam and Dev, who you follow, play here": up to 5 people you follow per
-- court, from their posts tagged there and hits they posted or joined there
-- in the last 90 days. Never from where anyone's phone was.
create or replace function public.court_people_you_follow(ids text[])
returns table (court_id text, user_ids uuid[])
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  acts as (
    select p.court_id as cid, p.author_id as uid, p.created_at as at from public.posts p
    where p.court_id in (select id from wanted) and p.created_at > now() - interval '90 days' and not p.archived and p.removed_at is null
    union all
    select h.place->>'id', h.author_id, h.created_at from public.hit_requests h
    where h.place->>'id' in (select id from wanted) and h.created_at > now() - interval '90 days' and not h.cancelled
    union all
    select h.place->>'id', j.user_id, j.created_at from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where h.place->>'id' in (select id from wanted) and j.created_at > now() - interval '90 days' and not h.cancelled
  ), people as (
    select a.cid, a.uid, max(a.at) as last from acts a
    where a.uid <> auth.uid()
      and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.uid)
      and public.shows_at_court(auth.uid(), a.uid)
    group by a.cid, a.uid
  )
  select cid, (array_agg(uid order by last desc))[1:5] from people group by cid
$$;
revoke all on function public.court_people_you_follow(text[]) from public, anon;
grant execute on function public.court_people_you_follow(text[]) to authenticated;

-- "Your courts" on Find Players: each court you follow with what is new
-- there (others' posts this week, open hits coming up, the latest answer,
-- the same for everyone as in court_right_now), and whether you are checked
-- in there, so the card can say "You're here".
-- (Dropped first: the columns changed while 60 was being written.)
drop function if exists public.my_courts();
create function public.my_courts()
returns table (court_id text, name text, lat double precision, lng double precision, access text, followed_at timestamptz,
  new_posts integer, upcoming_hits integer, next_hit_at timestamptz, status text, status_at timestamptz, last_at timestamptz, you_here boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.lat, c.lng, c.access, f.created_at,
    coalesce(p.n, 0), coalesce(h.n, 0), h.next_at, st.status, st.created_at, greatest(p.last, h.last),
    exists (select 1 from public.court_checkins k where k.user_id = f.user_id and k.court_id = c.id and k.until > now())
  from public.court_follows f
  join public.courts c on c.id = f.court_id
  left join lateral (
    select count(*)::int as n, max(po.created_at) as last from public.posts po
    where po.court_id = c.id and po.created_at > now() - interval '7 days' and not po.archived and po.removed_at is null
      and po.author_id <> f.user_id and public.shows_at_court(f.user_id, po.author_id)) p on true
  left join lateral (
    select count(*)::int as n, min(hr.starts_at) as next_at, max(hr.created_at) as last from public.hit_requests hr
    where hr.place->>'id' = c.id and not hr.cancelled and hr.starts_at > now()
      and hr.author_id <> f.user_id and public.shows_at_court(f.user_id, hr.author_id)) h on true
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = c.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  where f.user_id = auth.uid()
  order by greatest(p.last, h.last) desc nulls last, f.created_at desc
  limit 100
$$;
revoke all on function public.my_courts() from public, anon;
grant execute on function public.my_courts() to authenticated;

-- Finding what was tagged at a court, newest first.
create index if not exists posts_court_idx on public.posts (court_id, created_at desc) where court_id is not null;
create index if not exists hit_requests_court_idx on public.hit_requests ((place->>'id'), created_at desc) where place ? 'id';

-- ============================================================ 6. alerts that open the map
-- One switch each in Settings. On unless turned off.
alter table public.user_state
  add column if not exists push_map_friends boolean not null default true,
  add column if not exists push_map_hits boolean not null default true,
  add column if not exists push_map_players boolean not null default true,
  add column if not exists push_courts boolean not null default true;

-- When each player last had an alert from each group: 'map' (the three map
-- alerts together) or 'courts' (courts they follow). Server only.
create table if not exists public.alert_sends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  grp     text not null check (grp in ('map', 'courts')),
  sent_at timestamptz not null default now(),
  primary key (user_id, grp)
);
alter table public.alert_sends enable row level security;
revoke all on public.alert_sends from anon, authenticated;

-- What each player's posts and hits have already set off: one row per post,
-- hit or "up for a hit" day that reached someone. Server only. Without it
-- one person could post hit after hit, or move one post from court to
-- court, and use up everyone's one alert a day around town.
create table if not exists public.alert_fanouts (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  source   text not null,
  at       timestamptz not null default now(),
  primary key (actor_id, source)
);
create index if not exists alert_fanouts_recent_idx on public.alert_fanouts (actor_id, at desc);
alter table public.alert_fanouts enable row level security;
revoke all on public.alert_fanouts from anon, authenticated;

-- Whether this post, hit or day may still set off alerts: not one that
-- already did, and at most three a day from one person.
create or replace function public.fanout_allowed(actor uuid, src text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.alert_fanouts where actor_id = actor and source = src)
     and (select count(*) from public.alert_fanouts where actor_id = actor and at > now() - interval '1 day') < 3
$$;
revoke all on function public.fanout_allowed(uuid, text) from public, anon, authenticated;

-- Notes that one did (only once it reached someone), and tidies that person's old rows.
create or replace function public.note_fanout(actor uuid, src text) returns void
language sql security definer set search_path = public as $$
  delete from public.alert_fanouts where actor_id = actor and at < now() - interval '3 days';
  insert into public.alert_fanouts (actor_id, source) values (actor, src) on conflict do nothing;
$$;
revoke all on function public.note_fanout(uuid, text) from public, anon, authenticated;

-- Files one alert and sends it to the phone, or quietly does nothing: to
-- yourself, between blocked people, switched off, already had one from that
-- group in the last 24 hours, (map alerts) either side not an adult, or (a
-- court you follow) to a teen from someone they don't follow back, so an
-- adult stranger's name and hit never land in a teen's alerts.
-- Claiming the day's slot and filing happen together, so two at once cannot
-- both get through. Never raises: an alert must not stop the post or hit
-- that set it off.
create or replace function public.send_map_alert(
  recipient uuid, actor uuid, what text, target text, target_type text, words text, title text, body text, href text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_grp text := case when what = 'court-activity' then 'courts' else 'map' end;
  switched_on boolean;
  claimed boolean;
  flat text;
begin
  if recipient is null or actor is null or recipient = actor then return false; end if;
  if what not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity') then return false; end if;
  if not public.known_adult(actor) then return false; end if;
  if v_grp = 'map' and not public.known_adult(recipient) then return false; end if;
  if v_grp = 'courts' and not public.known_adult(recipient) and not public.follow_each_other(recipient, actor) then return false; end if;
  if public.is_blocked_between(recipient, actor)
     or exists (select 1 from public.user_state where user_id = recipient and actor::text = any(blocked_ids)) then
    return false;
  end if;
  select case what when 'map-friend-hit' then push_map_friends when 'map-new-hit' then push_map_hits
                   when 'map-new-player' then push_map_players else push_courts end
    into switched_on from public.user_state where user_id = recipient;
  if switched_on is false then return false; end if;
  begin
    insert into public.alert_sends as a (user_id, grp, sent_at) values (recipient, v_grp, now())
      on conflict (user_id, grp) do update set sent_at = excluded.sent_at where a.sent_at <= now() - interval '24 hours'
      returning true into claimed;
    if claimed is null then return false; end if;
    flat := nullif(btrim(regexp_replace(coalesce(words, ''), '\s+', ' ', 'g')), '');
    if char_length(flat) > 80 then flat := left(flat, 79) || '…'; end if;
    insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
      values (recipient, actor, what, target, target_type, flat);
    perform public.send_push(recipient, title, body, href);
    return true;
  exception when others then
    return false;
  end;
end $$;
revoke all on function public.send_map_alert(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

-- A new open hit: the people who follow its court ("New hit at Millbrook"),
-- then adults within 25 km who don't follow that court ("New open hit 2 mi
-- from you"). Nobody the hit-match alert (migration 53) already told about
-- this hit hears twice. Recipients are taken in id order, so two hits at
-- once claim days in the same order. Counts toward the poster's three a day.
create or replace function public.tell_map_about_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lat1 double precision;
  lng1 double precision;
  c public.courts;
  whenx text;
  r record;
  sent boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'hit:' || new.id) then return new; end if;
  begin
    lat1 := nullif(new.place->>'lat', '')::double precision;
    lng1 := nullif(new.place->>'lng', '')::double precision;
    whenx := public.hit_when(new.starts_at, new.place);
    select * into c from public.courts where id = new.place->>'id';
    if c.id is not null then
      for r in
        select f.user_id from public.court_follows f
        where f.court_id = c.id and f.user_id <> new.author_id
          and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
        order by f.user_id limit 500
      loop
        if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
          'New hit at ' || coalesce(c.name, 'your court') || ' · ' || whenx,
          'New hit at ' || coalesce(c.name, 'a court you follow'),
          upper(left(whenx, 1)) || substr(whenx, 2),
          public.court_link(c.id, c.name, c.lat, c.lng) || '&hit=' || new.id) then sent := true; end if;
      end loop;
    end if;
    if lat1 is not null and lng1 is not null then
      for r in
        select x.id, x.km from (
          select s.user_id as id, public.km_between(lat1, lng1, s.lat, s.lng) as km
          from public.last_seen s join public.profiles p on p.id = s.user_id and p.age_group = 'adult'
          where s.user_id <> new.author_id and s.seen_at > now() - interval '30 days'
            and s.lat between lat1 - 0.5 and lat1 + 0.5
            and public.km_between(lat1, lng1, s.lat, s.lng) <= 25
            and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
            and (c.id is null or not exists (select 1 from public.court_follows f where f.user_id = s.user_id and f.court_id = c.id))
          order by 2 limit 50) x
        order by x.id
      loop
        if public.send_map_alert(r.id, new.author_id, 'map-new-hit', new.id::text, 'hit-request',
          public.miles_text(r.km) || ' from you · ' || whenx,
          'New open hit ' || public.miles_text(r.km) || ' from you',
          upper(left(whenx, 1)) || substr(whenx, 2) || ' · ' || coalesce(new.place->>'name', 'a court'),
          '/map?hit=' || new.id || '&lat=' || lat1 || '&lng=' || lng1) then sent := true; end if;
      end loop;
    end if;
    if sent then perform public.note_fanout(new.author_id, 'hit:' || new.id); end if;
  exception when others then
    raise warning 'map alerts for hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_map_about_hit on public.hit_requests;
create trigger tell_map_about_hit after insert on public.hit_requests for each row execute function public.tell_map_about_hit();

-- A post tagged at a court (new, or tagged within two days of posting):
-- "New clip at Millbrook" to the people who follow that court and may see
-- it. Once per post, however often it is moved to another court, and it
-- counts toward the poster's three a day.
create or replace function public.tell_court_about_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author public.profiles;
  c public.courts;
  what text;
  r record;
  sent boolean := false;
begin
  if new.court_id is null or new.archived or new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.court_id is not distinct from new.court_id then return new; end if;
  if new.created_at < now() - interval '2 days' then return new; end if;
  select * into author from public.profiles where id = new.author_id;
  if author.age_group is distinct from 'adult' then return new; end if;
  if not public.fanout_allowed(new.author_id, 'post:' || new.id) then return new; end if;
  begin
    select * into c from public.courts where id = new.court_id;
    if c.id is null then return new; end if;
    what := case when new.kind = 'clip' or new.video_url is not null then 'clip' else 'post' end;
    for r in
      select f.user_id from public.court_follows f
      where f.court_id = c.id and f.user_id <> new.author_id
        and (not author.is_private or exists (select 1 from public.follows x where x.follower_id = f.user_id and x.following_id = new.author_id))
      order by f.user_id limit 500
    loop
      if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
        'New ' || what || ' at ' || coalesce(c.name, 'your court'),
        'New ' || what || ' at ' || coalesce(c.name, 'a court you follow'),
        'From a court you follow.',
        public.court_link(c.id, c.name, c.lat, c.lng)) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.author_id, 'post:' || new.id); end if;
  exception when others then
    raise warning 'court alerts for post %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_court_about_post on public.posts;
create trigger tell_court_about_post after insert or update of court_id on public.posts for each row execute function public.tell_court_about_post();

-- An adult turns on their open-to-hit ring: adults who follow them and
-- shared a spot within 50 km hear "Dev (you follow) is up for a hit today".
-- Only when it goes from off to on, only while Dev's Location is on, and
-- once a day (switching it off and on again tells nobody twice); it counts
-- toward Dev's three a day.
create or replace function public.tell_followers_up_for_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  spot public.last_seen;
  who text;
  r record;
  sent boolean := false;
  src text := 'up:' || current_date;
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return new; end if;
  if old.open_to_hit_until is not null and old.open_to_hit_until > now() then return new; end if;
  if new.age_group is distinct from 'adult' then return new; end if;
  select * into spot from public.last_seen where user_id = new.id;
  if spot.user_id is null then return new; end if;
  if not public.fanout_allowed(new.id, src) then return new; end if;
  who := coalesce(nullif(new.name, ''), new.handle);
  begin
    for r in
      select x.id, x.km from (
        select f.follower_id as id, public.km_between(spot.lat, spot.lng, s.lat, s.lng) as km
        from public.follows f
        join public.profiles p on p.id = f.follower_id and p.age_group = 'adult'
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = new.id and public.km_between(spot.lat, spot.lng, s.lat, s.lng) <= 50
        order by 2 limit 200) x
      order by x.id
    loop
      if public.send_map_alert(r.id, new.id, 'map-friend-hit', new.id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        who || ' (you follow) is up for a hit today',
        public.miles_text(r.km) || ' from you. See them on the map.',
        '/map?user=' || new.id || '&lat=' || spot.lat || '&lng=' || spot.lng) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.id, src); end if;
  exception when others then
    raise warning 'map alerts for open-to-hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_followers_up_for_hit on public.profiles;
create trigger tell_followers_up_for_hit after update of open_to_hit_until on public.profiles for each row execute function public.tell_followers_up_for_hit();

-- A new adult (joined in the last 14 days) shares a spot for the first
-- time: up to 50 adults within 50 km hear "A new player shared their spot
-- near you", unless "just joined near you" already told them. Once per player.
create or replace function public.tell_adults_new_player() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
  r record;
begin
  if not public.known_adult(new.user_id) then return new; end if;
  select created_at into joined from public.profiles where id = new.user_id;
  if joined is null or joined < now() - interval '14 days' then return new; end if;
  if exists (select 1 from public.notifications where actor_id = new.user_id and kind = 'map-new-player') then return new; end if;
  begin
    for r in
      select x.id, x.km from (
        select s.user_id as id, public.km_between(new.lat, new.lng, s.lat, s.lng) as km
        from public.last_seen s join public.profiles p on p.id = s.user_id and p.age_group = 'adult'
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days'
          and public.km_between(new.lat, new.lng, s.lat, s.lng) <= 50
          and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.actor_id = new.user_id and n.kind = 'joined')
        order by 2 limit 50) x
      order by x.id
    loop
      perform public.send_map_alert(r.id, new.user_id, 'map-new-player', new.user_id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        'A new player shared their spot near you',
        public.miles_text(r.km) || ' from you. Say hi on the map.',
        '/map?lat=' || new.lat || '&lng=' || new.lng);
    end loop;
  exception when others then
    raise warning 'map alerts for new player %: %', new.user_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists tell_adults_new_player on public.last_seen;
create trigger tell_adults_new_player after insert on public.last_seen for each row execute function public.tell_adults_new_player();

-- The four new kinds send their own phone alert (above), so the general one
-- skips them. Its function is not touched.
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row when (new.kind not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity'))
  execute function public.push_for_notification();

-- ============================================================ 7. "just joined near you" (owner decision 4)
-- Migration 37's version with two lines added: a teen's arrival (or anyone
-- not known to be an adult) is never announced, and only adults are told.
create or replace function public.notify_joined_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare city text;
begin
  if coalesce(old.location, '') <> '' or coalesce(new.location, '') = '' then return new; end if;
  if new.created_at < now() - interval '14 days' then return new; end if;
  if new.age_group is distinct from 'adult' then return new; end if;
  city := lower(trim(split_part(new.location, ',', 1)));
  if char_length(city) < 2 then return new; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
  select p.id, new.id, 'joined', new.id::text, 'profile', new.location
  from public.profiles p
  where p.id <> new.id
    and p.age_group = 'adult'
    and lower(trim(split_part(p.location, ',', 1))) = city
    and not public.is_blocked_between(p.id, new.id)
  order by p.created_at desc
  limit 50;
  return new;
end $$;

-- ============================================================ 8. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new tables (expect alert_fanouts, alert_sends, court_checkin_days, court_checkins, court_follows, court_reviews, court_status):
-- select tablename from pg_tables where schemaname = 'public'
--   and tablename in ('alert_fanouts', 'alert_sends', 'court_checkin_days', 'court_checkins', 'court_follows', 'court_reviews', 'court_status') order by 1;
--
-- (b) Every court starts unknown (expect one row: unknown, with the number of courts):
-- select access, count(*) from public.courts group by 1;
--
-- (c) The general phone alert skips the new kinds (expect a WHEN clause naming them):
-- select pg_get_triggerdef(oid) from pg_trigger where tgname = 'push_for_notification';
--
-- (d) Who may call what (expect court_facts and court_follow_counts true for anon;
--     import_court_access, send_map_alert false for authenticated):
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') app
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('court_facts', 'court_follow_counts', 'court_right_now', 'import_court_access', 'send_map_alert') order by 1;
--
-- (e) The 15-minute tidy (expect courtside-court-status-sweep):
-- select jobname, schedule from cron.job where jobname like 'courtside-%';
--
-- (f) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
