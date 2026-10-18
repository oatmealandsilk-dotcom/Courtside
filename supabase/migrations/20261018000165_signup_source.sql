-- CourtSide · migration 20261018000165: counting sign-ups from each link
-- (Oct 18, owner, about his Facebook link courtsidebase.com/?ref=fb: "so how
-- will we tell if courtside is coming from Facebook", then "build tracking").
--
-- What it is for: migration 161 counts, per link label, the people who open
-- the website through it and their taps on "Get the app". Since guest mode
-- (Oct 17) the website is the app itself, so someone from Facebook can make
-- their account right there, and nothing said which link brought them. Now
-- the web app keeps the link's label (fb, reddit…) for 30 days, and when a
-- brand-new account finishes signing up it says so once: one "signup" for
-- that label. The Links page (Settings -> Admin -> Links) shows visitors,
-- app taps, web taps, emails and sign-ups per label.
--
-- In plain words, this file:
--   1. Lets link_events (161) hold a fourth kind of row, 'signup'. A signup
--      row is like the others: the label, the kind, a random id and the day.
--      It does not say which account it was: its random id is made up by the
--      server on the spot (not the visitor's browser id), and its time is
--      only the day (midnight), not the minute.
--   2. link_signups_noted: a private list of accounts whose sign-up has
--      already been counted, so each account counts once, ever. It holds the
--      account id and nothing else: no label, no time, no browser id. (Why an
--      account id at all: "once per account" has to know the account. A
--      hashed id would not hide anything, since anyone with the table could
--      hash every account id and compare; a column on user_state could be
--      changed by its owner through user_state's own rules. A table nobody
--      can read or write but the server is the smallest thing that works.)
--      Nothing joins it to link_events: the list says "counted", never where
--      from. Deleting an account deletes its line here.
--   3. note_signup_source(label): the one way in, for signed-in accounts only
--      (never the website signed out). It counts the sign-up only when:
--        * the account is new (made in the last 48 hours) and not suspended,
--        * it has never been counted before,
--        * the label is one log_link_event (161) already accepts: one of our
--          campaign labels, a real account's handle or an affiliate's code,
--        * the label is not the account's own handle.
--      Otherwise it quietly does nothing, and it never says which: it cannot
--      be used to test which handles exist, or to count one account twice.
--   4. admin_link_stats(days) (161), admins only, gains two numbers per
--      label: sign-ups in the last N days and all time. Its other numbers are
--      as before (visitors still counts browsers, not the signup rows).
--
-- Nothing here credits, pays or emails anyone, and nothing already saved
-- changes. Needs migrations 23, 116, 157 and 161 (all live). Stops before
-- changing anything if 161's functions or its kinds have changed since 161
-- wrote them, or if something already uses these names and is not this
-- file's. Safe to run more than once.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.
--
-- --------------------------------------------- SEEING THE NUMBERS (SQL editor)
-- (a) Sign-ups per link, last 7 days:
-- select label, count(*) as signups from public.link_events where kind = 'signup' and created_at > now() - interval '7 days' group by label order by 2 desc;
--
-- (b) Facebook, day by day: visitors, app taps, sign-ups:
-- select created_at::date as day, count(distinct visitor) filter (where kind <> 'signup') as visitors, count(*) filter (where kind = 'app') as app_taps, count(*) filter (where kind = 'signup') as signups from public.link_events where label = 'fb' group by 1 order by 1 desc;

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- md5 of the bodies migration 161 wrote (live since Oct 16).
  log_161   constant text := 'f58c56938f79200adc97e979572d4605';
  stats_161 constant text := 'ba36591212d26adf3dfc6450841bfbb8';
  -- md5 of link_events_kind as 161 wrote it (visit, app, web, email).
  kind_161  constant text := '9854a0c08805aeab0e57d5eecab124f4';
  r record;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.link_events') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.campaign_label(text)') is null
     or to_regprocedure('public.affiliate_code_owner(text)') is null
     or to_regprocedure('public.log_link_event(text, text, uuid)') is null
     or to_regprocedure('public.admin_link_stats(integer)') is null then
    raise exception 'Migration 165 stopped before changing anything: migrations 23, 116, 157 and 161 have to run first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_at') then
    raise exception 'Migration 165 stopped before changing anything: profiles has no created_at or suspended_at.';
  end if;
  -- log_link_event is not changed here, but the signup rule leans on it never taking 'signup' from the website.
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.log_link_event(text, text, uuid)'::regprocedure) <> log_161 then
    raise exception 'Migration 165 stopped before changing anything: public.log_link_event has changed since migration 161. Check it still refuses any kind but visit, app and web, then update this file''s md5.';
  end if;
  for r in select md5(p.prosrc) as h, p.prosrc as src from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_link_stats' loop
    if r.h <> stats_161 and position('signup_source_165' in r.src) = 0 then
      raise exception 'Migration 165 stopped before changing anything: public.admin_link_stats has changed since migration 161 (md5 %). Bring this file''s copy up to date first.', r.h;
    end if;
  end loop;
  for r in select p.prosrc as src from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname = 'note_signup_source' loop
    if position('signup_source_165' in r.src) = 0 then
      raise exception 'Migration 165 stopped before changing anything: public.note_signup_source already exists and is not this file''s.';
    end if;
  end loop;
  for r in select pg_get_constraintdef(c.oid) as d from pg_constraint c
            where c.conrelid = 'public.link_events'::regclass and c.conname = 'link_events_kind' loop
    if md5(r.d) <> kind_161 and position('signup' in r.d) = 0 then
      raise exception 'Migration 165 stopped before changing anything: the kinds link_events allows have changed since migration 161 (%).', r.d;
    end if;
  end loop;
  if to_regclass('public.link_signups_noted') is not null and (
       select array_agg(column_name::text order by column_name) from information_schema.columns
        where table_schema = 'public' and table_name = 'link_signups_noted') is distinct from array['user_id'] then
    raise exception 'Migration 165 stopped before changing anything: public.link_signups_noted already exists and is not this file''s.';
  end if;
end $$;

-- ------------------------------------------------- 1. the new kind of row
alter table public.link_events drop constraint if exists link_events_kind;
alter table public.link_events add constraint link_events_kind
  check (kind in ('visit', 'app', 'web', 'email', 'signup'));

-- ---------------------------------------- 2. accounts already counted once
create table if not exists public.link_signups_noted (
  -- The account whose sign-up was counted. Nothing else: not the label, not when.
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.link_signups_noted enable row level security;
-- Private: no rule lets anyone read or write it from the app or the website.
revoke all on table public.link_signups_noted from public, anon, authenticated;

-- ---------------------------------------------------- 3. the one way in
create or replace function public.note_signup_source(p_label text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  -- signup_source_165
  me uuid := auth.uid();
  l text := ltrim(lower(btrim(coalesce(p_label, ''))), '@');
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if l !~ '^[a-z0-9_]{2,24}$' then return; end if;
  -- The labels log_link_event (161) takes: ours, a real account's handle, an affiliate's code.
  if not (public.campaign_label(l)
          or exists (select 1 from public.profiles p where p.handle = l)
          or public.affiliate_code_owner(l) is not null) then
    return;
  end if;
  -- Only a new account (the last 48 hours), not suspended, and never its own handle.
  if not exists (select 1 from public.profiles p
                  where p.id = me and p.suspended_at is null
                    and p.created_at > now() - interval '48 hours'
                    and p.handle is distinct from l) then
    return;
  end if;
  -- Once per account, ever (two calls at once: the key lets only one in).
  insert into public.link_signups_noted (user_id) values (me) on conflict (user_id) do nothing;
  if not found then return; end if;
  -- A made-up id and only the day, so the row does not point back at the account.
  insert into public.link_events (label, kind, visitor, created_at)
  values (l, 'signup', gen_random_uuid(), date_trunc('day', now()));
end $$;
revoke all on function public.note_signup_source(text) from public, anon;
grant execute on function public.note_signup_source(text) to authenticated;

-- -------------------------------------------------- 4. the admin numbers
-- 161's, with sign-ups added (and the signup rows kept out of visitors).
-- The columns change, so the old one is dropped first; the app's older
-- builds read the same names and ignore the two new ones.
drop function if exists public.admin_link_stats(integer);
create or replace function public.admin_link_stats(p_days integer default 30)
returns table (
  label text,
  visitors bigint, app_taps bigint, web_taps bigint, emails bigint,
  visitors_all bigint, app_taps_all bigint, web_taps_all bigint, emails_all bigint,
  signups bigint, signups_all bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  -- link_events_161, signup_source_165
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)));
begin
  if not public.is_admin() then
    raise exception 'Only admins can see the link numbers.' using errcode = '42501';
  end if;
  return query
  with ev as (
    select e.label as l,
           count(distinct e.visitor) filter (where e.kind <> 'signup' and e.created_at >= since) as v,
           count(*) filter (where e.kind = 'app' and e.created_at >= since) as a,
           count(*) filter (where e.kind = 'web' and e.created_at >= since) as w,
           count(*) filter (where e.kind = 'signup' and e.created_at >= since) as s,
           count(distinct e.visitor) filter (where e.kind <> 'signup') as v_all,
           count(*) filter (where e.kind = 'app') as a_all,
           count(*) filter (where e.kind = 'web') as w_all,
           count(*) filter (where e.kind = 'signup') as s_all
      from public.link_events e
     group by e.label
  ),
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
         coalesce(ev.v_all, 0), coalesce(ev.a_all, 0), coalesce(ev.w_all, 0), coalesce(em.n_all, 0),
         coalesce(ev.s, 0), coalesce(ev.s_all, 0)
    from ev full join em on em.l = ev.l
   order by coalesce(ev.v, 0) + coalesce(em.n, 0) + coalesce(ev.s, 0) desc,
            coalesce(ev.v_all, 0) + coalesce(em.n_all, 0) + coalesce(ev.s_all, 0) desc, 1;
end $$;
revoke all on function public.admin_link_stats(integer) from public, anon;
grant execute on function public.admin_link_stats(integer) to authenticated;

-- ------------------------------------------------- 5. it did what it says
do $$
begin
  if has_table_privilege('anon', 'public.link_signups_noted', 'select') or has_table_privilege('authenticated', 'public.link_signups_noted', 'select')
     or has_table_privilege('authenticated', 'public.link_signups_noted', 'insert') or has_table_privilege('authenticated', 'public.link_events', 'select') then
    raise exception 'migration 165: a private table can be read or written directly';
  end if;
  if has_function_privilege('anon', 'public.note_signup_source(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.note_signup_source(text)', 'execute')
     or has_function_privilege('anon', 'public.admin_link_stats(integer)', 'execute') then
    raise exception 'migration 165: who may call the functions is wrong';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It pretends to be the newest account for a moment, counts its sign-up
-- from fb twice (only one lands), shows the numbers, then undoes it all.
--
-- do $$ declare me uuid := (select id from public.profiles order by created_at desc limit 1); before bigint; begin
--   before := (select count(*) from public.link_events where kind = 'signup' and label = 'fb');
--   update public.profiles set created_at = now() where id = me;
--   perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
--   perform public.note_signup_source('fb');
--   perform public.note_signup_source('fb');
--   raise notice 'dry run: new fb sign-ups % (expect 1), account noted: %',
--     (select count(*) from public.link_events where kind = 'signup' and label = 'fb') - before,
--     exists (select 1 from public.link_signups_noted where user_id = me);
-- end $$;
-- rollback;

-- ------------------------------------------------- 6. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) Who may call what (expect false, true, false):
-- select has_function_privilege('anon', 'public.note_signup_source(text)', 'execute'),
--        has_function_privilege('authenticated', 'public.note_signup_source(text)', 'execute'),
--        has_table_privilege('authenticated', 'public.link_signups_noted', 'select');
--
-- (b) The latest counted sign-ups (only the label and the day):
-- select created_at::date, label from public.link_events where kind = 'signup' order by created_at desc limit 20;
