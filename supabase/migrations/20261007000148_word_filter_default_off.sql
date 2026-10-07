-- CourtSide · migration 20261007000148: Hidden words' offensive filters start
-- OFF for adults (owner, Oct 6: "Turn off filter for words on default").
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. It is
-- all-or-nothing: if the check below fails it stops, and nothing at all
-- changes. Safe to run more than once.
--
-- In plain words, what changes:
--
--   Settings → Hidden words has two switches, "Hide offensive comments" and
--   "Hide offensive messages". Until now both started ON for everyone. Now,
--   for an adult who has never saved a choice there, both start OFF: their
--   comments and messages from people they don't follow are no longer hidden
--   for offensive words until they switch it on.
--
-- What stays exactly as it was:
--
--   - Under 18 (anyone not known to be an adult): both switches are always
--     on, stricter (the teen words too), and cannot be turned off.
--   - Anyone who already saved their Hidden words keeps what they saved, on
--     or off. (Saving anything on that page, a word of your own too, saves
--     both switches as they showed then; those people keep them on.)
--   - Your own words and phrases work as before.
--   - The severe words (slurs, sexual words about children, telling someone
--     to kill themselves, the gravest threats) are still refused everywhere,
--     for everyone ('blocked_words'). Nothing here touches that.
--
-- What changes, by name (each function is migration 117's, word for word,
-- with only the "true" for "no saved choice" turned to "false"):
--   word_filters: hide_offensive_comments and hide_offensive_requests now
--     default to false.
--   hidden_by_words: decides whether a comment or message is hidden for
--     someone; no saved choice now means off for an adult.
--   words_hold_message: the same for messages as they arrive.
--   hidden_words(): what the app shows on the page; no saved choice now
--     shows off for an adult.
--   set_hidden_words(...): a switch the app leaves out when saving now
--     counts as off for an adult (the app always sends both).
--
-- Needs 117 (live since Oct 5). Stops without changing anything if any of
-- these four functions has changed since 117.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  now_is text;
  t record;
begin
  if to_regclass('public.word_filters') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.hidden_by_words(uuid, text, text)') is null
     or to_regprocedure('public.hidden_words()') is null
     or to_regprocedure('public.set_hidden_words(boolean, boolean, text[], boolean, boolean)') is null
     or to_regprocedure('public.words_hold_message()') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'word_filters' and column_name = 'hide_offensive_comments')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'word_filters' and column_name = 'hide_offensive_requests') then
    raise exception 'Migration 148 stopped before changing anything: Hidden words (migration 117) has to run first.';
  end if;
  -- Each function this file replaces: as migration 117 left it, or as this
  -- file leaves it (run again).
  for t in select * from (values
      ('hidden_by_words', '19e44979e210965b04418c0790a8ef66', '4558f3713140e82ea9b683924773c539'),
      ('hidden_words', '43be9c3e4cb18cef14b5f5cc69a1c662', '991dc395020753ebde2c7991aef1c5e7'),
      ('set_hidden_words', '561ea8db7670acbd0346bb680ec0c136', '307fd4c36e1e0e4957bc1ff3d3316dbb'),
      ('words_hold_message', '6dda991fa515839c98d5d950686ae26f', 'ee0b94dace538f9923f5850ad54f32c9')) as x (fn, was, now)
  loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = t.fn;
    if now_is is null or now_is not in (t.was, t.now) then
      raise exception 'Migration 148 stopped before changing anything: % is not the version migration 117 left. Bring this file up to date with whatever changed it.', t.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------- 1. the column defaults
alter table public.word_filters alter column hide_offensive_comments set default false;
alter table public.word_filters alter column hide_offensive_requests set default false;

-- ------------------------------------------------------- 2. the four functions
-- Whether something written to `p_owner` (on their post, thread or question,
-- p_place 'comments'; or to them in a chat, 'requests') is hidden for them.
-- With no settings yet, both offensive filters are OFF for an adult (148).
-- Not a known adult: the offensive filters are on whatever the row says,
-- with the teen words. Only asked about words by someone p_owner doesn't
-- follow (words_hide).
create or replace function public.hidden_by_words(p_owner uuid, p_body text, p_place text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  f public.word_filters%rowtype;
  v text;
  teen boolean;
  hide boolean;
  custom boolean;
  rx text;
begin
  if p_owner is null or coalesce(btrim(p_body), '') = '' then return false; end if;
  select * into f from public.word_filters where user_id = p_owner;
  teen := not public.known_adult(p_owner);
  hide := teen or coalesce(case when p_place = 'comments' then f.hide_offensive_comments else f.hide_offensive_requests end, false);
  custom := coalesce(case when p_place = 'comments' then f.custom_in_comments else f.custom_in_requests end, true)
            and coalesce(cardinality(f.custom_words), 0) > 0;
  if not hide and not custom then return false; end if;
  if hide and public.words_found(p_body, case when teen then 'teen' else 'offensive' end) then return true; end if;
  if custom then
    rx := public.custom_words_regex(f.custom_words);
    if rx is not null then
      v := public.words_normal(p_body);
      if v ~ rx then return true; end if;
      if strpos(p_body, '@') > 0 and public.words_normal(p_body, false) ~ rx then return true; end if;
    end if;
  end if;
  return false;
end $$;

-- Your settings as the app shows them (the offensive switches as they
-- really work: on, for someone not known to be an adult; off for an adult
-- who never saved a choice).
create or replace function public.hidden_words()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f public.word_filters%rowtype;
  teen boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into f from public.word_filters where user_id = auth.uid();
  teen := not public.known_adult(auth.uid());
  return jsonb_build_object(
    'hideOffensiveComments', teen or coalesce(f.hide_offensive_comments, false),
    'hideOffensiveRequests', teen or coalesce(f.hide_offensive_requests, false),
    'customWords', to_jsonb(coalesce(f.custom_words, '{}'::text[])),
    'customInComments', coalesce(f.custom_in_comments, true),
    'customInRequests', coalesce(f.custom_in_requests, true),
    'locked', teen);
end $$;

-- Saves your settings and returns them as hidden_words() does. Words are
-- trimmed, repeats dropped (whatever the capitals); more than 100 says
-- 'too_many_words', one longer than 30 characters 'word_too_long'. Someone
-- not known to be an adult keeps both offensive filters on; for an adult a
-- switch left out counts as off.
create or replace function public.set_hidden_words(
  p_hide_comments boolean, p_hide_requests boolean, p_words text[], p_in_comments boolean, p_in_requests boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  teen boolean;
  clean text[];
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = me) then raise exception 'not signed in'; end if;
  teen := not public.known_adult(me);
  select coalesce(array_agg(w order by first_at), '{}') into clean
  from (
    select (array_agg(x.w order by x.n))[1] as w, min(x.n) as first_at
    from (select btrim(regexp_replace(w, '\s+', ' ', 'g')) as w, n
          from unnest(coalesce(p_words, '{}')) with ordinality as u(w, n)) x
    where x.w is not null and x.w <> ''
    group by lower(x.w)
  ) d;
  if exists (select 1 from unnest(clean) w where char_length(w) > 30) then raise exception 'word_too_long'; end if;
  if cardinality(clean) > 100 then raise exception 'too_many_words'; end if;
  insert into public.word_filters as f (user_id, hide_offensive_comments, hide_offensive_requests, custom_words, custom_in_comments, custom_in_requests, updated_at)
  values (me, teen or coalesce(p_hide_comments, false), teen or coalesce(p_hide_requests, false), clean,
          coalesce(p_in_comments, true), coalesce(p_in_requests, true), now())
  on conflict (user_id) do update set
    hide_offensive_comments = excluded.hide_offensive_comments,
    hide_offensive_requests = excluded.hide_offensive_requests,
    custom_words = excluded.custom_words,
    custom_in_comments = excluded.custom_in_comments,
    custom_in_requests = excluded.custom_in_requests,
    updated_at = now();
  return public.hidden_words();
end $$;

-- A message (or an edit of one) to people who don't follow its sender:
-- hidden for each of them whose filters it matches. An edit is checked
-- again. The words are tidied and looked up once for the whole chat, and
-- only when someone in it doesn't follow the sender; for each such person
-- only their own settings and words are asked. An adult with no saved
-- choice has the offensive filter off (148).
create or replace function public.words_hold_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  f public.word_filters%rowtype;
  teen boolean;
  hide boolean;
  custom boolean;
  v text;
  v_at text;
  off_hit boolean;
  teen_hit boolean;
begin
  if tg_op = 'UPDATE' then
    delete from public.message_word_holds where message_id = new.id;
  end if;
  if new.kind = 'system' or coalesce(btrim(new.body), '') = '' then return new; end if;
  for r in
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
      and not exists (select 1 from public.follows fo where fo.follower_id = m.user_id and fo.following_id = new.sender_id)
  loop
    f := null;
    select * into f from public.word_filters where user_id = r.user_id;
    teen := not public.known_adult(r.user_id);
    hide := teen or coalesce(f.hide_offensive_requests, false);
    custom := coalesce(f.custom_in_requests, true) and coalesce(cardinality(f.custom_words), 0) > 0;
    if hide then
      if off_hit is null then off_hit := public.words_found(new.body, 'offensive'); end if;
      if not off_hit and teen and teen_hit is null then teen_hit := public.words_found(new.body, 'teen'); end if;
      if off_hit or (teen and teen_hit) then
        insert into public.message_word_holds (message_id, user_id) values (new.id, r.user_id) on conflict do nothing;
        continue;
      end if;
    end if;
    if custom then
      if v is null then
        v := public.words_normal(new.body);
        if strpos(new.body, '@') > 0 then v_at := public.words_normal(new.body, false); end if;
      end if;
      if public.custom_words_hit(f.custom_words, v, v_at) then
        insert into public.message_word_holds (message_id, user_id) values (new.id, r.user_id) on conflict do nothing;
      end if;
    end if;
  end loop;
  return new;
end $$;

-- ------------------------------------------------------------- 3. who may call
-- As migration 117 left them (replacing a function keeps these; said again
-- so the file stands on its own).
revoke all on function public.hidden_by_words(uuid, text, text) from public, anon, authenticated;
revoke all on function public.words_hold_message() from public, anon, authenticated;
revoke all on function public.hidden_words() from public, anon;
revoke all on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) from public, anon;
grant execute on function public.hidden_words() to authenticated;
grant execute on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) to authenticated;

commit;

-- ============================================================ checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The two defaults (expect two rows, both "false"):
-- select column_name, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'word_filters' and column_name like 'hide_offensive_%';
--
-- (b) All four functions are this file's (expect four rows, all true):
-- select proname, md5(prosrc) in ('4558f3713140e82ea9b683924773c539', '991dc395020753ebde2c7991aef1c5e7',
--   '307fd4c36e1e0e4957bc1ff3d3316dbb', 'ee0b94dace538f9923f5850ad54f32c9')
--   from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('hidden_by_words', 'hidden_words', 'set_hidden_words', 'words_hold_message');
--
-- (c) How many people saved a choice already, and how many of those have
--     each switch on (they keep what they saved):
-- select count(*) as saved, count(*) filter (where hide_offensive_comments) as comments_on,
--        count(*) filter (where hide_offensive_requests) as messages_on from public.word_filters;
