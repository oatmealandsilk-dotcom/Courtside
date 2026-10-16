-- CourtSide · migration 20261016000161: counting who comes through each link
-- (Oct 16, owner: "ok im gonna start promoting on facebook and msg people,
-- but i want a new link to track the leads").
--
-- What it is for: courtsidebase.com/?ref=<label> already says which link
-- someone came from, but only an email left on the website kept that label.
-- Nobody was counted for just opening the link, or for tapping "Get the
-- iPhone app" (TestFlight cannot carry the label into the app), so a
-- Facebook post that brought 50 people who all installed the app looked
-- like it brought nobody. Now the website notes, for each link label:
--   * a visit   - someone opened the page through that link (once a day each)
--   * app       - they tapped a "Get the app" button (TestFlight)
--   * web       - they tapped "Use CourtSide on the web"
-- and the Links page in the app (Settings -> Admin -> Links) shows, per label,
-- visitors, app taps, web taps and emails left, for 7 days, 30 days and all
-- time. Emails are counted from the waitlist itself (the label it already
-- keeps), so nothing is counted twice.
--
-- The owner's two new links (Oct 16):
--   https://courtsidebase.com/?ref=fb     Facebook posts and groups (as before)
--   https://courtsidebase.com/?ref=fbdm   links he sends in Facebook messages
-- and one spare: https://courtsidebase.com/?ref=fbgroup, for groups on their
-- own if he ever wants to tell them apart from his own posts.
--
-- In plain words, this file:
--   1. Adds fbdm and fbgroup to our own campaign labels (campaign_label,
--      migration 116: the same list as the website's CAMPAIGNS). A campaign
--      label never credits a person and can never be taken as a handle, so
--      nobody can sign up as @fbdm and collect the Facebook-message visitors.
--      Stops with a plain message if an account has (or had) either handle,
--      or an affiliate code is either word.
--   2. link_events: a small private table, one row per counted visit or tap:
--      the link's label, which kind, a random id the visitor's browser made
--      up for itself, and the time. Nothing else: no IP address, no browser
--      name, no name or email, nothing that says who someone is. Children use
--      this app; this table cannot identify anyone. Nobody can read it or
--      write it directly, from the app or the website.
--   3. log_link_event(label, kind, visitor): the one way in, for the website
--      (signed out) and the app. It quietly ignores anything that is not
--      one of our campaign labels, a real account's handle or an affiliate's
--      code (so made-up labels fill nothing), and it never says whether a
--      label was counted (so it cannot be used to test which handles exist).
--      Each kind is counted at most once a day per visitor and label, a
--      visitor at most 40 times a day in all, and the whole table at most
--      20,000 rows a day: a script hammering it fills almost nothing.
--   4. admin_link_stats(days): admins only (is_admin, migration 23). One
--      row per label: unique visitors, app taps, web taps and emails left,
--      in the last N days and all time.
--
-- Nothing here credits, pays or emails anyone, and nothing already saved
-- changes. Needs migrations 23, 116 and 157 (all live). Stops before changing
-- anything if campaign_label has changed since migration 116 wrote it, or if
-- something already uses these names and is not this file's. Safe to run
-- more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.
--
-- --------------------------------------------- SEEING THE NUMBERS (SQL editor)
-- The Links page in the app shows these. To see them in the SQL editor
-- instead, paste one line (without the leading "-- ") and press Run. (The
-- SQL editor is not signed in as you, so it reads the table directly.)
--
-- (a) Per link, last 7 days: visitors, app taps, web taps.
-- select label, count(distinct visitor) as visitors, count(*) filter (where kind = 'app') as app_taps, count(*) filter (where kind = 'web') as web_taps from public.link_events where created_at > now() - interval '7 days' group by label order by visitors desc;
--
-- (b) The same for all time: change '7 days' to '100 years'.
--
-- (c) Emails left on the website per link (all time):
-- select coalesce(source, '(none)') as label, count(*) as emails from public.waitlist group by 1 order by 2 desc;
--
-- (d) Just the Facebook links, day by day:
-- select created_at::date as day, label, count(distinct visitor) as visitors, count(*) filter (where kind = 'app') as app_taps from public.link_events where label in ('fb', 'fbdm', 'fbgroup') group by 1, 2 order by 1 desc, 2;

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- md5 of campaign_label's body as migration 116 left it (live since Oct 5).
  label_116 constant text := '642dd68675eacf631aed884f7f62ad31';
  r record;
  w text;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.handle_history') is null
     or to_regclass('public.waitlist') is null or to_regclass('public.affiliate_codes') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.campaign_label(text)') is null
     or to_regprocedure('public.affiliate_code_owner(text)') is null then
    raise exception 'Migration 161 stopped before changing anything: migrations 23, 116 and 157 have to run first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'waitlist' and column_name = 'source_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'waitlist' and column_name = 'later_source')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'waitlist' and column_name = 'later_source_at') then
    raise exception 'Migration 161 stopped before changing anything: the waitlist is missing the columns migration 116 adds.';
  end if;
  -- campaign_label: as 116 left it, or as this file leaves it.
  for r in select p.prosrc as src from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'campaign_label' loop
    if md5(r.src) <> label_116 and position('link_events_161' in r.src) = 0 then
      raise exception 'Migration 161 stopped before changing anything: public.campaign_label has changed since migration 116 (md5 %). Bring this file''s list up to date with that change first.', md5(r.src);
    end if;
  end loop;
  -- The two functions this file adds: absent, or this file's.
  for r in select p.proname, p.prosrc as src from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('log_link_event', 'admin_link_stats') loop
    if position('link_events_161' in r.src) = 0 then
      raise exception 'Migration 161 stopped before changing anything: public.% already exists and is not this file''s. Compare before replacing it.', r.proname;
    end if;
  end loop;
  if to_regclass('public.link_events') is not null and (
       select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'link_events'
          and column_name in ('id', 'label', 'kind', 'visitor', 'created_at')) <> 5 then
    raise exception 'Migration 161 stopped before changing anything: public.link_events already exists and is not this file''s.';
  end if;
  -- The new labels must be nobody's: not a handle now, not one before, not an affiliate's code.
  foreach w in array array['fbdm', 'fbgroup'] loop
    if exists (select 1 from public.profiles where lower(handle) = w) then
      raise exception 'Migration 161 stopped before changing anything: an account is called @%, so % cannot be a campaign label (it would hide their invites). Pick another label for the links.', w, w;
    end if;
    if exists (select 1 from public.handle_history where lower(handle) = w) then
      raise exception 'Migration 161 stopped before changing anything: @% was someone''s handle before, so % cannot be a campaign label (their old links would stop crediting them). Pick another label.', w, w;
    end if;
    if exists (select 1 from public.affiliate_codes where lower(code) = w) then
      raise exception 'Migration 161 stopped before changing anything: % is an affiliate''s code, so it cannot be a campaign label. Pick another label.', w;
    end if;
  end loop;
end $$;

-- ------------------------------------------------ 1. the two new labels
-- Migration 116's list, word for word, plus fbdm and fbgroup (Oct 16). Keep
-- it the same as CAMPAIGNS in public/waitlist.html (that one also lists a
-- few people's names, which are left off here: they may sign up as themselves).
create or replace function public.campaign_label(p text)
returns boolean language sql immutable set search_path = public as $$
  -- link_events_161
  select lower(btrim(coalesce(p, ''))) = any (array[
    'instagram', 'ig', 'insta', 'courtsidebase', 'courtside', 'reddit', 'tiktok', 'facebook', 'fb',
    'twitter', 'threads', 'youtube', 'snapchat', 'whatsapp', 'discord', 'linktree', 'linkinbio', 'bio',
    'email', 'newsletter', 'qr', 'flyer', 'poster', 'google', 'share', 'web', 'app', 'testflight', 'beta',
    'fbdm', 'fbgroup'])
$$;
revoke all on function public.campaign_label(text) from public, anon, authenticated;

-- ------------------------------------------------------ 2. the table
create table if not exists public.link_events (
  id         bigint generated always as identity primary key,
  -- The link's ?ref= label, written down the one way (lower case, no @).
  label      text not null,
  -- 'email' is kept for later; today emails are counted from the waitlist.
  kind       text not null,
  -- A random id the visitor's own browser made up. Not tied to any account.
  visitor    uuid not null,
  created_at timestamptz not null default now(),
  constraint link_events_label_shape check (label ~ '^[a-z0-9_]{2,24}$'),
  constraint link_events_kind check (kind in ('visit', 'app', 'web', 'email'))
);
create index if not exists link_events_visitor_idx on public.link_events (visitor, created_at desc);
create index if not exists link_events_label_idx on public.link_events (label, created_at desc);
create index if not exists link_events_created_idx on public.link_events (created_at desc);
alter table public.link_events enable row level security;
-- Private: no rule lets anyone read or write it from the app or the website.
revoke all on table public.link_events from public, anon, authenticated;

-- ---------------------------------------------------- 3. the one way in
create or replace function public.log_link_event(p_label text, p_kind text, p_visitor uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  -- link_events_161
  l text := ltrim(lower(btrim(coalesce(p_label, ''))), '@');
  k text := lower(btrim(coalesce(p_kind, '')));
begin
  if l !~ '^[a-z0-9_]{2,24}$' or p_visitor is null then return; end if;
  -- Emails are counted from the waitlist row itself, so the website never sends them here.
  if k not in ('visit', 'app', 'web') then return; end if;
  -- Only our own labels, a real account's handle, or an affiliate's code.
  if not (public.campaign_label(l)
          or exists (select 1 from public.profiles p where p.handle = l)
          or public.affiliate_code_owner(l) is not null) then
    return;
  end if;
  -- One visitor at a time, so two quick taps cannot both slip past the checks below.
  perform pg_advisory_xact_lock(hashtext('link_events_161:' || p_visitor::text));
  -- Each kind once a day per visitor and label.
  if exists (select 1 from public.link_events e
              where e.visitor = p_visitor and e.label = l and e.kind = k
                and e.created_at > now() - interval '1 day') then
    return;
  end if;
  -- A visitor at most 40 times a day in all; the whole table at most 20,000 a day.
  if (select count(*) from public.link_events e
       where e.visitor = p_visitor and e.created_at > now() - interval '1 day') >= 40 then
    return;
  end if;
  if (select count(*) from public.link_events e where e.created_at > now() - interval '1 day') >= 20000 then
    return;
  end if;
  insert into public.link_events (label, kind, visitor) values (l, k, p_visitor);
end $$;
revoke all on function public.log_link_event(text, text, uuid) from public;
grant execute on function public.log_link_event(text, text, uuid) to anon, authenticated;

-- -------------------------------------------------- 4. the admin numbers
create or replace function public.admin_link_stats(p_days integer default 30)
returns table (
  label text,
  visitors bigint, app_taps bigint, web_taps bigint, emails bigint,
  visitors_all bigint, app_taps_all bigint, web_taps_all bigint, emails_all bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  -- link_events_161
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)));
begin
  if not public.is_admin() then
    raise exception 'Only admins can see the link numbers.' using errcode = '42501';
  end if;
  return query
  with ev as (
    select e.label as l,
           count(distinct e.visitor) filter (where e.created_at >= since) as v,
           count(*) filter (where e.kind = 'app' and e.created_at >= since) as a,
           count(*) filter (where e.kind = 'web' and e.created_at >= since) as w,
           count(distinct e.visitor) as v_all,
           count(*) filter (where e.kind = 'app') as a_all,
           count(*) filter (where e.kind = 'web') as w_all
      from public.link_events e
     group by e.label
  ),
  -- An email left through the link: its first label, or (someone already on
  -- the list) a later player's link, counted once per email and label.
  em_rows as (
    select x.id, x.l, max(x.t) as t from (
      select w.id, lower(w.source) as l, coalesce(w.source_at, w.created_at) as t
        from public.waitlist w where w.source is not null
      union all
      select w.id, lower(w.later_source), coalesce(w.later_source_at, w.created_at)
        from public.waitlist w where w.later_source is not null
    ) x group by x.id, x.l
  ),
  em as (
    select r.l, count(*) filter (where r.t >= since) as n, count(*) as n_all
      from em_rows r group by r.l
  )
  select coalesce(ev.l, em.l),
         coalesce(ev.v, 0), coalesce(ev.a, 0), coalesce(ev.w, 0), coalesce(em.n, 0),
         coalesce(ev.v_all, 0), coalesce(ev.a_all, 0), coalesce(ev.w_all, 0), coalesce(em.n_all, 0)
    from ev full join em on em.l = ev.l
   order by coalesce(ev.v, 0) + coalesce(em.n, 0) desc, coalesce(ev.v_all, 0) + coalesce(em.n_all, 0) desc, 1;
end $$;
revoke all on function public.admin_link_stats(integer) from public, anon;
grant execute on function public.admin_link_stats(integer) to authenticated;

-- ------------------------------------------------- 5. it did what it says
do $$
begin
  if not public.campaign_label('fbdm') or not public.campaign_label('FBGroup') or not public.campaign_label('fb')
     or not public.campaign_label('instagram') or public.campaign_label('omuchitaletennis') then
    raise exception 'migration 161: the campaign labels are not as written';
  end if;
  if has_table_privilege('anon', 'public.link_events', 'select') or has_table_privilege('anon', 'public.link_events', 'insert')
     or has_table_privilege('authenticated', 'public.link_events', 'select') or has_table_privilege('authenticated', 'public.link_events', 'insert') then
    raise exception 'migration 161: link_events can be read or written directly';
  end if;
  if not has_function_privilege('anon', 'public.log_link_event(text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_link_stats(integer)', 'execute') then
    raise exception 'migration 161: who may call the two functions is wrong';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It counts one Facebook-message visit and tap inside the transaction, shows
-- them, then undoes it all.
--
-- do $$ begin
--   perform public.log_link_event('fbdm', 'visit', '00000000-0000-4000-8000-000000000161');
--   perform public.log_link_event('@FBDM', 'visit', '00000000-0000-4000-8000-000000000161');
--   perform public.log_link_event('fbdm', 'app', '00000000-0000-4000-8000-000000000161');
--   perform public.log_link_event('nobody_xyz_161', 'visit', '00000000-0000-4000-8000-000000000161');
--   raise notice 'dry run: fbdm rows % (expect 2), nobody_xyz_161 rows % (expect 0), fbdm is a label: %, handle_status fbdm: %',
--     (select count(*) from public.link_events where label = 'fbdm' and visitor = '00000000-0000-4000-8000-000000000161'),
--     (select count(*) from public.link_events where label = 'nobody_xyz_161'),
--     public.campaign_label('fbdm'), public.handle_status('fbdm');
-- end $$;
-- rollback;

-- ------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The new labels are ours and nobody can take them (expect true, true, taken, taken):
-- select public.campaign_label('fbdm'), public.campaign_label('fbgroup'), public.handle_status('fbdm'), public.handle_status('fbgroup');
--
-- (b) Only the server reads the table; the website can count, not read (expect false, false, true, false, true):
-- select has_table_privilege('anon', 'public.link_events', 'select'),
--        has_table_privilege('authenticated', 'public.link_events', 'select'),
--        has_function_privilege('anon', 'public.log_link_event(text, text, uuid)', 'execute'),
--        has_function_privilege('anon', 'public.admin_link_stats(integer)', 'execute'),
--        has_function_privilege('authenticated', 'public.admin_link_stats(integer)', 'execute');
--
-- (c) The latest counted visits and taps (no person in them, only the label):
-- select created_at, label, kind from public.link_events order by created_at desc limit 20;
