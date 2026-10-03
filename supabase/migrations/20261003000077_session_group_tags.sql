-- 77: a session's tags work like a group.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. Until it runs, the app works as before: up to 3 people a
-- session, and a post made from a session someone tagged you in names nobody.
--
-- The owner's decision (Oct 3): "For the tag thing if you do a session,
-- let's just merge them on regular posts and clips. The tags should just
-- function more as a regular tag like Instagram does it, but on a session the
-- tag functions more like a group thing."
--
-- The composer now has one list on a post with a session, "Who was there":
-- everyone in it is a session tag (migration 62: asked to accept, public on
-- the post once they do). On the server that needs three changes:
--
--   * Room for the group: a practice can have up to 8 people tagged (it was
--     3). A match stays at 3 (a doubles partner and two opponents: a court
--     holds four). tag_session and respond_session_tag (a late yes) hold the
--     new numbers.
--   * Your post of a session someone tagged you in names the group. Accepting
--     a tag puts a copy of the session in your own log (migration 62), with
--     Post it beside it. A post carrying that copy now gets a "with" list too:
--     the person who logged it, and everyone else who accepted their tag on
--     it, each on the side of the net they were on from YOUR side (an
--     opponent's opponent is your partner). Never yourself, never anyone you
--     are blocked with (either way), and someone not known to be an adult
--     only when they follow you, the same rule as tagging them yourself
--     (session_tag_refusal_for, migration 62 or 64's version). Only while
--     your own tag is accepted: take your name off, or the logger changes
--     what the session was (you are asked again), and the names come off your
--     post too. What the post says about the session itself is your copy's
--     (kind, your side of the result, day, length): the logger's tracker
--     numbers (heart rate, zones, Strain, calories) never go on your post.
--   * Keeping those posts right: whenever the logger's session posts are
--     worked out again (an accept, a decline, a removal, an edit, a block, a
--     renamed player), the posts made from its copies are too. A renamed
--     logger now updates them as well, and a block between two people works
--     out again every post either of them made from a copy.
--
-- Everything else is as 62 left it: a tag is asked once, a no stays a no,
-- pending names never reach a post, the place and notes stay private.
--
-- Replaces (as migration 62 left them, and as nothing since has changed
-- them; checked by fingerprint below, so this stops without changing
-- anything if any of them was changed since): tag_session,
-- respond_session_tag, session_with, refresh_session_posts,
-- session_tags_on_rename, session_tags_on_block. It does not replace
-- session_tag_refusal_for, so migration 64 can run before or after it.
-- After this has run, do not run 62 again (it would put the old versions
-- back); if it ever is, run this again.
--
-- Needs 62 (and, for post stats, 65 and 72; all live). Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as 62 left it (live), or as this file leaves it.
do $$
declare
  expected constant text[][] := array[
    -- name, as 62 left it, as 77 leaves it
    ['tag_session', 'b04367a5ed3a6d6a8704e8a0550ee62b', 'a9a2a9dff57d3e639ef25f5d6c577f83'],
    ['respond_session_tag', 'f15018f9ace7e7e0203e0848a71dac08', '974d2e708042ab226a5b7e4823ffebab'],
    ['session_with', '36bd41cb9f7169ebcf2b9a506c403b55', 'e253965c8c4a56d62717771193e724b4'],
    ['refresh_session_posts', '326ec7c962972ab533269f5f6f503ecb', '04f4d263a8b0f2e6b214063e729b6422'],
    ['session_tags_on_rename', 'acf1f1885d914d4503eef49d8f9d84c1', '513fba31af11e1c55ffe320edda91d33'],
    ['session_tags_on_block', '6cca9ffb2bc460f3e5fb6509dc388827', '4001d046fa817fbe39a62648bc0c12a7']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.session_tags') is null or to_regprocedure('public.session_tag_refusal_for(uuid, uuid)') is null
     or to_regprocedure('public.put_session_with(jsonb, uuid)') is null then
    raise exception 'Migration 77 stopped before changing anything: migration 62 has to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select md5(p.prosrc) into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is is null or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 77 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------------------ 1. room for the group
-- How many people a session can have tagged (waiting or accepted): 3 on a
-- match, 8 on a practice.
create or replace function public.session_tag_room(kind text)
returns int language sql immutable set search_path = public as $$
  select case when kind = 'match' then 3 else 8 end
$$;

-- Migration 62's tag_session, with the room above instead of 3.
create or replace function public.tag_session(s uuid, who uuid, as_role text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_s public.practice_sessions;
  v_t public.session_tags;
  v_role text;
  v_why text;
  v_alert boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- Held still while it is counted, so two quick taps cannot take one place twice.
  select * into v_s from public.practice_sessions where id = s for update;
  if not found or v_s.user_id is distinct from me then raise exception 'not_your_session'; end if;
  -- Your copy of someone else's session is theirs to tag, not yours.
  if v_s.from_session_id is not null then raise exception 'copy'; end if;
  if v_s.kind not in ('match', 'practice') then raise exception 'not_a_match_or_practice'; end if;
  v_role := case when v_s.kind = 'match' then coalesce(as_role, 'opponent') else 'partner' end;
  if v_role not in ('opponent', 'partner') then raise exception 'bad_role'; end if;
  v_why := public.session_tag_refusal_for(me, who);
  if v_why is not null then raise exception '%', v_why; end if;

  select * into v_t from public.session_tags where session_id = s and tagged_id = who for update;
  if found then
    if v_t.status in ('declined', 'removed') then raise exception 'declined'; end if;
    if v_t.role <> v_role then
      update public.session_tags
         set role = v_role,
             status = case when status = 'accepted' then 'pending' else status end,
             responded_at = case when status = 'accepted' then null else responded_at end
       where id = v_t.id;
      if v_t.status = 'accepted' then
        update public.notifications set read = false where user_id = who and kind = 'session-tag' and target_id = s::text;
      end if;
    end if;
    return v_t.id;
  end if;
  if (select count(*) from public.session_tags where session_id = s and status in ('pending', 'accepted')) >= public.session_tag_room(v_s.kind) then
    raise exception 'too_many';
  end if;
  -- Counted from the log, which deleting a session or a tag never empties.
  if (select count(*) from public.session_tag_log where tagger_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  -- The first 3 tags a day from you to one person alert them; the rest wait quietly in their Your sessions.
  v_alert := (select count(*) from public.session_tag_log where tagger_id = me and tagged_id = who and created_at > now() - interval '1 day') < 3;
  delete from public.session_tag_log where tagger_id = me and created_at < now() - interval '2 days';
  insert into public.session_tag_log (tagger_id, tagged_id, alerted) values (me, who, v_alert);

  insert into public.session_tags (session_id, tagger_id, tagged_id, role) values (s, me, who, v_role) returning * into v_t;
  -- Once per session and person: the same target and words never file twice,
  -- so taking a tag off and putting it back does not buzz anyone again.
  if v_alert then
    perform public.file_notification(who, me, 'session-tag', s::text, 'session-tag', case when v_s.kind = 'match' then 'match' else 'practice' end);
  end if;
  return v_t.id;
end $$;

-- Migration 62's respond_session_tag, with the room above instead of 3 for a late yes.
create or replace function public.respond_session_tag(t uuid, accept boolean, add_to_mine boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_sid uuid;
  v_t public.session_tags;
  v_s public.practice_sessions;
  v_m public.practice_sessions;
  v_name text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select session_id into v_sid from public.session_tags where id = t and tagged_id = me;
  if not found then raise exception 'not_yours'; end if;
  -- The session is held still first, as tag_session holds it, so a late yes
  -- and a new tag can never both take the last place.
  select * into v_s from public.practice_sessions where id = v_sid for update;
  select * into v_t from public.session_tags where id = t for update;
  if not found or v_t.tagged_id <> me then raise exception 'not_yours'; end if;
  update public.notifications set read = true where user_id = me and kind = 'session-tag' and target_id = v_t.session_id::text;
  if not coalesce(accept, false) then
    if v_t.status in ('pending', 'accepted') then
      update public.session_tags set status = case when v_t.status = 'accepted' then 'removed' else 'declined' end, responded_at = now() where id = t;
    end if;
    return null;
  end if;

  if v_t.status = 'removed' or v_t.tagger_dropped then raise exception 'removed'; end if;
  if v_s.kind not in ('match', 'practice') then raise exception 'not_a_match_or_practice'; end if;
  if v_t.status = 'declined'
     and (select count(*) from public.session_tags where session_id = v_sid and status in ('pending', 'accepted') and id <> t) >= public.session_tag_room(v_s.kind) then
    raise exception 'too_many';
  end if;

  if v_t.mirrored_session_id is not null then
    select * into v_m from public.practice_sessions where id = v_t.mirrored_session_id and user_id = me;
  elsif coalesce(add_to_mine, true) then
    -- A copy made for an earlier tag on the same session is used again.
    select * into v_m from public.practice_sessions where user_id = me and from_session_id = v_t.session_id order by created_at limit 1;
    if v_m.id is null then
      select left(coalesce(nullif(split_part(btrim(name), ' ', 1), ''), handle), 60) into v_name from public.profiles where id = v_t.tagger_id;
      insert into public.practice_sessions (user_id, day, minutes, kind, won, opponent, note, from_session_id)
      values (
        me, v_s.day, v_s.minutes, v_s.kind,
        -- The other side of the result: an opponent's win is your loss; a partner's is yours too.
        case when v_s.kind = 'match' and v_s.won is not null then case when v_t.role = 'partner' then v_s.won else not v_s.won end end,
        -- Who it was with, as your log says it: "vs Sam" across the net, "Practice with Sam"; a doubles partner as a note.
        case when not (v_s.kind = 'match' and v_t.role = 'partner') then v_name end,
        case when v_s.kind = 'match' and v_t.role = 'partner' then 'With ' || v_name end,
        v_t.session_id
      )
      returning * into v_m;
    end if;
  end if;

  update public.session_tags
     set status = 'accepted', responded_at = now(), mirrored_session_id = coalesce(v_m.id, mirrored_session_id)
   where id = t;
  return case when v_m.id is null then null else to_jsonb(v_m) end;
end $$;

-- ------------------------------------------------------------------ 2. the group on your copy's post
-- A session's accepted players, as a post shows them, or null for none.
--   * The logger's own session: as migration 62 (opponents first, then
--     partners, in the order tagged; a pair blocked either way left out; a
--     session changed to drills or fitness names nobody).
--   * Your copy of a session someone tagged you in (from_session_id): while
--     your tag on it is accepted, the logger and everyone else who accepted,
--     each from your side of the net, opponents first, the logger first on
--     their side. Left out: you; anyone blocked with you or with the logger;
--     anyone you could not tag yourself (session_tag_refusal_for: a teen who
--     does not follow you, an account gone). On a copy that is not a match
--     or a practice (yours to change), nobody.
create or replace function public.session_with(s uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.practice_sessions;
  v_t public.session_tags;
  v_mine text;
  v_out jsonb;
begin
  select * into v_c from public.practice_sessions where id = s;
  if not found then return null; end if;

  if v_c.from_session_id is null then
    select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'role', t.role)
                     order by (t.role = 'partner'), t.created_at, t.id)
      into v_out
      from public.session_tags t
      join public.practice_sessions ps on ps.id = t.session_id and ps.user_id = t.tagger_id
      join public.profiles p on p.id = t.tagged_id
     where t.session_id = s and t.status = 'accepted' and ps.kind in ('match', 'practice')
       and not public.is_blocked_between(t.tagger_id, t.tagged_id);
    return v_out;
  end if;

  -- A copy: your own tag on the session it came from, accepted.
  if v_c.kind not in ('match', 'practice') then return null; end if;
  select t.* into v_t
    from public.session_tags t
    join public.practice_sessions o on o.id = t.session_id and o.user_id = t.tagger_id
   where t.session_id = v_c.from_session_id and t.tagged_id = v_c.user_id and t.status = 'accepted'
     and o.kind in ('match', 'practice')
   limit 1;
  if not found then return null; end if;
  -- Your side: the logger's ('partner'), or across the net ('opponent'). On a practice everyone is "with".
  v_mine := v_t.role;

  with everyone as (
    -- The logger, on the logger's own side.
    select v_t.tagger_id as who, 'partner'::text as side, 0 as n, v_t.created_at as at, v_t.id as tid
    union all
    -- Everyone else who accepted, on the side they were tagged on.
    select o.tagged_id, o.role, 1, o.created_at, o.id
      from public.session_tags o
     where o.session_id = v_t.session_id and o.status = 'accepted' and o.tagged_id <> v_c.user_id
  )
  select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name,
                     'role', case when v_c.kind = 'match' and e.side <> v_mine then 'opponent' else 'partner' end)
                   order by (case when v_c.kind = 'match' and e.side <> v_mine then 0 else 1 end), e.n, e.at, e.tid)
    into v_out
    from everyone e
    join public.profiles p on p.id = e.who
   where e.who <> v_c.user_id
     and not public.is_blocked_between(v_t.tagger_id, e.who)
     and public.session_tag_refusal_for(v_c.user_id, e.who) is null;
  return v_out;
end $$;

-- Every post carrying the session gets its list again: the logger's own (as
-- migration 62), and now also every post made from a copy of it, by whoever
-- holds the copy. The posts trigger does the work.
create or replace function public.refresh_session_posts(s uuid, owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_act uuid;
  c record;
begin
  if s is null or owner is null then return; end if;
  select activity_id into v_act from public.practice_sessions where id = s and user_id = owner;
  update public.posts p set session = p.session || '{"with": "refresh"}'::jsonb
   where p.author_id = owner and p.session is not null and jsonb_typeof(p.session) = 'object'
     and (lower(p.session->>'sessionId') = s::text or (v_act is not null and lower(p.session->>'activityId') = v_act::text));
  -- The copies of it in other people's logs (only ever a logger's own session has any).
  for c in select id, user_id from public.practice_sessions where from_session_id = s and user_id <> owner loop
    update public.posts p set session = p.session || '{"with": "refresh"}'::jsonb
     where p.author_id = c.user_id and p.session is not null and jsonb_typeof(p.session) = 'object'
       and lower(p.session->>'sessionId') = c.id::text;
  end loop;
end $$;

-- A new name or handle shows on the posts that name them: as an accepted
-- player (migration 62), and now also as the logger, on posts made from copies.
create or replace function public.session_tags_on_rename() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select distinct session_id, tagger_id from public.session_tags
            where (tagged_id = new.id or tagger_id = new.id) and status = 'accepted' loop
    perform public.refresh_session_posts(r.session_id, r.tagger_id);
  end loop;
  return null;
end $$;

-- A block either way ends the tags between the two (pending or accepted;
-- migration 62). Now also: every post either of them made from a copy is
-- worked out again, so neither is named on the other's.
create or replace function public.session_tags_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  delete from public.session_tags
   where (tagger_id = new.blocker_id and tagged_id = new.blocked_id)
      or (tagger_id = new.blocked_id and tagged_id = new.blocker_id);
  for c in select id, user_id from public.practice_sessions
            where user_id in (new.blocker_id, new.blocked_id) and from_session_id is not null loop
    perform public.refresh_session_posts(c.id, c.user_id);
  end loop;
  return null;
end $$;

-- ------------------------------------------------------------------ 3. who may call
-- Server only (as 62 had them), plus the new helper.
revoke all on function public.session_tag_room(text) from public, anon, authenticated;
revoke all on function public.session_with(uuid) from public, anon, authenticated;
revoke all on function public.refresh_session_posts(uuid, uuid) from public, anon, authenticated;
revoke all on function public.session_tags_on_rename() from public, anon, authenticated;
revoke all on function public.session_tags_on_block() from public, anon, authenticated;
-- Signed-in players (unchanged).
revoke all on function public.tag_session(uuid, uuid, text) from public, anon;
grant execute on function public.tag_session(uuid, uuid, text) to authenticated;
revoke all on function public.respond_session_tag(uuid, boolean, boolean) from public, anon;
grant execute on function public.respond_session_tag(uuid, boolean, boolean) to authenticated;

commit;

-- ------------------------------------------------------------------ 4. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) Room on a practice and a match (expect 8, 3):
-- select public.session_tag_room('practice'), public.session_tag_room('match');
--
-- (b) Who may call what (expect tag_session and respond_session_tag true; the rest false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('tag_session', 'respond_session_tag', 'session_tag_room', 'session_with', 'refresh_session_posts') order by 1;
--
-- (c) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
