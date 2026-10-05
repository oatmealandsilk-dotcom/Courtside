-- CourtSide · migration 117: Hidden words, the way Instagram does it
-- (Oct 5, owner: "Do word feature like how Instagram does." App Store
-- guideline 1.2 asks for a way to filter objectionable content.)
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if a check below fails it stops, and
-- nothing at all changes. Safe to run more than once.
--
-- In plain words, what changes:
--
-- 1. A built-in list of offensive words, phrases and emojis lives in the
--    database. The app can never read it. It has three levels:
--      severe     slurs, sexual words about children, and threats ("I will
--                 kill you", "kill yourself"). These are refused wherever
--                 anyone writes: posts and captions, Instants, comments,
--                 threads and replies, questions to coaches and coaches'
--                 replies, chat messages, names, handles and bios, group
--                 and group-chat names, polls, hit notes, court notes and
--                 reviews, tips and coach reviews. Edits too. The app says
--                 "This includes words that break CourtSide's rules."
--      offensive  the severe ones plus insults, swearing, explicit sexual
--                 words and harassment ("nobody likes you"). Hidden, never
--                 refused (below).
--      teen       a few more that are only hidden for under-18 accounts
--                 ("how old are you", "send pics", "sexy").
--    Matching ignores capitals, accents, repeated letters ("fuuuck"), the
--    usual swaps (0 for o, 1 for i, 3 for e, 4 for a, 5 or $ for s, @ for
--    a), and dots or spaces between the letters of a slur ("n i g g e r").
--    It only matches whole words, so "class", "assassin", "Scunthorpe",
--    "grape" and "therapist" never match, and normal tennis talk ("kill
--    shot", "killed it", "smash", "he shot 40%", "beat him 6-0", "murdered
--    that forehand", "choke", "tank", "balls") never does either.
--
-- 2. Your Hidden words settings (Settings → Hidden words), only yours:
--      Hide offensive comments          on unless you turn it off
--      Hide offensive message requests  on unless you turn it off
--      Custom words and phrases         your own list, up to 100, each up to
--                                       30 characters, with a switch for
--                                       comments and one for messages
--    Under 18 (anyone not known to be an adult): both offensive filters are
--    always on, stricter (the teen words too), and cannot be turned off; the
--    server ignores turning them off.
--
-- 3. Comments. A new comment on your post or Instant, a reply in your
--    thread, or a coach's reply on your question, that matches your
--    filters, is hidden: only the person who wrote it (to whom it looks
--    normal) and you can see it. You find it under "Hidden comments" at the
--    end of the comments and can Unhide it. Nobody else sees it, it is not
--    counted for them, and you are not told about it (no notification, no
--    phone alert, then or after you unhide it). Nothing is deleted.
--
-- 4. Messages. CourtSide has no message requests folder: anyone you can
--    message lands in the same inbox. So the closest honest equivalent: a
--    message from someone you don't follow that matches your filters shows
--    to you as "Hidden message · tap to show", and your phone is not
--    alerted for it. The sender is not told. Chats with people you follow
--    are never filtered.
--
-- What changes, by name:
--   word_list, word_patterns (new): the list and its ready-made patterns.
--     Nobody reads or writes them from the app.
--   word_filters (new): each person's settings; you read only yours, and
--     change them only through set_hidden_words.
--   comments, story_comments, answers, coach_replies: + hidden_by_words_at,
--     filled in by the database only; a narrowing reading rule beside each
--     table's own rule (that rule is untouched).
--   notify_comment, notify_hit_comment, notify_answer, notify_coach_reply:
--     the triggers now skip a hidden one (the functions are untouched).
--   message_word_holds (new): which message is hidden for whom; you read
--     only yours.
--   push_for_message (86): word for word, plus one line: no alert for a
--     message hidden for that person.
--   words_block / words_block_profile (new triggers): the severe refusal.
--     A sign-up whose handle or name is severe gets a plain one instead of
--     failing.
--   hidden_words(), set_hidden_words(...), unhide_words(kind, id): what the
--     app calls. Nothing is callable signed out.
--
-- Needs 54, 56, 86, 108 and 109 (all live). Stops without changing anything
-- if push_for_message has changed since 86.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  now_is text;
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.known_adult(uuid)') is null
     or to_regprocedure('public.send_push(uuid, text, text, text)') is null
     or to_regprocedure('public.is_blocked_between(uuid, uuid)') is null
     or to_regprocedure('public.group_label(uuid, uuid)') is null
     or to_regprocedure('public.notify_comment()') is null
     or to_regprocedure('public.notify_hit_comment()') is null
     or to_regprocedure('public.notify_answer()') is null
     or to_regprocedure('public.notify_coach_reply()') is null
     or to_regclass('public.conversation_prefs') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'removed_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id') then
    raise exception 'Migration 117 stopped before changing anything: migrations 54, 56, 86, 108 and 109 have to run first.';
  end if;
  select md5(p.prosrc) into now_is from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'push_for_message';
  -- As 86 left it, or as this file leaves it.
  if now_is is null or now_is not in ('5d33fa08c2afa64af26a29f8bc084d1a', 'e241c5e1c8f5dcbfe138dc08f37a17f8') then
    raise exception 'Migration 117 stopped before changing anything: push_for_message is not the version migration 86 left. Bring this file up to date with whatever changed it.';
  end if;
end $$;

-- ------------------------------------------------------------- 1. the list
create table if not exists public.word_list (
  -- The word or phrase as people write it, in small letters (or, for the
  -- few written as a pattern below, a short label).
  term text primary key,
  tier text not null check (tier in ('severe', 'offensive', 'teen')),
  -- Also caught with dots, dashes or spaces between its letters ("f.u.c.k").
  spaced boolean not null default false,
  -- Also caught with the usual endings (s, ed, er, ing, in, y…).
  endings boolean not null default false,
  -- Also caught inside a handle, name or group name written as one word ("xxniggerxx").
  in_names boolean not null default false,
  -- Not when straight after one of these ("don't kill yourself in this heat").
  unless_before text[] not null default '{}',
  -- Not when straight before one of these ("a chink in his armour").
  unless_after text[] not null default '{}',
  -- A hand-written pattern instead of the term (the threats), over the same tidied text.
  pattern text
);
alter table public.word_list enable row level security;
revoke all on public.word_list from public, anon, authenticated;

-- The list made into patterns ahead of time, a few dozen entries a piece.
create table if not exists public.word_patterns (
  tier text not null,
  part int not null,
  pattern text not null,
  primary key (tier, part)
);
alter table public.word_patterns enable row level security;
revoke all on public.word_patterns from public, anon, authenticated;

-- ------------------------------------------------------ 2. tidying the words
-- Small letters, accents off, look-alike letters from other alphabets made
-- plain, invisible characters out, apostrophes out ("i'll" is "ill"), an @
-- in front of a handle dropped, "!" or "|" between letters read as i, and in
-- any word with a letter in it 0 1 3 4 5 7 9 @ $ read as o i e a s t g a s.
-- A number on its own ("455 serves", "6-0", "40%") stays a number.
-- With p_mentions false an @ in front of a word is read as an a too: text
-- with an @ in it is looked at both ways ("@sshole", "@lex").
create or replace function public.words_normal(t text, p_mentions boolean default true)
returns text language plpgsql immutable set search_path = public as $$
declare
  s text;
begin
  if t is null or t = '' then return ''; end if;
  s := lower(normalize(t, NFKD));
  s := regexp_replace(s, '[̀-ͯ­​-‏⁠﻿]', '', 'g');
  s := replace(replace(replace(s, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe');
  -- Cyrillic and Greek letters that look like plain ones, and a few others.
  s := translate(s, 'аеорсухіјѕԁкмтнвαειονρτυκøłđı', 'aeopcyxijsdkmthbaeiovptukoldi');
  s := regexp_replace(s, '[''’‘`´]', '', 'g');
  if p_mentions then
    s := regexp_replace(s, '(^|[^a-z0-9_@$])@(?=[a-z0-9_]{3})', '\1 ', 'g');
  end if;
  s := regexp_replace(s, '([a-z])[!|]+(?=[a-z])', '\1i', 'g');
  select string_agg(case when m[1] ~ '[a-z@$]' then translate(m[1], '0134579@$', 'oieastgas') else m[1] end, '' order by n)
    into s
    from regexp_matches(s, '[a-z0-9@$]+|[^a-z0-9@$]+', 'g') with ordinality as x(m, n);
  return coalesce(s, '');
end $$;

-- One term as a pattern: each letter may repeat ("fuuuck"), a vowel may be
-- a * or # ("f*ck"), a space is any run of spaces or marks (but never a
-- full stop, comma or the like, which end one thought: "Go, die-hard
-- fans" is two), and the whole
-- thing is a word on its own (nothing glued on either side). A spaced one
-- is also caught with a mark between every one of its letters ("f.u.c.k",
-- "n i g g e r"), never between only some ("go ok" is not "gook").
create or replace function public.words_regex(p_term text, p_spaced boolean, p_endings text)
returns text language plpgsql immutable set search_path = public as $$
declare
  i int;
  c text;
  piece text;
  rx text := '';
  apart text := '';
begin
  for i in 1 .. char_length(p_term) loop
    c := substr(p_term, i, 1);
    if c ~ '[aeiou]' then piece := '[' || c || '*#]+';
    elsif c ~ '[a-z0-9]' then piece := c || '+';
    elsif c ~ '\s' then
      piece := case when rx like '%[^a-z0-9.,!?;:]+' then '' else '[^a-z0-9.,!?;:]+' end;
    elsif c ~ '[][\\^$.|?*+(){}]' then piece := '\' || c;
    else piece := c;
    end if;
    rx := rx || piece;
    if p_spaced and c ~ '[a-z]' then
      apart := apart || case when apart = '' then '' else '[^a-z0-9]{1,3}' end || piece;
    end if;
  end loop;
  if p_spaced and apart <> '' then rx := '(?:' || rx || '|' || apart || ')'; end if;
  rx := rx || coalesce(p_endings, '');
  if p_term ~ '^[a-z0-9]' then rx := '(?<![a-z0-9])' || rx; end if;
  if p_term ~ '[a-z0-9]$' then rx := rx || '(?![a-z0-9])'; end if;
  return rx;
end $$;

-- A list entry as its pattern, with its exceptions around it.
create or replace function public.word_entry_regex(w public.word_list)
returns text language plpgsql immutable set search_path = public as $$
declare
  rx text;
  around text;
begin
  if w.pattern is not null then return w.pattern; end if;
  rx := public.words_regex(w.term, w.spaced, case when w.endings then '(?:s|es|d|ed|r|er|rs|ers|ing|in|y|ie|ies)?' end);
  if cardinality(w.unless_before) > 0 then
    select string_agg(regexp_replace(b, '\s+', '[^a-z0-9]+', 'g'), '|') into around from unnest(w.unless_before) b;
    rx := '(?<!(?:' || around || ')[^a-z0-9]{1,3})' || rx;
  end if;
  if cardinality(w.unless_after) > 0 then
    select string_agg(regexp_replace(a, '\s+', '[^a-z0-9]+', 'g'), '|') into around from unnest(w.unless_after) a;
    rx := rx || '(?![^a-z0-9]+(?:' || around || ')(?![a-z0-9]))';
  end if;
  return rx;
end $$;

-- The same for a name written as one word: its letters only, anywhere.
create or replace function public.word_name_regex(p_term text)
returns text language sql immutable set search_path = public as $$
  select string_agg(c || '+', '' order by n)
  from regexp_split_to_table(regexp_replace(p_term, '[^a-z]', '', 'g'), '') with ordinality as x(c, n);
$$;

-- Makes the patterns again from the list (after any change to it).
create or replace function public.rebuild_word_patterns()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.word_patterns;
  insert into public.word_patterns (tier, part, pattern)
  select tier, part, string_agg('(?:' || rx || ')', '|' order by term)
  from (
    select w.tier, w.term, public.word_entry_regex(w) as rx,
      (row_number() over (partition by w.tier order by w.term) - 1) / 40 as part
    from public.word_list w
  ) e
  group by tier, part;
  insert into public.word_patterns (tier, part, pattern)
  select 'names', 0, string_agg(public.word_name_regex(w.term), '|' order by w.term)
  from public.word_list w where w.in_names and w.tier = 'severe'
  having count(*) > 0;
end $$;

create or replace function public.word_list_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rebuild_word_patterns();
  return null;
end $$;
drop trigger if exists word_list_changed on public.word_list;
create trigger word_list_changed after insert or update or delete on public.word_list
  for each statement execute function public.word_list_changed();

-- ---------------------------------------------------------- 3. the matching
-- Whether tidied text has a word from the list: 'severe' looks for the
-- severe ones, 'offensive' for those and the offensive ones, 'teen' for all.
create or replace function public.words_found_in(v text, p_level text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(v, '') <> '' and exists (
    select 1 from public.word_patterns p
    where p.tier = any (case p_level
        when 'severe' then array['severe']
        when 'offensive' then array['severe', 'offensive']
        when 'teen' then array['severe', 'offensive', 'teen']
        else array[]::text[] end)
      and v ~ p.pattern);
$$;

create or replace function public.words_found(body text, p_level text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.words_found_in(public.words_normal(body), p_level)
      or (strpos(coalesce(body, ''), '@') > 0 and public.words_found_in(public.words_normal(body, false), p_level));
$$;

-- A handle, name or group name: severe words as words, and the few written
-- together in one go ("bignigger99").
create or replace function public.words_in_name(body text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v text := public.words_normal(body);
begin
  if public.words_found_in(v, 'severe') then return true; end if;
  v := regexp_replace(v, '[^a-z]', '', 'g');
  return v <> '' and exists (select 1 from public.word_patterns p where p.tier = 'names' and v ~ p.pattern);
end $$;

-- Someone's own words as one pattern (a word, a phrase or an emoji each).
-- Words and phrases match whole, with a plural; an emoji anywhere.
create or replace function public.custom_words_regex(p_words text[])
returns text language plpgsql immutable set search_path = public as $$
declare
  w text;
  n text;
  parts text[] := '{}';
begin
  foreach w in array coalesce(p_words, '{}') loop
    n := btrim(regexp_replace(public.words_normal(w), '\s+', ' ', 'g'));
    if n = '' then continue; end if;
    if n ~ '[a-z0-9]' then
      parts := parts || public.words_regex(n, false, '(?:s|es)?');
    else
      parts := parts || regexp_replace(n, '([][\\^$.|?*+(){}])', '\\\1', 'g');
    end if;
  end loop;
  if cardinality(parts) = 0 then return null; end if;
  return '(?:' || array_to_string(parts, ')|(?:') || ')';
end $$;

-- ------------------------------------------------------- 4. your settings
create or replace function public.word_filters_ok(p_words text[])
returns boolean language sql immutable set search_path = public as $$
  select cardinality(coalesce(p_words, '{}')) <= 100
     and not exists (select 1 from unnest(coalesce(p_words, '{}')) w where w is null or btrim(w) = '' or char_length(w) > 30);
$$;

create table if not exists public.word_filters (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hide_offensive_comments boolean not null default true,
  hide_offensive_requests boolean not null default true,
  custom_words text[] not null default '{}',
  custom_in_comments boolean not null default true,
  custom_in_requests boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint word_filters_words_ok check (public.word_filters_ok(custom_words))
);
alter table public.word_filters enable row level security;
revoke all on public.word_filters from public, anon, authenticated;
grant select on public.word_filters to authenticated;
drop policy if exists "your hidden words are yours" on public.word_filters;
create policy "your hidden words are yours" on public.word_filters for select using (auth.uid() = user_id);

-- Whether something written to `p_owner` (on their post, thread or question,
-- p_place 'comments'; or to them in a chat, 'requests') is hidden for them.
-- With no settings yet, both offensive filters are on. Not a known adult:
-- the offensive filters are on whatever the row says, with the teen words.
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
  hide := teen or coalesce(case when p_place = 'comments' then f.hide_offensive_comments else f.hide_offensive_requests end, true);
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
-- really work: on, for someone not known to be an adult).
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
    'hideOffensiveComments', teen or coalesce(f.hide_offensive_comments, true),
    'hideOffensiveRequests', teen or coalesce(f.hide_offensive_requests, true),
    'customWords', to_jsonb(coalesce(f.custom_words, '{}'::text[])),
    'customInComments', coalesce(f.custom_in_comments, true),
    'customInRequests', coalesce(f.custom_in_requests, true),
    'locked', teen);
end $$;

-- Saves your settings and returns them as hidden_words() does. Words are
-- trimmed, repeats dropped (whatever the capitals); more than 100 says
-- 'too_many_words', one longer than 30 characters 'word_too_long'. Someone
-- not known to be an adult keeps both offensive filters on.
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
  values (me, teen or coalesce(p_hide_comments, true), teen or coalesce(p_hide_requests, true), clean,
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

-- ------------------------------------------------- 5. hidden comments and replies
alter table public.comments add column if not exists hidden_by_words_at timestamptz;
alter table public.story_comments add column if not exists hidden_by_words_at timestamptz;
alter table public.answers add column if not exists hidden_by_words_at timestamptz;
alter table public.coach_replies add column if not exists hidden_by_words_at timestamptz;
create index if not exists comments_hidden_words_idx on public.comments (post_id) where hidden_by_words_at is not null;
create index if not exists story_comments_hidden_words_idx on public.story_comments (story_id) where hidden_by_words_at is not null;
create index if not exists answers_hidden_words_idx on public.answers (question_id) where hidden_by_words_at is not null;
create index if not exists coach_replies_hidden_words_idx on public.coach_replies (question_id) where hidden_by_words_at is not null;

-- Whose post, Instant, thread or question something was written on.
create or replace function public.words_owner_of(p_table text, p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case p_table
    when 'comments' then (select author_id from public.posts where id = p_id)
    when 'story_comments' then (select author_id from public.stories where id = p_id)
    when 'answers' then (select author_id from public.questions where id = p_id)
    when 'coach_replies' then (select author_id from public.coach_questions where id = p_id)
  end;
$$;

-- On a new one: hidden when it matches its owner's filters (never their own
-- words). On an edit of the words: checked again. Otherwise nobody but
-- unhide_words below can change it.
create or replace function public.words_hide()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_writer uuid;
  v_hit boolean;
begin
  if tg_table_name = 'comments' then
    v_owner := public.words_owner_of('comments', new.post_id); v_writer := new.author_id;
  elsif tg_table_name = 'story_comments' then
    v_owner := public.words_owner_of('story_comments', new.story_id); v_writer := new.author_id;
  elsif tg_table_name = 'answers' then
    v_owner := public.words_owner_of('answers', new.question_id); v_writer := new.author_id;
  else
    v_owner := public.words_owner_of('coach_replies', new.question_id); v_writer := new.coach_user_id;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('courtside.unhiding', true), '') = 'on' then return new; end if;
    new.hidden_by_words_at := old.hidden_by_words_at;
    if new.body is not distinct from old.body then return new; end if;
  end if;
  v_hit := v_owner is not null and v_writer is distinct from v_owner
           and public.hidden_by_words(v_owner, new.body, 'comments');
  new.hidden_by_words_at := case when not v_hit then null
                                 when tg_op = 'UPDATE' then coalesce(old.hidden_by_words_at, now())
                                 else now() end;
  return new;
end $$;
revoke all on function public.words_hide() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['comments', 'story_comments', 'answers', 'coach_replies'] loop
    execute format('drop trigger if exists words_hide on public.%I', t);
    execute format('create trigger words_hide before insert or update on public.%I for each row execute function public.words_hide()', t);
  end loop;
end $$;

-- Who may read a hidden one: its writer, the owner of what it is on, and
-- admins. A narrowing rule beside each table's own reading rule. The owner
-- can always read their own post, Instant, thread or question, so the check
-- goes through the ordinary rules.
drop policy if exists "hidden words stay between two" on public.comments;
create policy "hidden words stay between two" on public.comments as restrictive for select
  using (hidden_by_words_at is null or auth.uid() = author_id or public.is_admin()
    or exists (select 1 from public.posts p where p.id = comments.post_id and p.author_id = auth.uid()));
drop policy if exists "hidden words stay between two" on public.story_comments;
create policy "hidden words stay between two" on public.story_comments as restrictive for select
  using (hidden_by_words_at is null or auth.uid() = author_id or public.is_admin()
    or exists (select 1 from public.stories s where s.id = story_comments.story_id and s.author_id = auth.uid()));
drop policy if exists "hidden words stay between two" on public.answers;
create policy "hidden words stay between two" on public.answers as restrictive for select
  using (hidden_by_words_at is null or auth.uid() = author_id or public.is_admin()
    or exists (select 1 from public.questions q where q.id = answers.question_id and q.author_id = auth.uid()));
drop policy if exists "hidden words stay between two" on public.coach_replies;
create policy "hidden words stay between two" on public.coach_replies as restrictive for select
  using (hidden_by_words_at is null or auth.uid() = coach_user_id or public.is_admin()
    or exists (select 1 from public.coach_questions q where q.id = coach_replies.question_id and q.author_id = auth.uid()));

-- Nobody is told about a hidden one: the notification triggers skip it.
-- (Their functions are untouched; only when they run changes.)
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row when (new.hidden_by_words_at is null) execute function public.notify_comment();
drop trigger if exists notify_hit_comment on public.story_comments;
create trigger notify_hit_comment after insert on public.story_comments
  for each row when (new.hidden_by_words_at is null) execute function public.notify_hit_comment();
drop trigger if exists notify_answer on public.answers;
create trigger notify_answer after insert on public.answers
  for each row when (new.hidden_by_words_at is null) execute function public.notify_answer();
drop trigger if exists notify_coach_reply on public.coach_replies;
create trigger notify_coach_reply after insert on public.coach_replies
  for each row when (new.hidden_by_words_at is null) execute function public.notify_coach_reply();

-- Unhide: only the owner of what it is on. Kinds as the take-down tool
-- names them: comment, hit-comment, answer, coach-reply. Returns 'done', or
-- 'not_hidden'. Nobody is told, then or later.
create or replace function public.unhide_words(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_owner uuid;
  v_hidden timestamptz;
  v_found boolean := false;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_kind = 'comment' then
    select public.words_owner_of('comments', c.post_id), c.hidden_by_words_at into v_owner, v_hidden from public.comments c where c.id = p_id;
    v_found := found;
  elsif p_kind = 'hit-comment' then
    select public.words_owner_of('story_comments', c.story_id), c.hidden_by_words_at into v_owner, v_hidden from public.story_comments c where c.id = p_id;
    v_found := found;
  elsif p_kind = 'answer' then
    select public.words_owner_of('answers', a.question_id), a.hidden_by_words_at into v_owner, v_hidden from public.answers a where a.id = p_id;
    v_found := found;
  elsif p_kind = 'coach-reply' then
    select public.words_owner_of('coach_replies', r.question_id), r.hidden_by_words_at into v_owner, v_hidden from public.coach_replies r where r.id = p_id;
    v_found := found;
  else
    raise exception 'unknown kind';
  end if;
  if not v_found or v_owner is distinct from me then raise exception 'not allowed'; end if;
  if v_hidden is null then return 'not_hidden'; end if;
  perform set_config('courtside.unhiding', 'on', true);
  if p_kind = 'comment' then update public.comments set hidden_by_words_at = null where id = p_id;
  elsif p_kind = 'hit-comment' then update public.story_comments set hidden_by_words_at = null where id = p_id;
  elsif p_kind = 'answer' then update public.answers set hidden_by_words_at = null where id = p_id;
  else update public.coach_replies set hidden_by_words_at = null where id = p_id;
  end if;
  perform set_config('courtside.unhiding', 'off', true);
  return 'done';
end $$;

-- ------------------------------------------------------------ 6. messages
-- Which message is hidden for whom. You read only yours.
create table if not exists public.message_word_holds (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  held_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_word_holds_user_idx on public.message_word_holds (user_id, held_at desc);
alter table public.message_word_holds enable row level security;
revoke all on public.message_word_holds from public, anon, authenticated;
grant select on public.message_word_holds to authenticated;
drop policy if exists "your hidden messages are yours" on public.message_word_holds;
create policy "your hidden messages are yours" on public.message_word_holds for select using (auth.uid() = user_id);

-- A message (or an edit of one) to people who don't follow its sender:
-- hidden for each of them whose filters it matches. An edit is checked again.
create or replace function public.words_hold_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    delete from public.message_word_holds where message_id = new.id;
  end if;
  if new.kind = 'system' or coalesce(btrim(new.body), '') = '' then return new; end if;
  insert into public.message_word_holds (message_id, user_id)
  select new.id, m.user_id
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
    and not exists (select 1 from public.follows f where f.follower_id = m.user_id and f.following_id = new.sender_id)
    and public.hidden_by_words(m.user_id, new.body, 'requests')
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.words_hold_message() from public, anon, authenticated;
-- Named to run before push_for_message (triggers run in name order).
drop trigger if exists hold_message_words on public.messages;
create trigger hold_message_words after insert on public.messages
  for each row execute function public.words_hold_message();
drop trigger if exists hold_message_words_edit on public.messages;
create trigger hold_message_words_edit after update of body on public.messages
  for each row when (old.body is distinct from new.body) execute function public.words_hold_message();

-- Migration 86's push_for_message word for word, with one line added: no
-- alert to someone a message is hidden for.
create or replace function public.push_for_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  sender_first text;
  words text;
  grp boolean;
  named text;
  mentioned text[];
  link text;
  r record;
  n int;
begin
  if new.kind = 'system' then return new; end if;
  link := '/messages/' || new.conversation_id;
  select coalesce(nullif(p.name, ''), p.handle), coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), p.handle)
    into who, sender_first
    from public.profiles p where p.id = new.sender_id;
  who := coalesce(who, 'New message');
  sender_first := coalesce(sender_first, 'Someone');
  n := case when jsonb_typeof(new.photos) = 'array' then jsonb_array_length(new.photos) else 0 end;
  words := case new.kind
    when 'post' then 'Sent a clip'
    when 'question' then 'Sent a thread'
    when 'profile' then 'Sent a profile'
    when 'court' then 'Sent a court' || coalesce(': ' || nullif(new.place->>'name', ''), '')
    when 'voice' then 'Sent a voice message'
    when 'hit-request' then 'Sent a hit'
    when 'photo' then case when n > 1 then 'Sent ' || n || ' photos' else 'Sent a photo' end
    else coalesce(nullif(new.body, ''), 'Sent a message') end;
  mentioned := array(
    select distinct lower(x.parts[1])
    from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as x(parts));
  select coalesce(c.is_group, false), nullif(btrim(c.title), '') into grp, named
    from public.conversations c where c.id = new.conversation_id;
  for r in
    select m.user_id
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    left join public.user_state s on s.user_id = m.user_id
    left join public.conversation_prefs cp on cp.user_id = m.user_id and cp.conversation_id = m.conversation_id
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
      and s.push_messages is not false
      and not public.is_blocked_between(m.user_id, new.sender_id)
      and (cp.muted_until is null or cp.muted_until <= now() or lower(p.handle) = any (mentioned))
      and not exists (select 1 from public.message_word_holds h where h.message_id = new.id and h.user_id = m.user_id)
  loop
    if not coalesce(grp, false) then
      perform public.send_push(r.user_id, who, words, link);
    elsif named is not null then
      perform public.send_push(r.user_id, who || ' in ' || named, words, link);
    else
      perform public.send_push(r.user_id, public.group_label(new.conversation_id, r.user_id), sender_first || ': ' || words, link);
    end if;
  end loop;
  return new;
end $$;

-- ------------------------------------------------- 7. severe words refused
-- The trigger is told which columns are people's words. On a new row every
-- one is checked; on an edit only the ones that changed (so an old row can
-- still be archived or deleted). CourtSide's own steps (nobody signed in)
-- are left alone.
create or replace function public.words_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i int;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_val jsonb;
  v_text text;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
  for i in 0 .. tg_nargs - 1 loop
    v_val := v_new -> tg_argv[i];
    if v_val is null or jsonb_typeof(v_val) = 'null' then continue; end if;
    if tg_op = 'UPDATE' and v_val is not distinct from (v_old -> tg_argv[i]) then continue; end if;
    v_text := case jsonb_typeof(v_val)
      when 'array' then (select string_agg(x, ' ') from jsonb_array_elements_text(v_val) x)
      when 'string' then v_val #>> '{}'
    end;
    if v_text is null or btrim(v_text) = '' then continue; end if;
    if (tg_argv[i] in ('name', 'title') and public.words_in_name(v_text))
       or public.words_found(v_text, 'severe') then
      raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.words_block() from public, anon, authenticated;

-- Profiles: the same, with the handle checked as a name too. A sign-up
-- (nobody signed in yet) is never refused: a severe handle becomes a plain
-- "player" one, a severe name "Player", a severe bio is left empty.
create or replace function public.words_block_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fresh text;
begin
  if auth.uid() is null then
    if tg_op <> 'INSERT' then return new; end if;
    if public.words_in_name(new.handle) then
      loop
        fresh := 'player' || lpad((floor(random() * 1000000))::int::text, 6, '0');
        exit when not exists (select 1 from public.profiles where handle = fresh);
      end loop;
      new.handle := fresh;
    end if;
    if public.words_in_name(new.name) then new.name := 'Player'; end if;
    if public.words_found(new.bio, 'severe') then new.bio := ''; end if;
    if public.words_found(new.location, 'severe') then new.location := ''; end if;
    return new;
  end if;
  if (tg_op = 'INSERT' or new.handle is distinct from old.handle) and public.words_in_name(new.handle) then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.name is distinct from old.name) and public.words_in_name(new.name) then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.bio is distinct from old.bio) and public.words_found(new.bio, 'severe') then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  if (tg_op = 'INSERT' or new.location is distinct from old.location) and public.words_found(new.location, 'severe') then
    raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
  end if;
  return new;
end $$;
revoke all on function public.words_block_profile() from public, anon, authenticated;
drop trigger if exists words_block on public.profiles;
create trigger words_block before insert or update on public.profiles
  for each row execute function public.words_block_profile();

-- Every other place people write (each only if it exists).
do $$
declare
  t record;
begin
  for t in select * from (values
      ('posts', array['body', 'tags', 'location']),
      ('stories', array['caption']),
      ('comments', array['body']),
      ('story_comments', array['body']),
      ('questions', array['title', 'body', 'tags']),
      ('answers', array['body']),
      ('coach_questions', array['title', 'body']),
      ('coach_replies', array['body']),
      ('conversations', array['title']),
      ('feed_groups', array['name', 'description']),
      ('polls', array['options']),
      ('hit_requests', array['note']),
      ('court_notes', array['note']),
      ('court_reviews', array['notes']),
      ('tips', array['body']),
      ('coach_reviews', array['body']),
      ('coach_services', array['title', 'description']),
      ('coaching_requests', array['question', 'response'])) as x (tbl, cols)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists words_block on public.%I', t.tbl);
      execute format('create trigger words_block before insert or update on public.%I for each row execute function public.words_block(%s)',
        t.tbl, (select string_agg(quote_literal(c), ', ') from unnest(t.cols) c
                where exists (select 1 from information_schema.columns ic
                              where ic.table_schema = 'public' and ic.table_name = t.tbl and ic.column_name = c)));
    end if;
  end loop;
end $$;
-- Messages: never an event line ("Mira added Dev").
drop trigger if exists words_block on public.messages;
create trigger words_block before insert or update on public.messages
  for each row when (new.kind <> 'system') execute function public.words_block('body');

-- ------------------------------------------------------------- 8. the words
-- Kept to words that are offensive whatever the sentence. Left out on
-- purpose, because tennis players say them: kill, shot, smash, murder,
-- destroy, choke, tank, beat, sick, nasty, filthy, balls, hooker, cock
-- (the wrist), ass on its own, suck, hell, damn, Dick's (the shop).
insert into public.word_list (term, tier, spaced, endings, in_names) values
  -- severe: slurs
  ('nigger', 'severe', true, true, true),
  ('nigga', 'severe', true, true, true),
  ('niggaz', 'severe', true, false, true),
  ('nigguh', 'severe', true, false, false),
  ('niggah', 'severe', true, false, false),
  ('niglet', 'severe', true, false, false),
  ('nignog', 'severe', false, false, false),
  ('nig nog', 'severe', false, false, false),
  ('sand nigger', 'severe', false, true, false),
  ('faggot', 'severe', true, true, true),
  ('faggit', 'severe', true, false, false),
  ('fagot', 'severe', true, false, false),
  ('fag', 'severe', true, false, false),
  ('fags', 'severe', true, false, false),
  ('faggy', 'severe', true, false, false),
  ('kike', 'severe', true, false, false),
  ('kikes', 'severe', true, false, false),
  ('kyke', 'severe', false, false, false),
  ('spics', 'severe', true, false, false),
  ('wetback', 'severe', true, true, true),
  ('beaner', 'severe', false, false, false),
  ('beaners', 'severe', false, false, false),
  ('gook', 'severe', true, false, false),
  ('gooks', 'severe', true, false, false),
  ('raghead', 'severe', true, true, true),
  ('towelhead', 'severe', true, true, true),
  ('camel jockey', 'severe', false, false, false),
  ('paki', 'severe', true, false, false),
  ('pakis', 'severe', true, false, false),
  ('porch monkey', 'severe', false, false, false),
  ('jungle bunny', 'severe', false, false, false),
  ('zipperhead', 'severe', false, true, false),
  -- severe: hate slogans
  ('heil hitler', 'severe', false, false, false),
  ('sieg heil', 'severe', false, false, false),
  ('gas the jews', 'severe', false, false, false),
  ('kill all jews', 'severe', false, false, false),
  ('kill all blacks', 'severe', false, false, false),
  ('kill all muslims', 'severe', false, false, false),
  ('kill all gays', 'severe', false, false, false),
  ('death to jews', 'severe', false, false, false),
  -- severe: sexual words about children
  ('child porn', 'severe', false, false, false),
  ('childporn', 'severe', false, false, true),
  ('kiddie porn', 'severe', false, false, false),
  ('kiddy porn', 'severe', false, false, false),
  ('jailbait', 'severe', false, false, true),
  ('lolicon', 'severe', false, false, true),
  ('shotacon', 'severe', false, false, false),
  ('preteen sex', 'severe', false, false, false),
  ('underage sex', 'severe', false, false, false),
  ('underage nudes', 'severe', false, false, false),
  ('teen nudes', 'severe', false, false, false),
  ('kid nudes', 'severe', false, false, false),
  ('send nudes', 'severe', false, false, false),
  ('send me nudes', 'severe', false, false, false),
  ('send me a nude', 'severe', false, false, false),
  ('nudes of you', 'severe', false, false, false),
  -- severe: threats and self-harm
  ('kys', 'severe', true, false, false),
  ('hope you die', 'severe', false, false, false),
  ('hope u die', 'severe', false, false, false),
  ('you should die', 'severe', false, false, false),
  ('u should die', 'severe', false, false, false),
  ('drink bleach', 'severe', false, false, false),
  ('slit your wrists', 'severe', false, false, false),
  ('slit your throat', 'severe', false, false, false),
  ('end your life', 'severe', false, false, false),
  ('shoot up the school', 'severe', false, false, false),
  ('shoot up your school', 'severe', false, false, false),
  ('hope you get raped', 'severe', false, false, false),
  -- offensive: swearing and insults
  ('fuck', 'offensive', true, true, false),
  ('fucking', 'offensive', true, false, false),
  ('fuckface', 'offensive', false, true, false),
  ('fuckhead', 'offensive', false, true, false),
  ('fuckwit', 'offensive', false, true, false),
  ('fucktard', 'offensive', false, true, false),
  ('fuk', 'offensive', false, true, false),
  ('fuq', 'offensive', false, false, false),
  ('fck', 'offensive', false, true, false),
  ('fcking', 'offensive', false, false, false),
  ('fking', 'offensive', false, false, false),
  ('fkin', 'offensive', false, false, false),
  ('fkn', 'offensive', false, false, false),
  ('phuck', 'offensive', false, true, false),
  ('fvck', 'offensive', false, true, false),
  ('motherfucker', 'offensive', false, true, false),
  ('motherfucking', 'offensive', false, false, false),
  ('mofo', 'offensive', false, false, false),
  ('stfu', 'offensive', false, false, false),
  ('gtfo', 'offensive', false, false, false),
  ('shit', 'offensive', true, true, false),
  ('shite', 'offensive', false, false, false),
  ('shithead', 'offensive', false, true, false),
  ('shitface', 'offensive', false, true, false),
  ('bullshit', 'offensive', false, true, false),
  ('horseshit', 'offensive', false, false, false),
  ('dipshit', 'offensive', false, true, false),
  ('piece of shit', 'offensive', false, false, false),
  ('eat shit', 'offensive', false, false, false),
  ('bitch', 'offensive', true, true, false),
  ('biatch', 'offensive', false, false, false),
  ('beyotch', 'offensive', false, false, false),
  ('sonofabitch', 'offensive', false, false, false),
  ('asshole', 'offensive', true, true, false),
  ('arsehole', 'offensive', false, true, false),
  ('asshat', 'offensive', false, true, false),
  ('assclown', 'offensive', false, true, false),
  ('dumbass', 'offensive', false, true, false),
  ('jackass', 'offensive', false, true, false),
  ('fatass', 'offensive', false, true, false),
  ('kiss my ass', 'offensive', false, false, false),
  ('ass hole', 'offensive', false, true, false),
  ('cunt', 'offensive', true, true, false),
  ('twat', 'offensive', false, true, false),
  ('wank', 'offensive', false, true, false),
  ('wanker', 'offensive', false, true, false),
  ('prick', 'offensive', false, false, false),
  ('pricks', 'offensive', false, false, false),
  ('dick', 'offensive', false, false, false),
  ('dickhead', 'offensive', false, true, false),
  ('dickface', 'offensive', false, true, false),
  ('douche', 'offensive', false, true, false),
  ('douchebag', 'offensive', false, true, false),
  ('bastard', 'offensive', false, true, false),
  ('cocksucker', 'offensive', false, true, false),
  ('cock sucker', 'offensive', false, true, false),
  ('suck my dick', 'offensive', false, false, false),
  ('suck my cock', 'offensive', false, false, false),
  ('suck my balls', 'offensive', false, false, false),
  ('slut', 'offensive', false, true, false),
  ('whore', 'offensive', false, true, false),
  ('hoe', 'offensive', false, true, false),
  ('skank', 'offensive', false, true, false),
  ('thot', 'offensive', false, true, false),
  ('pussy', 'offensive', false, false, false),
  ('pussies', 'offensive', false, false, false),
  ('spaz', 'offensive', false, false, false),
  ('mongoloid', 'offensive', false, true, false),
  ('coon', 'offensive', false, false, false),
  ('coons', 'offensive', false, false, false),
  ('dyke', 'offensive', false, true, false),
  ('tranny', 'offensive', false, false, false),
  ('trannies', 'offensive', false, false, false),
  ('shemale', 'offensive', false, true, false),
  ('homos', 'offensive', false, false, false),
  ('paedo', 'offensive', false, true, false),
  ('pedophile', 'offensive', false, true, false),
  ('paedophile', 'offensive', false, true, false),
  ('nonce', 'offensive', false, true, false),
  ('rape', 'offensive', false, true, false),
  ('raping', 'offensive', false, false, false),
  ('rapist', 'offensive', false, true, false),
  -- offensive: explicit sexual words
  ('porno', 'offensive', false, false, false),
  ('pornhub', 'offensive', false, false, false),
  ('onlyfans', 'offensive', false, false, false),
  ('nudes', 'offensive', false, false, false),
  ('nude pics', 'offensive', false, false, false),
  ('blowjob', 'offensive', false, true, false),
  ('blow job', 'offensive', false, true, false),
  ('handjob', 'offensive', false, true, false),
  ('hand job', 'offensive', false, true, false),
  ('rimjob', 'offensive', false, true, false),
  ('dildo', 'offensive', false, true, false),
  ('cumshot', 'offensive', false, true, false),
  ('creampie', 'offensive', false, true, false),
  ('deepthroat', 'offensive', false, true, false),
  ('gangbang', 'offensive', false, true, false),
  ('orgasm', 'offensive', false, true, false),
  ('horny', 'offensive', false, false, false),
  ('boobs', 'offensive', false, false, false),
  ('boobies', 'offensive', false, false, false),
  ('titties', 'offensive', false, false, false),
  ('tits', 'offensive', false, false, false),
  ('jerk off', 'offensive', false, false, false),
  ('jerking off', 'offensive', false, false, false),
  ('jack off', 'offensive', false, false, false),
  ('masturbate', 'offensive', false, true, false),
  ('masturbating', 'offensive', false, false, false),
  ('masturbation', 'offensive', false, false, false),
  ('sexting', 'offensive', false, false, false),
  ('dick pic', 'offensive', false, true, false),
  ('dickpic', 'offensive', false, true, false),
  ('milf', 'offensive', false, true, false),
  -- offensive: harassment
  ('nobody likes you', 'offensive', false, false, false),
  ('no one likes you', 'offensive', false, false, false),
  ('everyone hates you', 'offensive', false, false, false),
  ('everybody hates you', 'offensive', false, false, false),
  ('you are worthless', 'offensive', false, false, false),
  ('youre worthless', 'offensive', false, false, false),
  ('ur worthless', 'offensive', false, false, false),
  ('go to hell', 'offensive', false, false, false),
  ('die in a hole', 'offensive', false, false, false),
  ('fat cow', 'offensive', false, false, false),
  ('fat pig', 'offensive', false, false, false),
  ('ugly bitch', 'offensive', false, false, false),
  ('i know where you live', 'offensive', false, false, false),
  ('i know where u live', 'offensive', false, false, false),
  ('🖕', 'offensive', false, false, false),
  ('🍆💦', 'offensive', false, false, false),
  -- teen: hidden from under-18 accounts only
  ('how old are you', 'teen', false, false, false),
  ('how old r u', 'teen', false, false, false),
  ('how old are u', 'teen', false, false, false),
  ('what age are you', 'teen', false, false, false),
  ('send pics', 'teen', false, false, false),
  ('send a pic', 'teen', false, false, false),
  ('send me a pic', 'teen', false, false, false),
  ('send me pics', 'teen', false, false, false),
  ('send me a picture', 'teen', false, false, false),
  ('are you alone', 'teen', false, false, false),
  ('are u alone', 'teen', false, false, false),
  ('dont tell your parents', 'teen', false, false, false),
  ('dont tell your mom', 'teen', false, false, false),
  ('dont tell your dad', 'teen', false, false, false),
  ('our little secret', 'teen', false, false, false),
  ('whats your snap', 'teen', false, false, false),
  ('add me on snap', 'teen', false, false, false),
  ('snap me', 'teen', false, false, false),
  ('sexy', 'teen', false, false, false),
  ('have sex', 'teen', false, false, false),
  ('sex chat', 'teen', false, false, false),
  ('hot body', 'teen', false, false, false),
  ('youre hot', 'teen', false, false, false),
  ('ur hot', 'teen', false, false, false),
  ('nude', 'teen', false, false, false),
  ('naked', 'teen', false, false, false),
  ('hookup', 'teen', false, true, false),
  ('hook up', 'teen', false, false, false),
  ('dtf', 'teen', false, false, false),
  ('ass', 'teen', false, false, false),
  ('wtf', 'teen', false, false, false)
on conflict (term) do update set
  tier = excluded.tier, spaced = excluded.spaced, endings = excluded.endings, in_names = excluded.in_names,
  unless_before = '{}', unless_after = '{}', pattern = null;

-- Entries with exceptions.
insert into public.word_list (term, tier, spaced, endings, in_names, unless_before, unless_after) values
  -- "a chink in his armour", "Spic and Span", "homo sapiens", "tennis porn" (a lovely rally)
  ('chink', 'severe', true, false, false, '{}', array['in', 'of']),
  ('chinks', 'severe', true, false, false, '{}', array['in', 'of']),
  ('chinky', 'severe', false, false, false, '{}', '{}'),
  ('spic', 'severe', true, false, false, '{}', array['and span', 'n span']),
  ('homo', 'offensive', false, false, false, '{}', array['sapiens', 'erectus', 'habilis']),
  -- French "en retard" is "late"
  ('retard', 'offensive', false, true, false, array['en', 'du', 'de', 'un', 'le', 'sans'], '{}'),
  ('porn', 'offensive', false, true, false,
    array['tennis', 'food', 'rally', 'shot', 'forehand', 'backhand', 'serve', 'slice', 'footwork', 'court', 'gear', 'racket', 'racquet', 'shoe', 'grip'], '{}'),
  -- "kill yourself", but not "don't kill yourself in this heat" or "you'll kill yourself training like that"
  ('kill yourself', 'severe', false, false, false,
    array['dont', 'do not', 'didnt', 'never', 'not', 'not to', 'wont', 'youll', 'you will', 'youd', 'you would', 'you could', 'you might',
          'almost', 'nearly', 'could', 'might', 'would', 'gonna', 'going to', 'itll', 'it will', 'thatll', 'that will', 'will'], '{}'),
  ('kill urself', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}'),
  ('kill your self', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}'),
  ('hang yourself', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}'),
  ('neck yourself', 'severe', false, false, false, '{}', '{}'),
  ('go die', 'severe', false, false, false, '{}', array['hard']),
  ('end yourself', 'severe', false, false, false, '{}', '{}')
on conflict (term) do update set
  tier = excluded.tier, spaced = excluded.spaced, endings = excluded.endings, in_names = excluded.in_names,
  unless_before = excluded.unless_before, unless_after = excluded.unless_after, pattern = null;

-- Threats, written as patterns ("I'll kill you", "im gonna fucking stab u",
-- "ima shoot you"). A kill or murder about a match ("I'll kill you on
-- court tomorrow", "in straight sets", "6-0") is tennis talk and not a
-- threat; "I'll shoot you a text" isn't either. A rape threat never has an
-- exception.
insert into public.word_list (term, tier, pattern) values
  ('threat: i will kill you', 'severe',
   '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|i[^a-z0-9]+shall|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna|about[^a-z0-9]+to|finna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to))(?:[^a-z0-9]+(?:fucking|fuckin|literally|actually|really|seriously|just))?[^a-z0-9]+(?:k+i+l+l+|m+u+r+d+e+r+|s+t+a+b+|s+t+r+a+n+g+l+e+|b+e+h+e+a+d+)[^a-z0-9]+(?:you|u|ya|yall|you[^a-z0-9]+all|your[^a-z0-9]+(?:family|mom|mum|kids|whole[^a-z0-9]+family))(?![a-z0-9])(?![^a-z0-9]+(?:on[^a-z0-9]+(?:the[^a-z0-9]+)?(?:court|courts|clay|grass|hard[^a-z0-9]+court)|at[^a-z0-9]+(?:practice|tennis|the[^a-z0-9]+club|the[^a-z0-9]+courts?)|in[^a-z0-9]+(?:practice|tennis|doubles|singles|straight[^a-z0-9]+sets|a[^a-z0-9]+match|our[^a-z0-9]+match|the[^a-z0-9]+(?:final|semis|semi|match|rematch|tiebreak|tiebreaker|breaker|next[^a-z0-9]+set|third|first[^a-z0-9]+set|second[^a-z0-9]+set))|next[^a-z0-9]+(?:set|match|week|time[^a-z0-9]+we[^a-z0-9]+play)|(?:6|six)[^a-z0-9]*(?:0|o|love)|(?:on|at)[^a-z0-9]+(?:mon|tues|wednes|thurs|fri|satur|sun)day))'),
  ('threat: i will shoot you', 'severe',
   '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|i[^a-z0-9]+shall|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna|about[^a-z0-9]+to|finna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to))(?:[^a-z0-9]+(?:fucking|fuckin|literally|actually|really|seriously|just))?[^a-z0-9]+s+h+o+o+t+[^a-z0-9]+(?:you|u|ya|yall|you[^a-z0-9]+all|your[^a-z0-9]+(?:family|mom|mum|kids))(?![a-z0-9])(?![^a-z0-9]+(?:a|an|the|some|my|this|that|these|those|it|over|guys|both|all|back|down|another|one|quick|text|message|dm|email|note|line|pic|pics|picture|video|link|details|info|invite|update|call|ball|serve|lob)(?![a-z0-9]))'),
  ('threat: i will rape you', 'severe',
   '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to)|gonna|will|wanna)[^a-z0-9]+r+a+p+e+[^a-z0-9]+(?:you|u|ya|her|him|them)(?![a-z0-9])'),
  ('threat: hunt you down', 'severe',
   '(?<![a-z0-9])(?:ill|i[^a-z0-9]+will|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma)[^a-z0-9]+(?:hunt|track)[^a-z0-9]+(?:you|u)[^a-z0-9]+down(?![a-z0-9])')
on conflict (term) do update set tier = excluded.tier, pattern = excluded.pattern,
  spaced = false, endings = false, in_names = false, unless_before = '{}', unless_after = '{}';

-- The trigger above made the patterns already; once more in case nothing changed.
select public.rebuild_word_patterns();

-- ------------------------------------------------------------- 9. who may call
revoke all on function public.words_normal(text, boolean) from public, anon, authenticated;
revoke all on function public.words_regex(text, boolean, text) from public, anon, authenticated;
revoke all on function public.word_entry_regex(public.word_list) from public, anon, authenticated;
revoke all on function public.word_name_regex(text) from public, anon, authenticated;
revoke all on function public.rebuild_word_patterns() from public, anon, authenticated;
revoke all on function public.word_list_changed() from public, anon, authenticated;
revoke all on function public.words_found_in(text, text) from public, anon, authenticated;
revoke all on function public.words_found(text, text) from public, anon, authenticated;
revoke all on function public.words_in_name(text) from public, anon, authenticated;
revoke all on function public.custom_words_regex(text[]) from public, anon, authenticated;
revoke all on function public.hidden_by_words(uuid, text, text) from public, anon, authenticated;
revoke all on function public.words_owner_of(text, uuid) from public, anon, authenticated;
-- word_filters_ok is the table's own check; only set_hidden_words writes the row.
revoke all on function public.word_filters_ok(text[]) from public, anon, authenticated;
revoke all on function public.hidden_words() from public, anon;
revoke all on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) from public, anon;
revoke all on function public.unhide_words(text, uuid) from public, anon;
grant execute on function public.hidden_words() to authenticated;
grant execute on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) to authenticated;
grant execute on function public.unhide_words(text, uuid) to authenticated;

commit;

-- ============================================================ checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The list is there (expect three rows: severe, offensive, teen, with a count each):
-- select tier, count(*) from public.word_list group by tier order by tier;
--
-- (b) The matching (expect true, false, false, true):
-- select public.words_found('you f4gg0t', 'severe'), public.words_found('what a kill shot', 'offensive'),
--        public.words_found('Scunthorpe class assassin', 'offensive'), public.words_found('fuuuuck that', 'offensive');
--
-- (c) The new reading rules (expect 4 rows):
-- select tablename from pg_policies where policyname = 'hidden words stay between two' order by 1;
