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
--      severe     slurs, sexual words about children, telling someone to
--                 kill themselves ("kill yourself", "kys", "hope you die"),
--                 and threats to rape, to shoot someone or a school, or to
--                 hunt someone down. These are refused wherever
--                 anyone writes: posts and captions, Instants, comments,
--                 threads and replies, questions to coaches (paid ones too)
--                 and coaches' replies and answers, coach pages (headline,
--                 credentials, results), chat messages, names, handles and
--                 bios, group and group-chat names, polls, hit notes, court
--                 notes and reviews, tips and coach reviews. Edits too. The
--                 app says "This includes words that break CourtSide's rules."
--      offensive  the severe ones plus insults, swearing aimed at someone
--                 ("fuck you", "you're an idiot"), explicit sexual words,
--                 harassment ("nobody likes you") and "I'm gonna kill you"
--                 (or murder, stab, strangle, behead you), which tennis
--                 players say to each other all the time ("Rematch Saturday?
--                 I'm gonna kill you lol"). Hidden, never refused (Oct 5,
--                 owner: "many times ppl can arrange stuff. Trust me"), the
--                 way Instagram does it: a comment or message from someone
--                 you follow always shows as normal.
--      teen       more that are only hidden for under-18 accounts: plain
--                 swearing that isn't aimed at anyone ("holy shit what a
--                 shot"), "how old are you", "send pics", "sexy".
--    Friends trash-talk (Oct 5, owner: "Trust me on this"): the offensive
--    and teen words and your own words never hide anything written by
--    someone you follow, on your posts, Instants, threads and questions or
--    in your chats, whatever your age (a teen chose to follow them). Only
--    the severe words are refused for everyone, friends too.
--    Matching ignores capitals, accents, repeated letters ("fuuuck"), the
--    usual swaps (0 for o, 1 for i, 3 for e, 4 for a, 5 or $ for s, @ for
--    a), look-alike letters from other alphabets and small capitals,
--    invisible characters, dots or spaces between the letters ("n i g g e r")
--    and, for the severe ones, a mark or two inside a word ("nig.ger"). It
--    only matches whole words, so "class", "assassin", "Scunthorpe",
--    "grape", "therapist", "snigger" and "rapper" never match, and normal
--    tennis talk ("kill shot", "killed it", "smash", "he shot 40%", "beat
--    him 6-0", "murdered that forehand", "choke", "tank", "balls", "I'll kill
--    you tomorrow", "I'll shoot you from the side") never does either.
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
--    thread, or a coach's reply on your question, from someone you don't
--    follow, that matches your filters, is hidden: only the person who
--    wrote it (to whom it looks exactly as normal: nothing on it says it is
--    hidden) and you can see it, and so are the replies under it. You find
--    it under "Hidden comments" at the end of the comments and can Unhide
--    it. Nobody else sees it, it is not counted for them (link previews
--    too), and nobody is told about it (no notification, no phone alert,
--    then or after you unhide it). Nothing is deleted. From someone you
--    follow it is never hidden, the same as their messages. Like messages,
--    this is decided when it is written or edited.
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
--   comment_word_holds (new): which comment, Instant comment, thread reply
--     or coach reply is hidden, and for whose post, thread or question (never
--     one by someone that owner follows); only that owner reads it. Nothing
--     is added to the comments themselves, so whoever wrote one cannot tell
--     it was hidden (or learn your own words).
--   private.words_hidden_here, private.words_quiet (new): the two helpers
--     the reading rules and the notification triggers ask; the app cannot
--     call them (the "private" area is closed to it, see migration 109).
--   comments, story_comments, answers, coach_replies: a narrowing reading
--     rule beside each table's own rule (that rule is untouched).
--   notify_comment, notify_hit_comment, notify_answer, notify_coach_reply:
--     the triggers now skip a hidden one, and a reply under a hidden one
--     (the functions are untouched). Stops if these triggers have changed.
--   message_word_holds (new): which message is hidden for whom; you read
--     only yours.
--   push_for_message (86): word for word, plus one line: no alert for a
--     message hidden for that person.
--   share_preview (108's version): word for word, except its comment and
--     reply counts leave out hidden ones. Stops if it has changed.
--   handle_status (116's version): word for word, plus one line: a handle
--     with severe words says 'words', so the app says so before you save it.
--   words_block / words_block_profile (new triggers): the severe refusal,
--     run only when the words themselves change. A sign-up whose handle or
--     name is severe gets a plain one instead of failing.
--   hidden_words(), set_hidden_words(...), unhide_words(kind, id),
--     words_refused(texts): what the app calls. Nothing is callable signed
--     out.
--
-- Needs 54, 56, 86, 108, 109 and 116 (all live). Stops without changing anything
-- if push_for_message, share_preview, handle_status or the four notification
-- triggers have changed since they were last checked (Oct 5).

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  now_is text;
  t record;
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
     or to_regprocedure('public.share_preview(text, text)') is null
     or to_regprocedure('public.handle_status(text)') is null
     or to_regprocedure('public.campaign_label(text)') is null
     or to_regnamespace('private') is null
     or to_regclass('public.conversation_prefs') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'removed_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'story_comments' and column_name = 'parent_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'answers' and column_name = 'parent_answer_id') then
    raise exception 'Migration 117 stopped before changing anything: migrations 54, 56, 86, 108, 109 and 116 have to run first.';
  end if;
  -- Each function this file replaces word for word (plus its one change):
  -- as it was on Oct 5, or as this file leaves it.
  for t in select * from (values
      ('push_for_message', '5d33fa08c2afa64af26a29f8bc084d1a', 'e241c5e1c8f5dcbfe138dc08f37a17f8', 'migration 86'),
      ('share_preview', '3ba2420e7575cb9989382040f4c67c3f', '766840b69cde1c289d5f906ad2d9dc6b', 'migration 108'),
      ('handle_status', 'dc5972622a19912d6d16d066bce59e0e', '708c488d09e8ee39d6e5596677a664ca', 'migration 116')) as x (fn, was, now, since)
  loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = t.fn;
    if now_is is null or now_is not in (t.was, t.now) then
      raise exception 'Migration 117 stopped before changing anything: % is not the version % left. Bring this file up to date with whatever changed it.', t.fn, t.since;
    end if;
  end loop;
  -- The four notification triggers this file puts a condition on: as they
  -- were on Oct 5, or as this file leaves them.
  for t in select * from (values
      ('comments', 'notify_comment',
       'CREATE TRIGGER notify_comment AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION notify_comment()',
       'CREATE TRIGGER notify_comment AFTER INSERT ON comments FOR EACH ROW WHEN ((NOT private.words_quiet(''comment''::text, new.id, new.parent_id))) EXECUTE FUNCTION notify_comment()'),
      ('story_comments', 'notify_hit_comment',
       'CREATE TRIGGER notify_hit_comment AFTER INSERT ON story_comments FOR EACH ROW EXECUTE FUNCTION notify_hit_comment()',
       'CREATE TRIGGER notify_hit_comment AFTER INSERT ON story_comments FOR EACH ROW WHEN ((NOT private.words_quiet(''hit-comment''::text, new.id, new.parent_id))) EXECUTE FUNCTION notify_hit_comment()'),
      ('answers', 'notify_answer',
       'CREATE TRIGGER notify_answer AFTER INSERT ON answers FOR EACH ROW EXECUTE FUNCTION notify_answer()',
       'CREATE TRIGGER notify_answer AFTER INSERT ON answers FOR EACH ROW WHEN ((NOT private.words_quiet(''answer''::text, new.id, new.parent_answer_id))) EXECUTE FUNCTION notify_answer()'),
      ('coach_replies', 'notify_coach_reply',
       'CREATE TRIGGER notify_coach_reply AFTER INSERT ON coach_replies FOR EACH ROW EXECUTE FUNCTION notify_coach_reply()',
       'CREATE TRIGGER notify_coach_reply AFTER INSERT ON coach_replies FOR EACH ROW WHEN ((NOT private.words_quiet(''coach-reply''::text, new.id, NULL::uuid))) EXECUTE FUNCTION notify_coach_reply()')) as x (tbl, name, was, now)
  loop
    select replace(pg_get_triggerdef(tg.oid), 'public.', '') into now_is from pg_trigger tg
      where tg.tgrelid = ('public.' || t.tbl)::regclass and tg.tgname = t.name and not tg.tgisinternal;
    if now_is is null or now_is not in (t.was, t.now) then
      raise exception 'Migration 117 stopped before changing anything: the % trigger on % is not the one it was on Oct 5. Bring this file up to date with whatever changed it.', t.name, t.tbl;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 1. the list
create table if not exists public.word_list (
  -- The word or phrase as people write it, in small letters (or, for the
  -- few written as a pattern below, a short label).
  term text primary key,
  tier text not null check (tier in ('severe', 'offensive', 'teen')),
  -- Also caught with dots, dashes or spaces between its letters ("f.u.c.k").
  spaced boolean not null default false,
  -- Also caught with the usual endings (s, ed, er, ing, in, y…; and z, az for a severe one).
  endings boolean not null default false,
  -- Also caught inside a handle, name or group name written as one word ("xxniggerxx").
  in_names boolean not null default false,
  -- Not when straight after one of these ("don't kill yourself in this heat").
  unless_before text[] not null default '{}',
  -- Not when straight before one of these ("a chink in his armour").
  unless_after text[] not null default '{}',
  -- A hand-written pattern instead of the term (the threats), over the same tidied text.
  pattern text,
  -- For in_names: a hand-written pattern for a name written as one word
  -- ("snigger" and "niggardly" are words), over its letters only.
  name_pattern text
);
alter table public.word_list add column if not exists name_pattern text;
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
-- Small letters, accents off, invisible characters out (zero-width spaces
-- and joiners, direction marks, fillers, variation selectors, tag
-- characters), look-alike letters from other alphabets and small capitals
-- made plain, apostrophes out ("i'll" is "ill"), an @ in front of a handle
-- dropped, "!" or "|" between letters read as i, and in any word with a
-- letter in it 0 1 3 4 5 7 9 @ $ read as o i e a s t g a s. A number on its
-- own ("455 serves", "6-0", "40%") stays a number. With p_mentions false an
-- @ in front of a word is read as an a too: text with an @ in it is looked
-- at both ways ("@sshole", "@lex").
create or replace function public.words_normal(t text, p_mentions boolean default true)
returns text language plpgsql immutable set search_path = public as $$
declare
  s text;
begin
  if t is null or t = '' then return ''; end if;
  s := normalize(t, NFKD);
  s := regexp_replace(s, '[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯⠀ㅤ︀-️﻿ﾠ\U0001d173-\U0001d17a\U000e0000-\U000e007f\U000e0100-\U000e01ef]', '', 'g');
  s := lower(s);
  s := regexp_replace(s, '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g');
  s := replace(replace(replace(s, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe');
  -- Cyrillic and Greek letters that look like plain ones, small capitals and a few others.
  s := translate(s, 'аеорсухіјѕԁкмтнвαειονρτυκøłđıɡɢɴɪᴇʀᴀʙᴄᴅꜰʜᴊᴋʟᴍᴏᴘꞯꜱᴛᴜᴠᴡʏᴢηɑɩһԛԝүϲ',
                    'aeopcyxijsdkmthbaeiovptukoldiggnierabcdfhjklmopqstuvwyznaihqwyc');
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

-- A list entry as its pattern, with its exceptions around it. A severe one
-- with endings also takes a z or az ("niggerz").
create or replace function public.word_entry_regex(w public.word_list)
returns text language plpgsql immutable set search_path = public as $$
declare
  rx text;
  around text;
begin
  if w.pattern is not null then return w.pattern; end if;
  rx := public.words_regex(w.term, w.spaced, case when w.endings then
    '(?:s|es|d|ed|r|er|rs|ers|ing|in|y|ie|ies' || case when w.tier = 'severe' then '|z|az' else '' end || ')?' end);
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
  select 'names', 0, string_agg(coalesce(w.name_pattern, public.word_name_regex(w.term)), '|' order by w.term)
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

-- Whether some words have one from the list at that level. The severe
-- ones (which every level includes) are also looked for with a mark or two
-- inside a word taken out ("nig.ger", "fag-got", "@nig_ger"), as nobody
-- writes a slur that way by accident.
create or replace function public.words_found(body text, p_level text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  if coalesce(body, '') = '' then return false; end if;
  v := public.words_normal(body);
  if public.words_found_in(v, p_level) then return true; end if;
  if strpos(body, '@') > 0 and public.words_found_in(public.words_normal(body, false), p_level) then return true; end if;
  if p_level in ('severe', 'offensive', 'teen') and v ~ '[a-z][^a-z0-9[:space:]]{1,3}[a-z]'
     and public.words_found_in(regexp_replace(v, '([a-z])[^a-z0-9[:space:]]{1,3}(?=[a-z])', '\1', 'g'), 'severe') then
    return true;
  end if;
  return false;
end $$;

-- A handle, name or group name: severe words as words, and the few written
-- together in one go ("bignigger99"), looked for one word at a time (so
-- "Sweet Backhand" or "LOL iconic" never run together into anything).
create or replace function public.words_in_name(body text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  piece text;
begin
  if coalesce(btrim(body), '') = '' then return false; end if;
  if public.words_found(body, 'severe') then return true; end if;
  for piece in select regexp_replace(x, '[^a-z]', '', 'g') from regexp_split_to_table(public.words_normal(body), '\s+') as x loop
    if piece <> '' and exists (select 1 from public.word_patterns p where p.tier = 'names' and piece ~ p.pattern) then
      return true;
    end if;
  end loop;
  return false;
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
-- Only asked about words by someone p_owner doesn't follow (words_hide).
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
-- Which comment (kind 'comment'), Instant comment ('hit-comment'), thread
-- reply ('answer') or coach reply ('coach-reply') is hidden, on whose post,
-- Instant, thread or question, and who wrote it. Only that owner reads it.
-- Nothing goes on the comment itself: its writer reads their own row (and
-- hears it live), and a mark there would tell them it was hidden, and so
-- which words the owner hides.
create table if not exists public.comment_word_holds (
  kind text not null check (kind in ('comment', 'hit-comment', 'answer', 'coach-reply')),
  item_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  writer_id uuid not null references public.profiles (id) on delete cascade,
  held_at timestamptz not null default now(),
  primary key (kind, item_id)
);
create index if not exists comment_word_holds_owner_idx on public.comment_word_holds (owner_id, held_at desc);
alter table public.comment_word_holds enable row level security;
revoke all on public.comment_word_holds from public, anon, authenticated;
grant select on public.comment_word_holds to authenticated;
drop policy if exists "hidden on what is yours" on public.comment_word_holds;
create policy "hidden on what is yours" on public.comment_word_holds for select using (auth.uid() = owner_id);

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

-- On a new one: hidden when it matches its owner's filters (never the
-- owner's own words, and never words by someone the owner follows: friends
-- trash-talk, so the same rule as messages, whatever the owner's age). On
-- an edit of the words: checked again (hidden, or shown again). Only
-- unhide_words below takes a hold off otherwise. The same row sent twice
-- (the app's retry, an upsert) is left as it is.
create or replace function public.words_hide()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_owner uuid;
  v_writer uuid;
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  if tg_table_name = 'comments' then
    if tg_op = 'INSERT' and exists (select 1 from public.comments where id = new.id) then return new; end if;
    v_kind := 'comment'; v_owner := public.words_owner_of('comments', new.post_id); v_writer := new.author_id;
  elsif tg_table_name = 'story_comments' then
    if tg_op = 'INSERT' and exists (select 1 from public.story_comments where id = new.id) then return new; end if;
    v_kind := 'hit-comment'; v_owner := public.words_owner_of('story_comments', new.story_id); v_writer := new.author_id;
  elsif tg_table_name = 'answers' then
    if tg_op = 'INSERT' and exists (select 1 from public.answers where id = new.id) then return new; end if;
    v_kind := 'answer'; v_owner := public.words_owner_of('answers', new.question_id); v_writer := new.author_id;
  else
    if tg_op = 'INSERT' and exists (select 1 from public.coach_replies where id = new.id) then return new; end if;
    v_kind := 'coach-reply'; v_owner := public.words_owner_of('coach_replies', new.question_id); v_writer := new.coach_user_id;
  end if;
  if v_owner is not null and v_writer is not null and v_writer is distinct from v_owner
     and not exists (select 1 from public.follows fo where fo.follower_id = v_owner and fo.following_id = v_writer)
     and public.hidden_by_words(v_owner, new.body, 'comments') then
    insert into public.comment_word_holds (kind, item_id, owner_id, writer_id)
    values (v_kind, new.id, v_owner, v_writer)
    on conflict (kind, item_id) do nothing;
  elsif tg_op = 'UPDATE' then
    delete from public.comment_word_holds where kind = v_kind and item_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.words_hide() from public, anon, authenticated;

-- A comment gone for good takes its hold with it.
create or replace function public.words_unhold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.comment_word_holds
  where item_id = old.id
    and kind = case tg_table_name when 'comments' then 'comment' when 'story_comments' then 'hit-comment'
                                  when 'answers' then 'answer' else 'coach-reply' end;
  return null;
end $$;
revoke all on function public.words_unhold() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['comments', 'story_comments', 'answers', 'coach_replies'] loop
    execute format('drop trigger if exists words_hide on public.%I', t);
    execute format('create trigger words_hide before insert or update of body on public.%I for each row execute function public.words_hide()', t);
    execute format('drop trigger if exists words_unhold on public.%I', t);
    execute format('create trigger words_unhold after delete on public.%I for each row execute function public.words_unhold()', t);
  end loop;
end $$;

-- Whether this one is hidden from whoever is reading, or sits under one
-- that is (a reply to a hidden comment, `p_parent`). Hidden from everyone
-- but its writer, the owner of what it is on, and admins. Asked by the
-- reading rules below; the app cannot call it (see 109's note on "private").
-- Signed out, a hidden one is hidden.
create or replace function private.words_hidden_here(p_kind text, p_id uuid, p_parent uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h record;
begin
  for h in
    select owner_id, writer_id from public.comment_word_holds
    where kind = p_kind and item_id in (p_id, p_parent)
  loop
    if (me is null or (me is distinct from h.owner_id and me is distinct from h.writer_id)) and not public.is_admin() then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Whether a new one is hidden, or written under one that is: then nobody is
-- told about it. Asked by the notification triggers' condition, just after
-- the row is written, so it reads afresh (volatile) to see the hold made a
-- moment before. The app cannot call it either.
create or replace function private.words_quiet(p_kind text, p_id uuid, p_parent uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  return exists (select 1 from public.comment_word_holds where kind = p_kind and item_id in (p_id, p_parent));
end $$;

revoke all on function private.words_hidden_here(text, uuid, uuid) from public;
revoke all on function private.words_quiet(text, uuid, uuid) from public;
-- A reading rule or a trigger's condition runs as whoever is reading or
-- writing, so they need the right to run these (never to name them: the
-- app's gateway does not open "private").
grant execute on function private.words_hidden_here(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.words_quiet(text, uuid, uuid) to authenticated, service_role;

-- A narrowing rule beside each table's own reading rule.
drop policy if exists "hidden words stay between two" on public.comments;
create policy "hidden words stay between two" on public.comments as restrictive for select to anon, authenticated
  using (not private.words_hidden_here('comment', id, parent_id));
drop policy if exists "hidden words stay between two" on public.story_comments;
create policy "hidden words stay between two" on public.story_comments as restrictive for select to anon, authenticated
  using (not private.words_hidden_here('hit-comment', id, parent_id));
drop policy if exists "hidden words stay between two" on public.answers;
create policy "hidden words stay between two" on public.answers as restrictive for select to anon, authenticated
  using (not private.words_hidden_here('answer', id, parent_answer_id));
drop policy if exists "hidden words stay between two" on public.coach_replies;
create policy "hidden words stay between two" on public.coach_replies as restrictive for select to anon, authenticated
  using (not private.words_hidden_here('coach-reply', id, null));

-- Nobody is told about a hidden one, or a reply under one: the notification
-- triggers skip them. (Their functions are untouched; only when they run
-- changes. Section 0 stops if these triggers changed since Oct 5.)
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row when (not private.words_quiet('comment', new.id, new.parent_id)) execute function public.notify_comment();
drop trigger if exists notify_hit_comment on public.story_comments;
create trigger notify_hit_comment after insert on public.story_comments
  for each row when (not private.words_quiet('hit-comment', new.id, new.parent_id)) execute function public.notify_hit_comment();
drop trigger if exists notify_answer on public.answers;
create trigger notify_answer after insert on public.answers
  for each row when (not private.words_quiet('answer', new.id, new.parent_answer_id)) execute function public.notify_answer();
drop trigger if exists notify_coach_reply on public.coach_replies;
create trigger notify_coach_reply after insert on public.coach_replies
  for each row when (not private.words_quiet('coach-reply', new.id, null)) execute function public.notify_coach_reply();

-- Unhide: only the owner of what it is on. Kinds as the take-down tool
-- names them: comment, hit-comment, answer, coach-reply. Returns 'done', or
-- 'not_hidden'. Nobody is told, then or later.
create or replace function public.unhide_words(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_owner uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_kind = 'comment' then
    select public.words_owner_of('comments', c.post_id) into v_owner from public.comments c where c.id = p_id;
  elsif p_kind = 'hit-comment' then
    select public.words_owner_of('story_comments', c.story_id) into v_owner from public.story_comments c where c.id = p_id;
  elsif p_kind = 'answer' then
    select public.words_owner_of('answers', a.question_id) into v_owner from public.answers a where a.id = p_id;
  elsif p_kind = 'coach-reply' then
    select public.words_owner_of('coach_replies', r.question_id) into v_owner from public.coach_replies r where r.id = p_id;
  else
    raise exception 'unknown kind';
  end if;
  if v_owner is distinct from me then raise exception 'not allowed'; end if;
  delete from public.comment_word_holds where kind = p_kind and item_id = p_id and owner_id = me;
  return case when found then 'done' else 'not_hidden' end;
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

-- Someone's own words (as custom_words_regex makes them) in some tidied
-- words: `v` as written, `v_at` with an @ read as an a (null: no @ in it).
create or replace function public.custom_words_hit(p_words text[], v text, v_at text)
returns boolean language plpgsql stable set search_path = public as $$
declare
  rx text;
begin
  if coalesce(cardinality(p_words), 0) = 0 then return false; end if;
  rx := public.custom_words_regex(p_words);
  return rx is not null and (v ~ rx or (v_at is not null and v_at ~ rx));
end $$;

-- A message (or an edit of one) to people who don't follow its sender:
-- hidden for each of them whose filters it matches. An edit is checked
-- again. The words are tidied and looked up once for the whole chat, and
-- only when someone in it doesn't follow the sender; for each such person
-- only their own settings and words are asked.
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
    hide := teen or coalesce(f.hide_offensive_requests, true);
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
-- The trigger is told which columns are people's words; a name ("name:"
-- in front: a group or group-chat name) is also checked for the few slurs
-- written together, one word at a time. On a new row every one is checked;
-- on an edit only the ones that changed (so an old row can still be
-- archived or deleted). Each trigger runs only when one of its columns is
-- written, never on a view count, a like or a vote. CourtSide's own steps
-- (nobody signed in) are left alone, except a paid booking's question,
-- which the payments service files for the player.
create or replace function public.words_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i int;
  col text;
  is_name boolean;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_val jsonb;
  v_text text;
begin
  if auth.uid() is null then
    if not (tg_table_name = 'coaching_requests'
            and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
  for i in 0 .. tg_nargs - 1 loop
    is_name := tg_argv[i] like 'name:%';
    col := case when is_name then substr(tg_argv[i], 6) else tg_argv[i] end;
    v_val := v_new -> col;
    if v_val is null or jsonb_typeof(v_val) = 'null' then continue; end if;
    if tg_op = 'UPDATE' and v_val is not distinct from (v_old -> col) then continue; end if;
    v_text := case jsonb_typeof(v_val)
      when 'array' then (select string_agg(x, ' ') from jsonb_array_elements_text(v_val) x)
      when 'string' then v_val #>> '{}'
    end;
    if v_text is null or btrim(v_text) = '' then continue; end if;
    if (is_name and public.words_in_name(v_text)) or (not is_name and public.words_found(v_text, 'severe')) then
      raise exception 'blocked_words' using hint = 'This includes words that break CourtSide''s rules.';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.words_block() from public, anon, authenticated;

-- Profiles: the same, with the handle and name checked as names. A sign-up
-- (nobody signed in yet) is never refused: a severe handle becomes a plain
-- "player" one, a severe name "Player", a severe bio or town is left empty.
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
create trigger words_block before insert or update of handle, name, bio, location on public.profiles
  for each row execute function public.words_block_profile();

-- Every other place people write (each only if it exists, with the columns it has).
do $$
declare
  t record;
  cols text[];
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
      ('conversations', array['name:title']),
      ('feed_groups', array['name:name', 'description']),
      ('polls', array['options']),
      ('hit_requests', array['note']),
      ('court_notes', array['note']),
      ('court_reviews', array['notes']),
      ('tips', array['body']),
      ('coach_reviews', array['body']),
      ('coach_services', array['title', 'description']),
      ('coaching_requests', array['question', 'response']),
      ('coaches', array['headline', 'credentials']),
      ('coach_results', array['client_name', 'focus', 'before', 'after', 'note'])) as x (tbl, cols)
  loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    execute format('drop trigger if exists words_block on public.%I', t.tbl);
    select array_agg(c order by n) into cols from unnest(t.cols) with ordinality as u (c, n)
      where exists (select 1 from information_schema.columns ic
                    where ic.table_schema = 'public' and ic.table_name = t.tbl and ic.column_name = regexp_replace(c, '^name:', ''));
    if cols is null then continue; end if;
    execute format('create trigger words_block before insert or update of %s on public.%I for each row execute function public.words_block(%s)',
      (select string_agg(quote_ident(regexp_replace(c, '^name:', '')), ', ') from unnest(cols) c),
      t.tbl,
      (select string_agg(quote_literal(c), ', ') from unnest(cols) c));
  end loop;
end $$;
-- Messages: never an event line ("Mira added Dev").
drop trigger if exists words_block on public.messages;
create trigger words_block before insert or update of body on public.messages
  for each row when (new.kind <> 'system') execute function public.words_block('body');

-- Before a post or Instant goes up (its photo or clip can take a while):
-- whether its words would be refused, so the app says so while the draft
-- is still there. Signed in only; the same answer the post itself gets.
create or replace function public.words_refused(p_texts text[])
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if cardinality(coalesce(p_texts, '{}')) > 10 then raise exception 'too many'; end if;
  return exists (select 1 from unnest(coalesce(p_texts, '{}')) x where char_length(x) <= 10000 and public.words_found(x, 'severe'));
end $$;

-- A link's preview (108's share_preview), word for word, except that a
-- comment or thread reply hidden by Hidden words, or under one, is not counted.
CREATE OR REPLACE FUNCTION public.share_preview(p_kind text, p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_uuid boolean := coalesce(p_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  locked jsonb := jsonb_build_object('kind', p_kind, 'open', false);
  p public.posts;
  h public.hit_requests;
  q public.questions;
  pr public.profiles;
  joined int;
begin
  if p_kind = 'post' then
    if not is_uuid then return locked; end if;
    select * into p from public.posts where id = p_id::uuid;
    if p.id is null or p.archived or p.removed_at is not null or public.share_in_group(p) or not public.share_open_to_me(p.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'post', 'open', true,
      'author', public.share_person(p.author_id),
      'post', jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'body', left(p.body, 500), 'createdAt', p.created_at,
        'imageUrl', p.image_url, 'videoUrl', p.video_url, 'thumbnailUrl', p.thumbnail_url, 'orientation', p.orientation,
        'likes', (select count(*) from public.post_likes l where l.post_id = p.id),
        'comments', (select count(*) from public.comments c where c.post_id = p.id and c.removed_at is null
          and not exists (select 1 from public.comment_word_holds wh where wh.kind = 'comment' and wh.item_id in (c.id, c.parent_id))),
        'courtName', p.court_name, 'courtId', p.court_id, 'location', nullif(btrim(coalesce(p.location, '')), ''),
        -- Only the session's shape, never its numbers from a tracker or who else played.
        'session', case when jsonb_typeof(p.session) = 'object' then jsonb_strip_nulls(jsonb_build_object(
          'minutes', case when jsonb_typeof(p.session->'minutes') = 'number' then p.session->'minutes' end,
          'focus', left(p.session->>'focus', 40),
          'kind', case when p.session->>'kind' in ('practice', 'match', 'drills', 'fitness') then p.session->>'kind' end)) end)));
  end if;

  if p_kind = 'profile' then
    if not is_uuid then return locked; end if;
    select * into pr from public.profiles where id = p_id::uuid;
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'profile', 'open', true,
      'author', public.share_person(pr.id),
      'profile', jsonb_strip_nulls(jsonb_build_object(
        'bio', left(pr.bio, 200),
        'followers', pr.followers_count,
        'posts', (select count(*) from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null and not public.share_in_group(x)),
        'skillSystem', case when pr.profile->>'skillSystem' in ('NTRP', 'UTR', 'ITF') then pr.profile->>'skillSystem' end,
        'rating', case when jsonb_typeof(pr.profile->'rating') = 'number' then pr.profile->'rating' end,
        'openHits', (select count(*) from public.hit_requests y where y.author_id = pr.id and not y.cancelled and y.starts_at > now() and public.hit_is_open(y.id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.author_id = pr.id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'hit-request' then
    if not is_uuid then return locked; end if;
    select * into h from public.hit_requests where id = p_id::uuid;
    if h.id is null or not public.share_open_to_me(h.author_id) then return locked; end if;
    if not public.hit_is_open(h.id) and not public.hit_reaches(auth.uid(), h.id) then return locked; end if;
    select count(*) into joined from public.hit_joins j where j.hit_id = h.id;
    return jsonb_build_object('kind', 'hit-request', 'open', true,
      'gone', h.cancelled or h.starts_at < now() - interval '1 hour',
      'author', public.share_person(h.author_id),
      'hit', jsonb_strip_nulls(jsonb_build_object(
        'id', h.id, 'startsAt', h.starts_at, 'format', h.format, 'spots', h.spots,
        'spotsLeft', greatest(h.spots - joined, 0), 'levelMin', h.level_min, 'levelMax', h.level_max,
        'note', left(h.note, 280),
        'place', jsonb_strip_nulls(jsonb_build_object(
          'id', case when (h.place->>'id') ~ '^(node|way|relation)[0-9]{1,15}$' then h.place->>'id' end,
          'name', left(h.place->>'name', 120),
          -- About a street away, the way a court is found; never to the metre.
          'lat', case when jsonb_typeof(h.place->'lat') = 'number' then round((h.place->>'lat')::numeric, 3) end,
          'lng', case when jsonb_typeof(h.place->'lng') = 'number' then round((h.place->>'lng')::numeric, 3) end)))));
  end if;

  if p_kind = 'question' then
    if not is_uuid then return locked; end if;
    select * into q from public.questions where id = p_id::uuid;
    if q.id is null or q.removed_at is not null or not public.share_open_to_me(q.author_id) then return locked; end if;
    return jsonb_build_object('kind', 'question', 'open', true,
      'author', public.share_person(q.author_id),
      'question', jsonb_build_object(
        'id', q.id, 'title', left(q.title, 200), 'body', left(q.body, 400), 'createdAt', q.created_at,
        'answers', (select count(*) from public.answers a where a.question_id = q.id and a.removed_at is null
          and not exists (select 1 from public.comment_word_holds wh where wh.kind = 'answer' and wh.item_id in (a.id, a.parent_answer_id)))));
  end if;

  if p_kind = 'court' then
    -- A court is a public place: its page always opens. What it counts and
    -- shows is only from people a stranger may see.
    if coalesce(p_id, '') !~ '^(node|way|relation)[0-9]{1,15}$' then return locked; end if;
    return jsonb_build_object('kind', 'court', 'open', true,
      'court', jsonb_strip_nulls(jsonb_build_object(
        'name', (select x.court_name from public.posts x where x.court_id = p_id and x.court_name is not null and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id) order by x.created_at desc limit 1),
        'openHits', (select count(*) from public.hit_requests y where y.place->>'id' = p_id and not y.cancelled and y.starts_at > now() and public.share_open_to_me(y.author_id) and public.hit_is_open(y.id)),
        'posts', (select count(*) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'players', (select count(distinct x.author_id) from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null and not public.share_in_group(x) and public.share_open_to_me(x.author_id)),
        'recent', coalesce((select jsonb_agg(public.share_tile(x) order by x.created_at desc) from (
          select * from public.posts x where x.court_id = p_id and not x.archived and x.removed_at is null
            and (x.image_url is not null or x.thumbnail_url is not null) and not public.share_in_group(x) and public.share_open_to_me(x.author_id)
          order by x.created_at desc limit 6) x), '[]'::jsonb))));
  end if;

  if p_kind = 'referrer' then
    -- The handle on a link (?ref=): only named back when it is someone a
    -- stranger may see, so a made-up link cannot claim to come from anyone.
    select * into pr from public.profiles where handle = lower(btrim(coalesce(p_id, '')));
    if pr.id is null or not public.share_open_to_me(pr.id) then return locked; end if;
    return jsonb_build_object('kind', 'referrer', 'open', true, 'author', public.share_person(pr.id));
  end if;

  return locked;
end $function$;

-- The live handle check as migration 116 left it, word for word, plus one
-- line: a handle with severe words in it says 'words', so the app says so
-- before it is saved.
CREATE OR REPLACE FUNCTION public.handle_status(p_handle text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  wanted text := lower(trim(coalesce(p_handle, '')));
  me uuid := auth.uid();
  owner uuid;
begin
  if wanted !~ '^[a-z0-9_]{2,24}$' then return 'invalid'; end if;
  select id into owner from public.profiles where handle = wanted;
  if owner is not null then
    return case when owner = me then 'yours' else 'taken' end;
  end if;
  if char_length(wanted) < 3 then return 'invalid'; end if;
  if public.campaign_label(wanted) then return 'taken'; end if;
  if public.words_in_name(wanted) then return 'words'; end if;
  if exists (
    select 1 from public.handle_history
    where handle = wanted and released_at > now() - interval '14 days' and user_id is distinct from me
  ) then
    return 'held';
  end if;
  return 'ok';
end $function$;

-- ------------------------------------------------------------- 8. the words
-- Kept to words that are offensive whatever the sentence. Left out on
-- purpose, because tennis players say them: kill, shot, smash, murder,
-- destroy, choke, tank, beat, sick, nasty, filthy, balls, hooker, cock
-- (the wrist), ass on its own, suck, hell, damn, Dick's (the shop).
-- Plain swearing that isn't aimed at anyone ("holy shit what a shot",
-- "fucking unreal rally", "that was bullshit, the ball was in") is in the
-- teen tier: hidden for under-18 accounts only. Aimed at someone ("fuck
-- you", "you're a fucking idiot", "piece of shit") it is offensive.
-- Moved off the list or out of the severe tier (Oct 5 review): "kike" and
-- "fag" (a Spanish name, British for a cigarette: hidden, never refused);
-- "I'm gonna kill you" and the like (banter between players: hidden,
-- never refused, Oct 5 owner);
-- none of wetback, towelhead, raghead or lolicon is looked for inside a
-- longer name any more ("sweetbackhand", "towelheadband", "Craghead",
-- "loliconic"); "rape" without endings ("rapper").
-- Every entry is written in full each time, so running this again puts
-- the list back exactly as it is here.
insert into public.word_list (term, tier, spaced, endings, in_names, unless_before, unless_after, pattern, name_pattern) values
  ('nigger', 'severe', true, true, true, '{}', '{}', null, '(?<!s)n+i+g+g+e+r+'),
  ('nigga', 'severe', true, true, true, '{}', '{}', null, '(?<!s)n+i+g+g+a+(?!r+d)'),
  ('niggaz', 'severe', true, false, true, '{}', '{}', null, null),
  ('nigguh', 'severe', true, false, false, '{}', '{}', null, null),
  ('niggah', 'severe', true, false, false, '{}', '{}', null, null),
  ('niqqer', 'severe', true, true, true, '{}', '{}', null, null),
  ('niqqa', 'severe', true, true, true, '{}', '{}', null, null),
  ('niglet', 'severe', true, false, false, '{}', '{}', null, null),
  ('nignog', 'severe', false, false, false, '{}', '{}', null, null),
  ('nig nog', 'severe', false, false, false, '{}', '{}', null, null),
  ('sand nigger', 'severe', false, true, false, '{}', '{}', null, null),
  ('faggot', 'severe', true, true, true, '{}', '{}', null, null),
  ('faggit', 'severe', true, false, false, '{}', '{}', null, null),
  ('fagot', 'severe', true, false, false, '{}', '{}', null, null),
  ('faggy', 'severe', true, false, false, '{}', '{}', null, null),
  ('kikes', 'severe', true, false, false, '{}', '{}', null, null),
  ('kyke', 'severe', false, false, false, '{}', '{}', null, null),
  ('spics', 'severe', true, false, false, '{}', '{}', null, null),
  ('wetback', 'severe', true, true, false, '{}', '{}', null, null),
  ('beaner', 'severe', false, false, false, '{}', '{}', null, null),
  ('beaners', 'severe', false, false, false, '{}', '{}', null, null),
  ('gook', 'severe', true, false, false, '{}', '{}', null, null),
  ('gooks', 'severe', true, false, false, '{}', '{}', null, null),
  ('raghead', 'severe', true, true, false, '{}', '{}', null, null),
  ('towelhead', 'severe', true, true, false, '{}', '{}', null, null),
  ('camel jockey', 'severe', false, false, false, '{}', '{}', null, null),
  ('paki', 'severe', true, false, false, '{}', '{}', null, null),
  ('pakis', 'severe', true, false, false, '{}', '{}', null, null),
  ('porch monkey', 'severe', false, false, false, '{}', '{}', null, null),
  ('jungle bunny', 'severe', false, false, false, '{}', '{}', null, null),
  ('zipperhead', 'severe', false, true, false, '{}', '{}', null, null),
  ('chink', 'severe', true, false, false, '{}', array['in', 'of'], null, null),
  ('chinks', 'severe', true, false, false, '{}', array['in', 'of'], null, null),
  ('chinky', 'severe', false, false, false, '{}', '{}', null, null),
  ('spic', 'severe', true, false, false, '{}', array['and span', 'n span'], null, null),
  ('heil hitler', 'severe', false, false, false, '{}', '{}', null, null),
  ('sieg heil', 'severe', false, false, false, '{}', '{}', null, null),
  ('gas the jews', 'severe', false, false, false, '{}', '{}', null, null),
  ('kill all jews', 'severe', false, false, false, '{}', '{}', null, null),
  ('kill all blacks', 'severe', false, false, false, '{}', '{}', null, null),
  ('kill all muslims', 'severe', false, false, false, '{}', '{}', null, null),
  ('kill all gays', 'severe', false, false, false, '{}', '{}', null, null),
  ('death to jews', 'severe', false, false, false, '{}', '{}', null, null),
  ('child porn', 'severe', false, false, false, '{}', '{}', null, null),
  ('childporn', 'severe', false, false, true, '{}', '{}', null, null),
  ('kiddie porn', 'severe', false, false, false, '{}', '{}', null, null),
  ('kiddy porn', 'severe', false, false, false, '{}', '{}', null, null),
  ('jailbait', 'severe', false, false, true, '{}', '{}', null, null),
  ('lolicon', 'severe', false, false, false, '{}', '{}', null, null),
  ('shotacon', 'severe', false, false, false, '{}', '{}', null, null),
  ('preteen sex', 'severe', false, false, false, '{}', '{}', null, null),
  ('underage sex', 'severe', false, false, false, '{}', '{}', null, null),
  ('underage nudes', 'severe', false, false, false, '{}', '{}', null, null),
  ('teen nudes', 'severe', false, false, false, '{}', '{}', null, null),
  ('kid nudes', 'severe', false, false, false, '{}', '{}', null, null),
  ('send nudes', 'severe', false, false, false, '{}', '{}', null, null),
  ('send me nudes', 'severe', false, false, false, '{}', '{}', null, null),
  ('send me a nude', 'severe', false, false, false, '{}', '{}', null, null),
  ('nudes of you', 'severe', false, false, false, '{}', '{}', null, null),
  ('kys', 'severe', true, false, false, '{}', '{}', null, null),
  ('hope you die', 'severe', false, false, false, '{}', array['hard', 'hards', 'your hair', 'ur hair', 'laughing'], null, null),
  ('hope u die', 'severe', false, false, false, '{}', array['hard', 'hards', 'your hair', 'ur hair', 'laughing'], null, null),
  ('you should die', 'severe', false, false, false, '{}', array['hard', 'hards', 'your hair', 'ur hair', 'it', 'them'], null, null),
  ('u should die', 'severe', false, false, false, '{}', array['hard', 'hards', 'your hair', 'ur hair', 'it', 'them'], null, null),
  ('drink bleach', 'severe', false, false, false, '{}', '{}', null, null),
  ('slit your wrists', 'severe', false, false, false, '{}', '{}', null, null),
  ('slit your throat', 'severe', false, false, false, '{}', '{}', null, null),
  ('end your life', 'severe', false, false, false, array['will', 'gonna', 'would', 'could', 'might', 'going to', 'can', 'itll', 'it will', 'thatll', 'that will', 'wont', 'doesnt'], '{}', null, null),
  ('shoot up the school', 'severe', false, false, false, '{}', '{}', null, null),
  ('shoot up your school', 'severe', false, false, false, '{}', '{}', null, null),
  ('hope you get raped', 'severe', false, false, false, '{}', '{}', null, null),
  ('kill yourself', 'severe', false, false, false, array['dont', 'do not', 'didnt', 'never', 'not', 'not to', 'wont', 'youll', 'you will', 'youd', 'you would', 'you could', 'you might', 'almost', 'nearly', 'could', 'might', 'would', 'gonna', 'going to', 'itll', 'it will', 'thatll', 'that will', 'will'], '{}', null, null),
  ('kill urself', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}', null, null),
  ('kill your self', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}', null, null),
  ('hang yourself', 'severe', false, false, false, array['dont', 'do not', 'never', 'not', 'youll', 'gonna', 'will'], '{}', null, null),
  ('neck yourself', 'severe', false, false, false, '{}', '{}', null, null),
  ('go die', 'severe', false, false, false, '{}', array['hard', 'hards', 'happy', 'in bed', 'on that hill', 'on this hill', 'laughing', 'of embarrassment', 'of shame'], null, null),
  ('end yourself', 'severe', false, false, false, '{}', '{}', null, null),
  ('kike', 'offensive', true, false, false, '{}', '{}', null, null),
  ('fag', 'offensive', true, false, false, '{}', '{}', null, null),
  ('fags', 'offensive', true, false, false, '{}', '{}', null, null),
  ('fucker', 'offensive', false, true, false, '{}', '{}', null, null),
  ('fuckface', 'offensive', false, true, false, '{}', '{}', null, null),
  ('fuckhead', 'offensive', false, true, false, '{}', '{}', null, null),
  ('fuckwit', 'offensive', false, true, false, '{}', '{}', null, null),
  ('fucktard', 'offensive', false, true, false, '{}', '{}', null, null),
  ('motherfucker', 'offensive', false, true, false, '{}', '{}', null, null),
  ('shithead', 'offensive', false, true, false, '{}', '{}', null, null),
  ('shitface', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dipshit', 'offensive', false, true, false, '{}', '{}', null, null),
  ('arsehole', 'offensive', false, true, false, '{}', '{}', null, null),
  ('asshat', 'offensive', false, true, false, '{}', '{}', null, null),
  ('assclown', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dumbass', 'offensive', false, true, false, '{}', '{}', null, null),
  ('jackass', 'offensive', false, true, false, '{}', '{}', null, null),
  ('fatass', 'offensive', false, true, false, '{}', '{}', null, null),
  ('twat', 'offensive', false, true, false, '{}', '{}', null, null),
  ('wanker', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dickhead', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dickface', 'offensive', false, true, false, '{}', '{}', null, null),
  ('douchebag', 'offensive', false, true, false, '{}', '{}', null, null),
  ('cocksucker', 'offensive', false, true, false, '{}', '{}', null, null),
  ('cock sucker', 'offensive', false, true, false, '{}', '{}', null, null),
  ('asshole', 'offensive', true, true, false, '{}', '{}', null, null),
  ('motherfucking', 'offensive', false, false, false, '{}', '{}', null, null),
  ('mofo', 'offensive', false, false, false, '{}', '{}', null, null),
  ('stfu', 'offensive', false, false, false, '{}', '{}', null, null),
  ('gtfo', 'offensive', false, false, false, '{}', '{}', null, null),
  ('piece of shit', 'offensive', false, false, false, '{}', '{}', null, null),
  ('eat shit', 'offensive', false, false, false, '{}', '{}', null, null),
  ('biatch', 'offensive', false, false, false, '{}', '{}', null, null),
  ('beyotch', 'offensive', false, false, false, '{}', '{}', null, null),
  ('sonofabitch', 'offensive', false, false, false, '{}', '{}', null, null),
  ('kiss my ass', 'offensive', false, false, false, '{}', '{}', null, null),
  ('prick', 'offensive', false, false, false, '{}', '{}', null, null),
  ('pricks', 'offensive', false, false, false, '{}', '{}', null, null),
  ('suck my dick', 'offensive', false, false, false, '{}', '{}', null, null),
  ('suck my cock', 'offensive', false, false, false, '{}', '{}', null, null),
  ('suck my balls', 'offensive', false, false, false, '{}', '{}', null, null),
  ('pussy', 'offensive', false, false, false, '{}', '{}', null, null),
  ('pussies', 'offensive', false, false, false, '{}', '{}', null, null),
  ('spaz', 'offensive', false, false, false, '{}', '{}', null, null),
  ('coons', 'offensive', false, false, false, '{}', '{}', null, null),
  ('tranny', 'offensive', false, false, false, '{}', '{}', null, null),
  ('trannies', 'offensive', false, false, false, '{}', '{}', null, null),
  ('homos', 'offensive', false, false, false, '{}', '{}', null, null),
  ('ass hole', 'offensive', false, true, false, '{}', '{}', null, null),
  ('bitch', 'offensive', true, true, false, '{}', '{}', null, null),
  ('cunt', 'offensive', true, true, false, '{}', '{}', null, null),
  ('wank', 'offensive', false, true, false, '{}', '{}', null, null),
  ('douche', 'offensive', false, true, false, '{}', '{}', null, null),
  ('slut', 'offensive', false, true, false, '{}', '{}', null, null),
  ('whore', 'offensive', false, true, false, '{}', '{}', null, null),
  ('skank', 'offensive', false, true, false, '{}', '{}', null, null),
  ('thot', 'offensive', false, true, false, '{}', '{}', null, null),
  ('mongoloid', 'offensive', false, true, false, '{}', '{}', null, null),
  ('shemale', 'offensive', false, true, false, '{}', '{}', null, null),
  ('paedo', 'offensive', false, true, false, '{}', '{}', null, null),
  ('pedophile', 'offensive', false, true, false, '{}', '{}', null, null),
  ('paedophile', 'offensive', false, true, false, '{}', '{}', null, null),
  ('nonce', 'offensive', false, true, false, '{}', '{}', null, null),
  ('hoe', 'offensive', false, true, false, '{}', array['gaat', 'laat', 'is', 'ben', 'heet', 'gaan', 'kan', 'lang', 'veel', 'vaak', 'zit', 'komt', 'werkt', 'was', 'ver', 'oud', 'doe', 'doen', 'moet'], null, null),
  ('dick', 'offensive', false, false, false, array['moby'], array['enberg', 'savitt', 'stockton', 'smith', 'van', 'tracy', 'clark', 'cheney', 'vitale', 'grayson', 'whittington', 'francis', 'king'], null, null),
  ('dyke', 'offensive', false, true, false, array['van'], '{}', null, null),
  ('coon', 'offensive', false, false, false, '{}', array['rapids', 'cheese', 'hound', 'hounds', 'skin'], null, null),
  ('homo', 'offensive', false, false, false, '{}', array['sapiens', 'erectus', 'habilis'], null, null),
  ('retard', 'offensive', false, true, false, array['en', 'du', 'de', 'un', 'le', 'sans'], '{}', null, null),
  ('porn', 'offensive', false, true, false, array['tennis', 'food', 'rally', 'shot', 'forehand', 'backhand', 'serve', 'slice', 'footwork', 'court', 'gear', 'racket', 'racquet', 'shoe', 'grip'], '{}', null, null),
  ('porno', 'offensive', false, false, false, '{}', '{}', null, null),
  ('pornhub', 'offensive', false, false, false, '{}', '{}', null, null),
  ('onlyfans', 'offensive', false, false, false, '{}', '{}', null, null),
  ('nudes', 'offensive', false, false, false, '{}', '{}', null, null),
  ('nude pics', 'offensive', false, false, false, '{}', '{}', null, null),
  ('horny', 'offensive', false, false, false, '{}', '{}', null, null),
  ('boobs', 'offensive', false, false, false, '{}', '{}', null, null),
  ('boobies', 'offensive', false, false, false, '{}', '{}', null, null),
  ('titties', 'offensive', false, false, false, '{}', '{}', null, null),
  ('tits', 'offensive', false, false, false, '{}', '{}', null, null),
  ('jerk off', 'offensive', false, false, false, '{}', '{}', null, null),
  ('jerking off', 'offensive', false, false, false, '{}', '{}', null, null),
  ('jack off', 'offensive', false, false, false, '{}', '{}', null, null),
  ('masturbating', 'offensive', false, false, false, '{}', '{}', null, null),
  ('masturbation', 'offensive', false, false, false, '{}', '{}', null, null),
  ('sexting', 'offensive', false, false, false, '{}', '{}', null, null),
  ('blowjob', 'offensive', false, true, false, '{}', '{}', null, null),
  ('blow job', 'offensive', false, true, false, '{}', '{}', null, null),
  ('handjob', 'offensive', false, true, false, '{}', '{}', null, null),
  ('hand job', 'offensive', false, true, false, '{}', '{}', null, null),
  ('rimjob', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dildo', 'offensive', false, true, false, '{}', '{}', null, null),
  ('cumshot', 'offensive', false, true, false, '{}', '{}', null, null),
  ('creampie', 'offensive', false, true, false, '{}', '{}', null, null),
  ('deepthroat', 'offensive', false, true, false, '{}', '{}', null, null),
  ('gangbang', 'offensive', false, true, false, '{}', '{}', null, null),
  ('orgasm', 'offensive', false, true, false, '{}', '{}', null, null),
  ('masturbate', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dick pic', 'offensive', false, true, false, '{}', '{}', null, null),
  ('dickpic', 'offensive', false, true, false, '{}', '{}', null, null),
  ('milf', 'offensive', false, true, false, '{}', '{}', null, null),
  ('nobody likes you', 'offensive', false, false, false, '{}', '{}', null, null),
  ('no one likes you', 'offensive', false, false, false, '{}', '{}', null, null),
  ('everyone hates you', 'offensive', false, false, false, '{}', '{}', null, null),
  ('everybody hates you', 'offensive', false, false, false, '{}', '{}', null, null),
  ('you are worthless', 'offensive', false, false, false, '{}', '{}', null, null),
  ('youre worthless', 'offensive', false, false, false, '{}', '{}', null, null),
  ('ur worthless', 'offensive', false, false, false, '{}', '{}', null, null),
  ('go to hell', 'offensive', false, false, false, '{}', '{}', null, null),
  ('die in a hole', 'offensive', false, false, false, '{}', '{}', null, null),
  ('fat cow', 'offensive', false, false, false, '{}', '{}', null, null),
  ('fat pig', 'offensive', false, false, false, '{}', '{}', null, null),
  ('ugly bitch', 'offensive', false, false, false, '{}', '{}', null, null),
  ('i know where you live', 'offensive', false, false, false, '{}', '{}', null, null),
  ('i know where u live', 'offensive', false, false, false, '{}', '{}', null, null),
  ('🖕', 'offensive', false, false, false, '{}', '{}', null, null),
  ('🍆💦', 'offensive', false, false, false, '{}', '{}', null, null),
  ('fuck', 'teen', true, true, false, '{}', '{}', null, null),
  ('fucking', 'teen', true, false, false, '{}', '{}', null, null),
  ('fuk', 'teen', false, true, false, '{}', '{}', null, null),
  ('fck', 'teen', false, true, false, '{}', '{}', null, null),
  ('phuck', 'teen', false, true, false, '{}', '{}', null, null),
  ('fvck', 'teen', false, true, false, '{}', '{}', null, null),
  ('shit', 'teen', true, true, false, '{}', '{}', null, null),
  ('bullshit', 'teen', false, true, false, '{}', '{}', null, null),
  ('bastard', 'teen', false, true, false, '{}', '{}', null, null),
  ('fuq', 'teen', false, false, false, '{}', '{}', null, null),
  ('fcking', 'teen', false, false, false, '{}', '{}', null, null),
  ('fking', 'teen', false, false, false, '{}', '{}', null, null),
  ('fkin', 'teen', false, false, false, '{}', '{}', null, null),
  ('fkn', 'teen', false, false, false, '{}', '{}', null, null),
  ('shite', 'teen', false, false, false, '{}', '{}', null, null),
  ('horseshit', 'teen', false, false, false, '{}', '{}', null, null),
  ('how old are you', 'teen', false, false, false, '{}', '{}', null, null),
  ('how old r u', 'teen', false, false, false, '{}', '{}', null, null),
  ('how old are u', 'teen', false, false, false, '{}', '{}', null, null),
  ('what age are you', 'teen', false, false, false, '{}', '{}', null, null),
  ('send pics', 'teen', false, false, false, '{}', '{}', null, null),
  ('send a pic', 'teen', false, false, false, '{}', '{}', null, null),
  ('send me a pic', 'teen', false, false, false, '{}', '{}', null, null),
  ('send me pics', 'teen', false, false, false, '{}', '{}', null, null),
  ('send me a picture', 'teen', false, false, false, '{}', '{}', null, null),
  ('are you alone', 'teen', false, false, false, '{}', '{}', null, null),
  ('are u alone', 'teen', false, false, false, '{}', '{}', null, null),
  ('dont tell your parents', 'teen', false, false, false, '{}', '{}', null, null),
  ('dont tell your mom', 'teen', false, false, false, '{}', '{}', null, null),
  ('dont tell your dad', 'teen', false, false, false, '{}', '{}', null, null),
  ('our little secret', 'teen', false, false, false, '{}', '{}', null, null),
  ('whats your snap', 'teen', false, false, false, '{}', '{}', null, null),
  ('add me on snap', 'teen', false, false, false, '{}', '{}', null, null),
  ('snap me', 'teen', false, false, false, '{}', '{}', null, null),
  ('sexy', 'teen', false, false, false, '{}', '{}', null, null),
  ('have sex', 'teen', false, false, false, '{}', '{}', null, null),
  ('sex chat', 'teen', false, false, false, '{}', '{}', null, null),
  ('hot body', 'teen', false, false, false, '{}', '{}', null, null),
  ('youre hot', 'teen', false, false, false, '{}', '{}', null, null),
  ('ur hot', 'teen', false, false, false, '{}', '{}', null, null),
  ('nude', 'teen', false, false, false, '{}', '{}', null, null),
  ('naked', 'teen', false, false, false, '{}', '{}', null, null),
  ('hook up', 'teen', false, false, false, '{}', '{}', null, null),
  ('dtf', 'teen', false, false, false, '{}', '{}', null, null),
  ('ass', 'teen', false, false, false, '{}', '{}', null, null),
  ('wtf', 'teen', false, false, false, '{}', '{}', null, null),
  ('hookup', 'teen', false, true, false, '{}', '{}', null, null),
  ('threat: i will kill you', 'offensive', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|i[^a-z0-9]+shall|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna|about[^a-z0-9]+to|finna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to))(?:[^a-z0-9]+(?:fucking|fuckin|literally|actually|really|seriously|just))?[^a-z0-9]+(?:k+i+l+l+|m+u+r+d+e+r+|s+t+a+b+|s+t+r+a+n+g+l+e+|b+e+h+e+a+d+)[^a-z0-9]+(?:you|u|ya|yall|you[^a-z0-9]+all|your[^a-z0-9]+(?:family|mom|mum|kids|whole[^a-z0-9]+family))(?![a-z0-9])(?![^a-z0-9]+(?:on[^a-z0-9]+(?:the[^a-z0-9]+)?(?:court|courts|clay|grass|hard[^a-z0-9]+courts?|carpet|scoreboard)|at[^a-z0-9]+(?:practice|training|tennis|padel|pickleball|squash|badminton|table[^a-z0-9]+tennis|ping[^a-z0-9]*pong|golf|chess|fifa|cards|league|the[^a-z0-9]+(?:club|courts?|park|net|baseline|tournament|league|ladder))|in[^a-z0-9]+(?:practice|training|tennis|padel|pickleball|squash|doubles|singles|straight[^a-z0-9]+sets|(?:a|our|the|this|that|your|my|next|tomorrows|saturdays|sundays)[^a-z0-9]+(?:(?:league|ladder|club|practice|final|semi|semis|quarter|quarters|first|second|third|fifth|next|deciding|rematch|tiebreak|doubles|singles|mixed|big|friendly)[^a-z0-9]+){0,3}(?:match|matches|game|games|set|sets|final|finals|semis|semi|semifinal|rematch|tiebreak|tiebreaker|breaker|league|ladder|draw|round|tournament|third|decider|practice|session|drill|drills|rally|rallies|doubles|singles))|next[^a-z0-9]+(?:set|match|game|week|weekend|time|round|season|year|month|practice|session)(?![^a-z0-9]+(?:in|at|outside|near|when|after|while)[^a-z0-9]+(?:your|ur|ya|you|school|home|work|sleep)(?![a-z0-9]))|this[^a-z0-9]+(?:weekend|week|time|season|year|morning|afternoon|evening|match|game|set|(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?![^a-z0-9]+(?:in|at|outside|near|when|after|while)[^a-z0-9]+(?:your|ur|ya|you|school|home|work|sleep)(?![a-z0-9]))|(?:tomorrow|tonight|today|later|tmrw|tmr|tomoz|(?:on|at)[^a-z0-9]+(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?![^a-z0-9]+(?:in|at|outside|near|when|after|while)[^a-z0-9]+(?:your|ur|ya|you|school|home|work|sleep)(?![a-z0-9]))|(?:6|six)[^a-z0-9]*(?:0|o|love))(?![a-z0-9]))', null),
  ('threat: i will shoot you', 'severe', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|i[^a-z0-9]+shall|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna|about[^a-z0-9]+to|finna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to))(?:[^a-z0-9]+(?:fucking|fuckin|literally|actually|really|seriously|just))?[^a-z0-9]+s+h+o+o+t+[^a-z0-9]+(?:you|u|ya|yall|you[^a-z0-9]+all|your[^a-z0-9]+(?:family|mom|mum|kids))(?![a-z0-9])(?![^a-z0-9]+(?:a|an|the|some|my|this|that|these|those|it|over|guys|both|all|back|down|another|one|quick|text|message|dm|email|note|line|pic|pics|picture|video|link|details|info|invite|update|call|ball|serve|lob|from[^a-z0-9]+(?:the[^a-z0-9]+)?(?:side|sides|front|back|baseline|net|fence|stands|other[^a-z0-9]+side|courtside|bleachers|above|behind[^a-z0-9]+the[^a-z0-9]+(?:baseline|court|fence|net)|a[^a-z0-9]+(?:distance|drone)|different[^a-z0-9]+angles?|an[^a-z0-9]+angle|every[^a-z0-9]+angle|my[^a-z0-9]+phone)|during[^a-z0-9]+(?:(?:your|the|our|my|a|this|next)[^a-z0-9]+)?(?:match|lesson|practice|session|warm[^a-z0-9]*up|warmup|game|set|final|drill|drills|training|serve|serves|rally|rallies|point|points|tournament|clinic|hit)|while[^a-z0-9]+(?:you[^a-z0-9]+(?:(?:are|re)[^a-z0-9]+)?)?(?:play|playing|hit|hitting|serve|serving|practice|practicing|practising|train|training|rally|rallying|warm|warming|drill|drilling)|playing|hitting|serving|practicing|practising|training|warming[^a-z0-9]+up|rallying|competing|volleying|returning|in[^a-z0-9]+(?:slow?[^a-z0-9]*mo(?:tion)?|4k|hd|action|portrait|landscape|black[^a-z0-9]+and[^a-z0-9]+white|your[^a-z0-9]+(?:kit|whites|match|lesson|next[^a-z0-9]+match)|the[^a-z0-9]+(?:final|match|golden[^a-z0-9]+hour))|on[^a-z0-9]+(?:video|camera|film|my[^a-z0-9]+(?:phone|camera|iphone)|the[^a-z0-9]+(?:court|baseline|grass|clay)|court|tape|iphone|gopro)|for[^a-z0-9]+(?:my|the|your|our|a)[^a-z0-9]+(?:portfolio|channel|page|reel|reels|video|instagram|insta|tiktok|youtube|account|profile|coach|club|feed|story|magazine|article|newsletter|website|site|highlight|highlights|promo)|with[^a-z0-9]+(?:my|the|a)[^a-z0-9]+(?:camera|phone|gopro|iphone|drone|lens|tripod|new[^a-z0-9]+camera)|at[^a-z0-9]+(?:practice|training|the[^a-z0-9]+(?:club|courts?|tournament|match|game|park|final|net)))(?![a-z0-9]))', null),
  ('threat: i will rape you', 'severe', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:i[^a-z0-9]+will|ill|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|i[^a-z0-9]+am[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma|ima|i[^a-z0-9]+(?:wanna|want[^a-z0-9]+to)|gonna|will|wanna)[^a-z0-9]+r+a+p+e+[^a-z0-9]+(?:you|u|ya|her|him|them)(?![a-z0-9])', null),
  ('threat: hunt you down', 'severe', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:ill|i[^a-z0-9]+will|im[^a-z0-9]+(?:going[^a-z0-9]+to|gonna)|imma)[^a-z0-9]+(?:hunt|track)[^a-z0-9]+(?:you|u)[^a-z0-9]+down(?![a-z0-9])', null),
  ('rape (any form)', 'offensive', false, false, false, '{}', '{}', '(?<![a-z0-9])r+a+p(?:e+|e+s+|e+d+|i+n+g+|e+y+|i+s+t+s*)(?![a-z0-9])', null),
  ('aimed: fuck you', 'offensive', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:f+[^a-z0-9]{0,3}[uv*#]+[^a-z0-9]{0,3}c+[^a-z0-9]{0,3}k+|f+[*#]+k+|f+c+k+|f+k+|f+u+k+|f+u+q+|p+h+u+c+k+)[^a-z0-9]*(?:you|u|ya|yu|yourself|urself|your[^a-z0-9]*self|off|of|him|her|them|this[^a-z0-9]+guy|that[^a-z0-9]+guy|ur[^a-z0-9]+(?:mom|mum|mother)|your[^a-z0-9]+(?:mom|mum|mother|family))(?![a-z0-9])', null),
  ('aimed: you fucking suck', 'offensive', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:you|u|ya)[^a-z0-9]+(?:(?:f+[^a-z0-9]{0,3}[uv*#]+[^a-z0-9]{0,3}c+[^a-z0-9]{0,3}k+|f+[*#]+k+|f+c+k+|f+k+|f+u+k+|f+u+q+|p+h+u+c+k+)(?:i+n+g*|n+))[^a-z0-9]+(?:suck|stink|blow)(?![a-z0-9])', null),
  ('aimed: you are an idiot', 'offensive', false, false, false, '{}', '{}', '(?<![a-z0-9])(?:you|u|ya|youre|ur|you[^a-z0-9]+are|you[^a-z0-9]+r|u[^a-z0-9]+(?:r|are))(?:[^a-z0-9]+(?:such|a|an|so|the|total|complete|absolute|utter|real|proper|little|fat|ugly|stupid|dumb|pathetic|worthless|useless|biggest|sad|(?:(?:f+[^a-z0-9]{0,3}[uv*#]+[^a-z0-9]{0,3}c+[^a-z0-9]{0,3}k+|f+[*#]+k+|f+c+k+|f+k+|f+u+k+|f+u+q+|p+h+u+c+k+)(?:i+n+g*|n+))|effing|bloody))*[^a-z0-9]+(?:idiots?|morons?|losers?|imbeciles?|retards?|retarded|dumbass(?:es)?|dumbfucks?|scumbags?|scum|trash|garbage|pathetic|worthless|ugly|stupid|piece[^a-z0-9]+of[^a-z0-9]+(?:shit|crap|trash|garbage)|waste[^a-z0-9]+of[^a-z0-9]+(?:space|oxygen|air|skin)|cunts?|pricks?|twats?|wankers?|tossers?|bitch(?:es)?|whores?|sluts?|dickheads?|assholes?|arseholes?|bastards?|fuckers?|motherfuckers?)(?![a-z0-9])(?![^a-z0-9]*(?:talk|talking|talker|can|cans|bin|bins|day|bag|bags|collector)(?![a-z0-9]))', null)
on conflict (term) do update set
  tier = excluded.tier, spaced = excluded.spaced, endings = excluded.endings, in_names = excluded.in_names,
  unless_before = excluded.unless_before, unless_after = excluded.unless_after, pattern = excluded.pattern,
  name_pattern = excluded.name_pattern;
-- Anything an earlier run put on the list that is no longer on it.
delete from public.word_list where term not in ('nigger', 'nigga', 'niggaz', 'nigguh', 'niggah', 'niqqer', 'niqqa', 'niglet', 'nignog', 'nig nog', 'sand nigger', 'faggot', 'faggit', 'fagot', 'faggy', 'kikes', 'kyke', 'spics', 'wetback', 'beaner', 'beaners', 'gook', 'gooks', 'raghead', 'towelhead', 'camel jockey', 'paki', 'pakis', 'porch monkey', 'jungle bunny', 'zipperhead', 'chink', 'chinks', 'chinky', 'spic', 'heil hitler', 'sieg heil', 'gas the jews', 'kill all jews', 'kill all blacks', 'kill all muslims', 'kill all gays', 'death to jews', 'child porn', 'childporn', 'kiddie porn', 'kiddy porn', 'jailbait', 'lolicon', 'shotacon', 'preteen sex', 'underage sex', 'underage nudes', 'teen nudes', 'kid nudes', 'send nudes', 'send me nudes', 'send me a nude', 'nudes of you', 'kys', 'hope you die', 'hope u die', 'you should die', 'u should die', 'drink bleach', 'slit your wrists', 'slit your throat', 'end your life', 'shoot up the school', 'shoot up your school', 'hope you get raped', 'kill yourself', 'kill urself', 'kill your self', 'hang yourself', 'neck yourself', 'go die', 'end yourself', 'kike', 'fag', 'fags', 'fucker', 'fuckface', 'fuckhead', 'fuckwit', 'fucktard', 'motherfucker', 'shithead', 'shitface', 'dipshit', 'arsehole', 'asshat', 'assclown', 'dumbass', 'jackass', 'fatass', 'twat', 'wanker', 'dickhead', 'dickface', 'douchebag', 'cocksucker', 'cock sucker', 'asshole', 'motherfucking', 'mofo', 'stfu', 'gtfo', 'piece of shit', 'eat shit', 'biatch', 'beyotch', 'sonofabitch', 'kiss my ass', 'prick', 'pricks', 'suck my dick', 'suck my cock', 'suck my balls', 'pussy', 'pussies', 'spaz', 'coons', 'tranny', 'trannies', 'homos', 'ass hole', 'bitch', 'cunt', 'wank', 'douche', 'slut', 'whore', 'skank', 'thot', 'mongoloid', 'shemale', 'paedo', 'pedophile', 'paedophile', 'nonce', 'hoe', 'dick', 'dyke', 'coon', 'homo', 'retard', 'porn', 'porno', 'pornhub', 'onlyfans', 'nudes', 'nude pics', 'horny', 'boobs', 'boobies', 'titties', 'tits', 'jerk off', 'jerking off', 'jack off', 'masturbating', 'masturbation', 'sexting', 'blowjob', 'blow job', 'handjob', 'hand job', 'rimjob', 'dildo', 'cumshot', 'creampie', 'deepthroat', 'gangbang', 'orgasm', 'masturbate', 'dick pic', 'dickpic', 'milf', 'nobody likes you', 'no one likes you', 'everyone hates you', 'everybody hates you', 'you are worthless', 'youre worthless', 'ur worthless', 'go to hell', 'die in a hole', 'fat cow', 'fat pig', 'ugly bitch', 'i know where you live', 'i know where u live', '🖕', '🍆💦', 'fuck', 'fucking', 'fuk', 'fck', 'phuck', 'fvck', 'shit', 'bullshit', 'bastard', 'fuq', 'fcking', 'fking', 'fkin', 'fkn', 'shite', 'horseshit', 'how old are you', 'how old r u', 'how old are u', 'what age are you', 'send pics', 'send a pic', 'send me a pic', 'send me pics', 'send me a picture', 'are you alone', 'are u alone', 'dont tell your parents', 'dont tell your mom', 'dont tell your dad', 'our little secret', 'whats your snap', 'add me on snap', 'snap me', 'sexy', 'have sex', 'sex chat', 'hot body', 'youre hot', 'ur hot', 'nude', 'naked', 'hook up', 'dtf', 'ass', 'wtf', 'hookup', 'threat: i will kill you', 'threat: i will shoot you', 'threat: i will rape you', 'threat: hunt you down', 'rape (any form)', 'aimed: fuck you', 'aimed: you fucking suck', 'aimed: you are an idiot');

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
revoke all on function public.custom_words_hit(text[], text, text) from public, anon, authenticated;
revoke all on function public.hidden_by_words(uuid, text, text) from public, anon, authenticated;
revoke all on function public.words_owner_of(text, uuid) from public, anon, authenticated;
-- word_filters_ok is the table's own check; only set_hidden_words writes the row.
revoke all on function public.word_filters_ok(text[]) from public, anon, authenticated;
revoke all on function public.hidden_words() from public, anon;
revoke all on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) from public, anon;
revoke all on function public.unhide_words(text, uuid) from public, anon;
revoke all on function public.words_refused(text[]) from public, anon;
grant execute on function public.hidden_words() to authenticated;
grant execute on function public.set_hidden_words(boolean, boolean, text[], boolean, boolean) to authenticated;
grant execute on function public.unhide_words(text, uuid) to authenticated;
grant execute on function public.words_refused(text[]) to authenticated;

commit;

-- ============================================================ checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The list is there (expect three rows: offensive, severe, teen, with a count each):
-- select tier, count(*) from public.word_list group by tier order by tier;
--
-- (b) The matching (expect true, false, false, true, false, true, false, true):
-- select public.words_found('you f4gg0t', 'severe'), public.words_found('what a kill shot', 'offensive'),
--        public.words_found('Scunthorpe class assassin', 'offensive'), public.words_found('fuck you', 'offensive'),
--        public.words_found('holy shit what a shot', 'offensive'), public.words_found('holy shit what a shot', 'teen'),
--        public.words_found('I''m gonna kill you lol', 'severe'), public.words_found('I''m gonna kill you lol', 'offensive');
--
-- (c) The new reading rules (expect 4 rows):
-- select tablename from pg_policies where policyname = 'hidden words stay between two' order by 1;
