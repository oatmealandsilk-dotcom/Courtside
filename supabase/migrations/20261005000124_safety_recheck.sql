-- CourtSide · migration 124: the safety re-check of Oct 5 (after 105–123).
--
-- NOT APPLIED — needs the owner's OK, and a rolled-back test on the live
-- database first (the test that goes with it is described at the end). Run
-- it in the Supabase SQL editor as one piece. It is all-or-nothing: if a
-- check below fails, it stops and nothing at all changes. Safe to run more
-- than once.
--
-- ORDER: the app from this branch (fix/safety-recheck) should be on the
-- website and the phones first. If this runs before that, nothing breaks:
-- the only difference is that, until a phone has the new app, a teen's
-- profile shows on its Tagged tab only the session posts they made
-- themselves, not other players' posts of a session they were tagged on
-- (section 5). The new app works the same before and after this file.
--
-- What it fixes, in plain words:
--
-- 1. A suspended account goes quiet. Before, a suspended account could
--    still join other players' hits (and was added to the hit's group chat,
--    and the host was alerted), and its own open hit stayed up for others to
--    see and join. It could also still follow, ask to follow, like, vote,
--    mark replies helpful, start chats and groups, and each of those sent
--    the other person a notification (most with a phone alert). Now:
--      * every notification "from" a suspended account is dropped, whatever
--        sent it, and so is every "is up for a hit" / map alert from one;
--      * a suspended account cannot join a hit, follow, ask to follow,
--        like (posts, Instants, comments), vote in a poll, ask to join a
--        group, vote on threads, replies or tips, mark a reply helpful, or
--        start a new chat or group (a chat it already has still opens);
--      * its hits, and its place in "who's in", are hidden from everyone
--        but itself and admins (as 115 did for posts and comments), and
--        nobody can join one of its hits. All of it comes back unchanged
--        when the suspension is lifted.
--
-- 2. A stranger can no longer join an adult's hit to find out which teens
--    are in it. Before, anyone who joined a hit could see every teen who
--    had joined it (in "who's in" and in the hit's group chat), with the
--    court and the time, and could then leave again. Now:
--      * a player not known to be an adult shows in a hit's "who's in" only
--        to themselves, the host, and the people they follow (it used to be
--        anyone who joined the hit, and anyone who followed them);
--      * joining a hit needs every player already in it who is not known to
--        be an adult to follow you (the same rule as being put in a group
--        chat: the teen must follow the person). Otherwise the answer is
--        "That hit is not open to you." The host's own rule (you follow
--        each other) is unchanged.
--
-- 3. "Who's in" no longer leaks through live updates. Live updates of a row
--    being deleted skip the reading rules (Supabase sends the deleted row's
--    key to everyone listening), and the key of a hit's "who's in" row was
--    the hit plus the player, so anyone listening learned who left which
--    hit. Chat members had the same problem when someone left a chat. Each
--    row now has a random key of its own, so a deleted row says nothing.
--    The live updates themselves, and every app, work exactly as before.
--
-- 4. Strangers' words no longer reach a teen's lock screen. A comment,
--    reply or answer from someone a player not known to be an adult does not
--    follow still arrives as a notification ("Sam commented on your post"),
--    but without the stranger's words. From people they follow, nothing
--    changes. Adults: nothing changes.
--
-- 5. Posts stop naming teens to strangers. A post's session stats used to
--    list every player who said yes to a session tag, with the court and
--    the day, for anyone who could read the post. Now only known adults are
--    kept on the post itself; a teen is shown on it only to themselves, the
--    post's author, and the people the teen follows (their profile's Tagged
--    tab asks session_minor_posts). Posts already naming a teen are redone.
--
-- 6. A waitlist entry no longer credits an inviter by itself. Anyone could
--    put a stranger's email on the waitlist under a partner's link, and that
--    person's later sign-up was credited to the partner automatically. Now
--    the waitlist's match is only filled in at "Invited by?" in the app, and
--    counts once the player presses Continue (as 116 already did for a later
--    visit). Credits already made stay as they are (still correctable on the
--    player's first day).
--
-- 7. Reports have limits. One open report per person per thing (a repeat is
--    quietly dropped: it is already in the list), at most 20 reports an hour
--    from one person, and the admins' alert goes out only for the first open
--    report on a thing. Admins' own reports have no limit.
--
-- Not changed here (each is an owner decision or another file):
--   * The town position on profiles (city_lat, city_lng) is still readable
--     by any signed-in account until migration 121 runs (planned).
--   * The known ways to tell a teen apart listed by 109/118/122 (the shared
--     link page, the private switch, New on CourtSide, court pages, the
--     inviter follow, a hit's count): unchanged.
--   * A teen's own hits still show to the people who follow them (the
--     app's rule, owner decision 1 in src/features/hits/visible.ts).
--
-- Replaces join_hit, group_fits, open_conversation (109), file_notification
-- (98), send_map_alert (78), session_with (77), vote_question, vote_answer
-- (37), vote_tip (11), toggle_reply_helpful (8), apply_waitlist_referral
-- (116), stamp_report, notify_admins_of_report (115) and
-- private.join_shown_to_you (109), as they are live (each body checked
-- against the file it came from), and stops without changing anything if
-- any of them was changed since. After this has run, do not run 109, 116 or
-- 115 again (they would put the older versions back; 109 stops by itself).
-- Mentions nobody's age (known_adult only, as 109 requires). Does not touch
-- anything migration 117 (hidden words) or 121 checks.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- schema.function, its body's md5 as live on Oct 5, as this file leaves it.
  expected constant text[][] := array[
    ['public.join_hit',                'fe0811398f64cc2f145a62d12bc73a58', '11fa095b1f95cbd29e2a2b3f94b858a5'],
    ['public.group_fits',              'd38b5d2fd95a3dfbb80192e8bfe3708e', '18019ca34d47e8bd30f3c7ea75f7a1a3'],
    ['public.open_conversation',       '8866607ea290d350fcdf2805199da0ac', '5c5c39109eabcc8e2fd4e618f746e70f'],
    ['private.join_shown_to_you',      'ccf84032815473107b4f5f44bc2f064a', '2afb423e86fff2485181a68d87bfca5f'],
    ['public.file_notification',       '0b66f9e9dddb2a4713c3f2d1d9562b0d', '9a1064f38664816ef95bb51deebe2aa6'],
    ['public.send_map_alert',          '5001fc787e20679b6d0d5474c6d7bc93', '530f77f4b5aa6da3ef9a2b1e116c6f33'],
    ['public.session_with',            'e253965c8c4a56d62717771193e724b4', '71ac12aaac0d670610f7a31ff415a87f'],
    ['public.vote_question',           '1e8a150db1fdb954faf563f2a84ce146', '1ff7f719112e6cfe06891c6d30589fc0'],
    ['public.vote_answer',             '299ff4bfd4b81843ccc4afbcbbece5c8', 'f2a51e391c2a33e09dd8419ac5d354b4'],
    ['public.vote_tip',                '801b6c0f2f8302433009b59f7ec8ec19', 'd1224bf9cb804d9614e2b124650d795d'],
    ['public.toggle_reply_helpful',    'b76ecc0f589276bc9d7981d19cebab7e', 'bd40153b3280f9ce5ce621cce01fe72a'],
    ['public.apply_waitlist_referral', '1d5e8e0ade1fecaea41b3a875b186829', '159b1d135248ef4ccef9c47babd82ae4'],
    ['public.stamp_report',            '1ce3ffb22a85c4f1d84e8a1bc9b206d4', '52b9e650b2d0fdc0c6f2be6e93c8e6a9'],
    ['public.notify_admins_of_report', 'f740453f9013fa5747b3cbc756e98bef', '5194ffe25c7f8de9c807c6dfe501ce2b']
  ];
  -- Relied on and never rewritten here: exactly as live on Oct 5.
  kept constant text[][] := array[
    ['public.is_suspended',        '26f652f2bbe907f1e5ef2c709c310a6f'],
    ['public.refuse_if_suspended', '8944c809af395059c4a7d541a2feca01'],
    ['public.known_adult',         'a79e745befd4374ea124ccf1692145a2'],
    ['public.is_member',           'c50ea3878aac74a536c45317b2175aa8'],
    ['public.is_admin',            '538f9c94850c907e82b2a31dfba6fefe']
  ];
  -- Made by this file: absent before, or as this file leaves them.
  made constant text[][] := array[
    ['public.quiet_suspended_actor', '2a972da9b500cb08bf8476a54a9e819e'],
    ['public.session_minor_posts',   'ae903d0b92aa69a1bd364994633c71f8']
  ];
  i int;
  n int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regnamespace('private') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hit_requests' and column_name = 'joined_count')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'referral_from_waitlist')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'status')
     or to_regclass('public.report_evidence') is null
     or to_regclass('public.session_tags') is null
     or to_regprocedure('public.waitlist_suggestion(uuid)') is null then
    raise exception 'Migration 124 stopped before changing anything: migrations 95, 109, 115 and 116 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(expected[i][1], '.', 1) and p.proname = split_part(expected[i][1], '.', 2);
    if n <> 1 or now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(kept, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(kept[i][1], '.', 1) and p.proname = split_part(kept[i][1], '.', 2);
    if n <> 1 or now_is <> kept[i][2] then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(made, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(made[i][1], '.', 1) and p.proname = split_part(made[i][1], '.', 2);
    if n > 1 or (n = 1 and now_is <> made[i][2]) then
      wrong := wrong || made[i][1];
    end if;
  end loop;
  -- The rules and triggers this file builds on.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hit_joins'
                 and policyname = 'joins are visible' and cmd = 'SELECT' and qual ~ 'private\.join_shown_to_you')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.reports'::regclass and tgname = 'stamp_report'
                    and tgfoid = 'public.stamp_report()'::regprocedure and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.reports'::regclass and tgname = 'notify_admins_of_report'
                    and tgfoid = 'public.notify_admins_of_report()'::regprocedure and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.hit_joins'::regclass and tgname = 'count_hit_joins' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'credit_waitlist_referral' and not tgisinternal)
     or not exists (select 1 from pg_constraint where conrelid = 'public.conversation_members'::regclass and contype = 'p')
     or not exists (select 1 from pg_constraint where conrelid = 'public.hit_joins'::regclass and contype = 'p')
     -- Section 3 gives these two a random key named id: nothing else may be called that.
     or exists (select 1 from information_schema.columns where table_schema = 'public'
                and table_name in ('hit_joins', 'conversation_members') and column_name = 'id' and data_type <> 'uuid')
     -- Nothing else points at their keys.
     or exists (select 1 from pg_constraint where contype = 'f'
                and confrelid in ('public.hit_joins'::regclass, 'public.conversation_members'::regclass)) then
    wrong := wrong || 'the rules, triggers or keys of hit_joins, reports, profiles or conversation_members'::text;
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 124 stopped before changing anything: % changed since it was written (Oct 5). This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ===================================================== 1. suspended accounts go quiet

-- Every notification "from" a suspended account is dropped before it is
-- kept (and so before its phone alert), whatever filed it. Notices someone
-- gets about their own things (actor = themselves: a take-down, a refund, a
-- milestone, a workout) still arrive, and so does anything about a paid
-- coaching request (a booking, an answer): money has already moved there.
create or replace function public.quiet_suspended_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_suspended(new.actor_id) then return null; end if;
  return new;
end $$;
revoke all on function public.quiet_suspended_actor() from public, anon, authenticated;
drop trigger if exists quiet_suspended_actor on public.notifications;
create trigger quiet_suspended_actor before insert on public.notifications
  for each row when (new.actor_id is not null and new.actor_id is distinct from new.user_id
                     and new.target_kind is distinct from 'coaching-request')
  execute function public.quiet_suspended_actor();

-- The map and court alerts send their own phone alert next to the
-- notification, so they check too (as migration 78, plus that line).
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
  -- (124) A suspended account sets off no alerts.
  if public.is_suspended(actor) then return false; end if;
  if what not in ('map-friend-hit', 'map-new-hit', 'map-new-player', 'court-activity') then return false; end if;
  if what = 'map-friend-hit' and not (public.known_adult(actor) and public.known_adult(recipient)) then
    if not public.follow_each_other(recipient, actor) or not public.spot_shown_to(recipient, actor) then return false; end if;
  else
    if not public.known_adult(actor) then return false; end if;
    if v_grp = 'map' and not public.known_adult(recipient) then return false; end if;
    if v_grp = 'courts' and not public.known_adult(recipient) and not public.follow_each_other(recipient, actor) then return false; end if;
  end if;
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

-- Nothing new from a suspended account on the tables migrations 23, 60, 95
-- and 115 did not cover: follows and follow requests, likes, poll votes,
-- asking to join a group, joining a hit. (The trigger asks who is signed
-- in, so someone else accepting a suspended person's old request still
-- works; unfollowing and unliking are untouched.)
do $$
declare
  t text;
begin
  foreach t in array array['follows', 'follow_requests', 'post_likes', 'story_likes', 'comment_likes',
                           'story_comment_likes', 'poll_votes', 'feed_group_requests', 'hit_joins'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists refuse_if_suspended on public.%I', t);
      execute format('create trigger refuse_if_suspended before insert on public.%I for each row execute function public.refuse_if_suspended()', t);
    end if;
  end loop;
end $$;

-- Votes and "helpful" (migrations 8, 11, 37), each with the one line added.
create or replace function public.vote_question(q uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  if public.is_suspended(auth.uid()) then raise exception 'suspended'; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.questions where id = q;
  if r is null then return; end if;
  perform set_config('courtside.voting', 'on', true);
  update public.questions set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = q;
  perform set_config('courtside.voting', 'off', true);
end $$;
create or replace function public.vote_answer(a uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  if public.is_suspended(auth.uid()) then raise exception 'suspended'; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.answers where id = a;
  if r is null then return; end if;
  perform set_config('courtside.voting', 'on', true);
  update public.answers set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = a;
  perform set_config('courtside.voting', 'off', true);
end $$;
create or replace function public.vote_tip(t uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  if public.is_suspended(auth.uid()) then raise exception 'suspended'; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.tips where id = t;
  if r is null then return; end if;
  update public.tips set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = t;
end $$;
create or replace function public.toggle_reply_helpful(r uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if public.is_suspended(auth.uid()) then raise exception 'suspended'; end if;
  update public.coach_replies
    set helpful_by = case when auth.uid() = any(helpful_by) then array_remove(helpful_by, auth.uid()) else array_append(helpful_by, auth.uid()) end
    where id = r;
end $$;
grant execute on function public.vote_question(uuid, int) to authenticated;
grant execute on function public.vote_answer(uuid, int) to authenticated;
grant execute on function public.vote_tip(uuid, int) to authenticated;
grant execute on function public.toggle_reply_helpful(uuid) to authenticated;

-- A new chat (109's open_conversation, plus one line): a chat that already
-- exists still opens, so a suspended player can still read their messages.
create or replace function public.open_conversation(other uuid, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_id uuid;
begin
  if me is null or other is null or other = me then raise exception 'bad participants'; end if;
  select cm.conversation_id into found_id
    from public.conversation_members cm
    join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = other
    where cm.user_id = me
      and (select count(*) from public.conversation_members x where x.conversation_id = cm.conversation_id) = 2
      and not exists (select 1 from public.conversations c where c.id = cm.conversation_id and c.is_group)
    limit 1;
  if found_id is not null then return found_id; end if;
  -- (124) A suspended account starts no new chat.
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  if public.is_blocked_between(me, other) then
    raise exception 'blocked';
  end if;
  -- Anyone not known to be an adult gets the teen protection: they must follow you first.
  -- Unless they follow you, the answer depends on their age, so asking
  -- counts towards your day's limit (section 6, as open_to_you).
  if exists (select 1 from public.profiles where id = other)
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    if not (other = any (public.age_rule_budget(array[other]))) then
      raise exception 'age_rule_limit';
    end if;
    if not public.known_adult(other) then
      raise exception 'teen_closed';
    end if;
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;

-- Groups (109's group_fits, plus the first check): a suspended player makes
-- no group, adds nobody and joins no hit's chat. create_group,
-- add_group_members (and open_group, add_to_group) and join_hit all ask it
-- before anything is written or anyone is alerted.
create or replace function public.group_fits(adder uuid, members uuid[], newcomers uuid[])
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  asking uuid[];
begin
  -- (124) Whoever is asking, if suspended.
  if auth.uid() is not null and public.is_suspended(auth.uid()) then
    return 'suspended';
  end if;
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n, unnest(coalesce(members, '{}') || coalesce(newcomers, '{}')) m
    where m <> n and public.is_blocked_between(n, m)
  ) then
    return 'blocked';
  end if;
  -- Whether someone may be added depends on their age when they do not
  -- follow the adder. When a player asks this about other people, it counts
  -- towards that player's day's limit (section 6, as open_to_you); past it,
  -- the answer is 'age_rule_limit' whoever they are.
  if auth.uid() is not null then
    select coalesce(array_agg(distinct n), '{}') into asking
      from unnest(coalesce(newcomers, '{}')) n
      where n <> adder and n <> auth.uid()
        and exists (select 1 from public.profiles p where p.id = n)
        and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder);
    if cardinality(asking) > 0 then
      if not (asking <@ public.age_rule_budget(asking)) then
        return 'age_rule_limit';
      end if;
    end if;
  end if;
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n
    join public.profiles p on p.id = n
    where n <> adder and not public.known_adult(n)
      and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder)
  ) then
    return 'teen_closed';
  end if;
  return null;
end $$;

-- Hits: a suspended account's hits and joins are hidden from everyone but
-- itself and admins, beside each table's own reading rule (as 115).
drop policy if exists "suspended accounts are hidden" on public.hit_requests;
create policy "suspended accounts are hidden" on public.hit_requests as restrictive for select
  using (not public.is_suspended(author_id) or auth.uid() = author_id or public.is_admin());
drop policy if exists "suspended accounts are hidden" on public.hit_joins;
create policy "suspended accounts are hidden" on public.hit_joins as restrictive for select
  using (not public.is_suspended(user_id) or auth.uid() = user_id or public.is_admin());

-- ============================================ 1 and 2. joining a hit (109's, plus three checks)
create or replace function public.join_hit(hit uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  taken int;
  conv uuid;
  label text;
  in_chat uuid[];
  fits text;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- (124) A suspended account joins nothing.
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.cancelled then raise exception 'That hit is no longer on.'; end if;
  -- (124) Nor can anyone join a suspended account's hit (hidden from them too).
  if public.is_suspended(h.author_id) then raise exception 'That hit is no longer on.'; end if;
  if h.author_id = me then raise exception 'That is your own hit.'; end if;
  if h.starts_at < now() - interval '1 hour' then raise exception 'That hit has already happened.'; end if;
  if public.is_blocked_between(me, h.author_id) then raise exception 'blocked'; end if;
  -- When the answer below depends on the host's age (you are a known adult
  -- and you do not follow each other), asking counts towards your day's
  -- limit (section 6, as open_to_you).
  if public.known_adult(me)
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    if not (h.author_id = any (public.age_rule_budget(array[h.author_id]))) then
      raise exception 'age_rule_limit';
    end if;
  end if;
  -- Teen protection, as in chats: a player not known to be an adult only plays with people who follow each other.
  if (exists (select 1 from public.profiles p where p.id in (me, h.author_id) and not public.known_adult(p.id)))
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    raise exception 'teen_closed';
  end if;
  if exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return h.conversation_id; end if;
  -- (124) Everyone already in it (or in its chat) who is not known to be an
  -- adult must follow you, as for being put in a group chat. Only players
  -- you could not see in "who's in" can stop you, so this says nothing new.
  if exists (
    select 1 from (
      select j.user_id as who from public.hit_joins j where j.hit_id = hit
      union
      select m.user_id from public.conversation_members m where m.conversation_id = h.conversation_id
    ) x
    where x.who <> me and x.who <> h.author_id
      and not exists (select 1 from public.follows f where f.follower_id = x.who and f.following_id = me)
      and not public.known_adult(x.who)
  ) then
    raise exception 'That hit is not open to you.';
  end if;
  select count(*) into taken from public.hit_joins where hit_id = hit;
  if taken >= h.spots then raise exception 'That hit is full.'; end if;
  conv := h.conversation_id;
  if conv is not null then
    perform 1 from public.conversations where id = conv for update;
    select coalesce(array_agg(user_id), '{}') into in_chat from public.conversation_members where conversation_id = conv;
    if not (me = any (in_chat)) then
      if exists (select 1 from public.conversation_removals r where r.conversation_id = conv and r.user_id = me) then
        raise exception 'removed';
      end if;
      if cardinality(in_chat) >= public.group_cap() then raise exception 'That hit is full.'; end if;
      fits := public.group_fits(h.author_id, in_chat, array[me]);
      if fits is not null then raise exception '%', fits; end if;
    end if;
  end if;
  insert into public.hit_joins (hit_id, user_id) values (hit, me);
  if conv is null then
    label := 'Hit · ' || coalesce(h.place->>'name', 'Court');
    insert into public.conversations (title, is_group, created_by) values (left(label, 60), true, h.author_id) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id, role) values (conv, h.author_id, 'admin'), (conv, me, 'member') on conflict do nothing;
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set conversation_id = conv where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  else
    insert into public.conversation_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
  end if;
  -- The line is skipped rather than refusing the join (a suspended account
  -- cannot write it, nor can someone over the 30-messages-a-minute limit).
  begin
    perform public.post_group_event(conv, me, 'joined');
  exception when others then
    null;
  end;
  perform public.file_notification(h.author_id, me, 'hit-join', hit::text, 'hit-request', coalesce(h.place->>'name', 'your hit'), false);
  return conv;
end $$;

-- ==================================================== 2. who sees a teen in "who's in"
-- 109's helper, minus two ways in: "you joined the same hit" and "you
-- follow them". A player not known to be an adult shows to themselves, the
-- host, and the people they follow. Adults show to everyone who sees the hit.
create or replace function private.join_shown_to_you(hit uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or exists (select 1 from public.follows f where f.follower_id = who and f.following_id = auth.uid())))
$$;
revoke all on function private.join_shown_to_you(uuid, uuid) from public, anon;
grant execute on function private.join_shown_to_you(uuid, uuid) to authenticated;

-- ============================================================= 3. live updates
-- A live update about a deleted row skips the reading rules: Supabase sends
-- the deleted row's key to everyone listening. The key of a "who's in" row
-- was the hit plus the player, and of a chat member the chat plus the
-- player. Each now gets a random key of its own (id); the pair stays unique,
-- exactly as before. A deleted row's update then carries only that random
-- id. Nothing else changes: same rows, same rules, same live updates for
-- every app (old ones included), the same "already in" checks.
do $$
declare
  t record;
  pk text;
begin
  for t in select * from (values
      ('hit_joins', 'hit_id', 'user_id'),
      ('conversation_members', 'conversation_id', 'user_id')) as x (tbl, a, b)
  loop
    execute format('alter table public.%I add column if not exists id uuid not null default gen_random_uuid()', t.tbl);
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t.tbl)::regclass and conname = t.tbl || '_one_each') then
      execute format('alter table public.%I add constraint %I unique (%I, %I)', t.tbl, t.tbl || '_one_each', t.a, t.b);
    end if;
    select c.conname into pk from pg_constraint c
     where c.conrelid = ('public.' || t.tbl)::regclass and c.contype = 'p'
       and c.conkey is distinct from array[(select a.attnum from pg_attribute a where a.attrelid = ('public.' || t.tbl)::regclass and a.attname = 'id')]::int2[];
    if pk is not null then
      execute format('alter table public.%I drop constraint %I', t.tbl, pk);
      execute format('alter table public.%I add constraint %I primary key (id)', t.tbl, t.tbl || '_pkey');
    end if;
    -- What a deleted row's live update may carry: its key only.
    execute format('alter table public.%I replica identity default', t.tbl);
  end loop;
end $$;

-- ============================================== 4. strangers' words stay off a teen's phone
-- As migration 98, plus: someone not known to be an adult gets the words
-- (a comment, a reply, an answer…) only from people they follow. From
-- anyone else the notification comes without them. (Admins' report alerts
-- carry the server's own words, so they are left alone.)
create or replace function public.file_notification(recipient uuid, actor uuid, what text, target text, target_type text, words text, once boolean default true, again_after interval default null::interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  flat text;
begin
  if recipient is null or actor is null or recipient = actor or target is null then return; end if;
  if not exists (select 1 from public.profiles where id = recipient) then return; end if;
  if exists (select 1 from public.user_state where user_id = recipient and actor::text = any(blocked_ids)) then return; end if;
  -- The teen rule, as for chats and session tags (session_tag_refusal_for).
  if what = 'tag' and not public.known_adult(recipient)
     and not exists (select 1 from public.follows where follower_id = recipient and following_id = actor) then
    return;
  end if;
  flat := nullif(btrim(regexp_replace(coalesce(words, ''), '\s+', ' ', 'g')), '');
  -- (124) The words only from people they follow.
  if flat is not null and what <> 'report'
     and not exists (select 1 from public.follows where follower_id = recipient and following_id = actor)
     and not public.known_adult(recipient) then
    flat := null;
  end if;
  -- chr(8230) is the ellipsis character, written so it survives any copy and paste.
  if flat is not null and char_length(flat) > 80 then flat := left(flat, 79) || chr(8230); end if;
  if once and exists (
    select 1 from public.notifications
    where user_id = recipient and actor_id = actor and kind = what and target_id = target
      and target_kind = target_type and preview is not distinct from flat
      and (again_after is null or created_at > now() - again_after)
  ) then return; end if;
  if (select count(*) from public.notifications
      where actor_id = actor and created_at > now() - interval '1 minute' and created_at <= now()) >= 30 then return; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (recipient, actor, what, target, target_type, flat);
end $$;
revoke all on function public.file_notification(uuid, uuid, text, text, text, text, boolean, interval) from public, anon, authenticated;

-- ===================================================== 5. teens' names on posts
-- Migration 77's session_with, keeping only players known to be adults on
-- the post itself (both the logger's posts and the copies). Who played is
-- unchanged everywhere else: the tags, the logs, Your sessions.
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
       and not public.is_blocked_between(t.tagger_id, t.tagged_id)
       -- (124) Only known adults are kept on the post (session_minor_posts shows the rest to the right people).
       and public.known_adult(t.tagged_id);
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
     and public.session_tag_refusal_for(v_c.user_id, e.who) is null
     -- (124) Only known adults are kept on the post.
     and public.known_adult(e.who);
  return v_out;
end $$;
revoke all on function public.session_with(uuid) from public, anon, authenticated;

-- The posts that carry a session `who` played, with their entry, for the
-- people who may see it: `who` themselves, the post's author, and the people
-- `who` follows (never anyone blocked either way). The app's profile asks
-- this for its Tagged tab and puts the entry back on those posts. It never
-- depends on anyone's age: an adult's entries come back too (they are on
-- the posts already). Removed posts are left out; the app reads the posts
-- themselves through the usual reading rules.
create or replace function public.session_minor_posts(who uuid)
returns table (post_id uuid, entry jsonb)
language sql stable security definer set search_path = public as $$
  with played as (
    -- Sessions `who` said yes to a tag on, and their side of the net.
    select t.session_id, t.tagger_id as logger, t.role as side
      from public.session_tags t
      join public.practice_sessions o on o.id = t.session_id and o.user_id = t.tagger_id and o.kind in ('match', 'practice')
     where t.tagged_id = who and t.status = 'accepted'
       and not public.is_blocked_between(t.tagger_id, who)
  ),
  logged as (
    -- Sessions `who` logged themselves: others may have posted their copies.
    select o.id as session_id, o.user_id as logger, 'partner'::text as side
      from public.practice_sessions o
     where o.user_id = who and o.from_session_id is null and o.kind in ('match', 'practice')
  ),
  carried as (
    -- The logger's own posts of it.
    select p.id, p.author_id, p.created_at, pl.side as role
      from played pl
      join public.posts p on p.author_id = pl.logger and p.removed_at is null
       and jsonb_typeof(p.session) = 'object' and lower(p.session->>'sessionId') = pl.session_id::text
    union all
    -- The posts others made from their copies of it, while `who` follows them.
    select p.id, p.author_id, p.created_at,
           case when c.kind = 'match' and s.side <> mine.role then 'opponent' else 'partner' end
      from (select * from played union all select * from logged) s
      join public.session_tags mine on mine.session_id = s.session_id and mine.tagger_id = s.logger
       and mine.status = 'accepted' and mine.tagged_id <> who
      join public.practice_sessions c on c.from_session_id = s.session_id and c.user_id = mine.tagged_id
       and c.kind in ('match', 'practice')
      join public.posts p on p.author_id = c.user_id and p.removed_at is null
       and jsonb_typeof(p.session) = 'object' and lower(p.session->>'sessionId') = c.id::text
     where exists (select 1 from public.follows f where f.follower_id = who and f.following_id = c.user_id)
       and not public.is_blocked_between(c.user_id, who)
  )
  select x.id, jsonb_build_object('id', pr.id, 'handle', pr.handle, 'name', pr.name, 'role', x.role)
    from carried x
    join public.profiles pr on pr.id = who
   where auth.uid() is not null
     and not public.is_blocked_between(auth.uid(), who)
     and (auth.uid() = who or x.author_id = auth.uid()
          or exists (select 1 from public.follows v where v.follower_id = who and v.following_id = auth.uid()))
   order by x.created_at desc
   limit 300
$$;
revoke all on function public.session_minor_posts(uuid) from public, anon;
grant execute on function public.session_minor_posts(uuid) to authenticated;

-- Posts already naming someone not known to be an adult: their list is
-- worked out again (the way a tag change redoes it, refresh_session_posts).
update public.posts p set session = p.session || '{"with": "refresh"}'::jsonb
 where p.session is not null and jsonb_typeof(p.session) = 'object' and jsonb_typeof(p.session->'with') = 'array'
   and exists (select 1 from jsonb_array_elements(p.session->'with') w
               where case when (w->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          then not public.known_adult((w->>'id')::uuid) else true end);

-- ============================================== 6. the waitlist only suggests
-- Migration 116 credited the waitlist's match the moment the account was
-- made. The waitlist page is signed out and anyone can type anyone's email
-- there, so now it never credits by itself: my_inviter hands the same match
-- to the app as `suggested`, filled in at "Invited by?", and it counts once
-- the player presses Continue (claim_invite_code). An invite link the app
-- carried at sign-up (credit_waitlist_referral's first part) still credits
-- at once, as before.
create or replace function public.apply_waitlist_referral(u uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  -- (124) Suggest only (see above). Kept so credit_waitlist_referral needs no change.
  return null;
end $$;
revoke all on function public.apply_waitlist_referral(uuid) from public, anon, authenticated;

-- ================================================================ 7. reports
-- As migration 115, plus the limits: one open report per person per thing
-- (a repeat is dropped quietly: it is already in the list), at most 20 an
-- hour from one person. Admins' own reports (the take-down tool) have none.
-- Two reports from one person at the same moment wait for each other.
create or replace function public.stamp_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := split_part(new.target, ':', 1);
  thing text := split_part(new.target, ':', 2);
  tid uuid;
begin
  new.status := 'open';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.created_at := now();
  new.reason := left(coalesce(new.reason, ''), 300);
  -- (124) The limits.
  if new.reporter_id is not null and not public.is_admin() then
    perform pg_advisory_xact_lock(hashtextextended('stamp_report:' || new.reporter_id::text, 124));
    if exists (select 1 from public.reports r
               where r.reporter_id = new.reporter_id and r.target = new.target and r.status = 'open'
                 and (kind <> 'conversation' or r.reason is not distinct from new.reason)) then
      return null;
    end if;
    if (select count(*) from public.reports r
        where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 hour') >= 20 then
      return null;
    end if;
  end if;
  if thing ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then tid := thing::uuid; end if;
  if kind in ('post', 'hit', 'question', 'answer', 'comment', 'coach-question', 'coach-reply') then
    new.target_user_id := case kind
      when 'post' then (select p.author_id from public.posts p where p.id = tid)
      when 'hit' then (select s.author_id from public.stories s where s.id = tid)
      when 'question' then (select q.author_id from public.questions q where q.id = tid)
      when 'answer' then (select a.author_id from public.answers a where a.id = tid)
      when 'comment' then coalesce((select c.author_id from public.comments c where c.id = tid),
                                   (select c.author_id from public.story_comments c where c.id = tid))
      when 'coach-question' then (select q.author_id from public.coach_questions q where q.id = tid)
      when 'coach-reply' then (select r.coach_user_id from public.coach_replies r where r.id = tid)
    end;
  elsif kind = 'conversation' then
    if tid is null or not exists (
      select 1 from public.conversation_members m where m.conversation_id = tid and m.user_id = new.reporter_id) then
      raise exception 'not in this chat';
    end if;
    if new.target_user_id is not null and (new.target_user_id = new.reporter_id or not exists (
      select 1 from public.conversation_members m where m.conversation_id = tid and m.user_id = new.target_user_id)) then
      new.target_user_id := null;
    end if;
  end if;
  return new;
end $$;

-- The admins hear about the first open report on a thing; more reports of
-- it wait in the list (as migration 115 otherwise).
create or replace function public.notify_admins_of_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin uuid;
begin
  -- (124) Only the first open report on it.
  if exists (select 1 from public.reports r where r.target = new.target and r.status = 'open' and r.id <> new.id) then
    return new;
  end if;
  for admin in select id from public.profiles where is_admin loop
    perform public.file_notification(admin, new.reporter_id, 'report', new.id::text, 'report',
      case split_part(new.target, ':', 1)
        when 'post' then 'Reported a post' when 'hit' then 'Reported a hit' when 'profile' then 'Reported a profile'
        when 'question' then 'Reported a thread' when 'answer' then 'Reported a reply' when 'comment' then 'Reported a comment'
        when 'coach-question' then 'Reported a coach question' when 'coach-reply' then 'Reported a coach reply'
        when 'conversation' then case when new.reason like 'message:%' then 'Reported a message' else 'Reported a chat' end
        else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;

-- ------------------------------------------------------------- 8. last check
do $$
begin
  if (select count(*) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'p' and cardinality(c.conkey) = 1 and a.attname = 'id'
         and c.conrelid in ('public.hit_joins'::regclass, 'public.conversation_members'::regclass)) <> 2
     or (select count(*) from pg_constraint c
          where c.contype = 'u' and c.conname in ('hit_joins_one_each', 'conversation_members_one_each')) <> 2
     or exists (select 1 from pg_class where oid in ('public.hit_joins'::regclass, 'public.conversation_members'::regclass) and relreplident <> 'd')
     or exists (select 1 from public.hit_joins where id is null) or exists (select 1 from public.conversation_members where id is null)
     or (select count(*) from pg_trigger where tgname = 'refuse_if_suspended' and not tgisinternal
          and tgrelid in ('public.follows'::regclass, 'public.follow_requests'::regclass, 'public.post_likes'::regclass, 'public.hit_joins'::regclass)) <> 4
     or not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'quiet_suspended_actor' and not tgisinternal)
     or has_function_privilege('anon', 'public.session_minor_posts(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.session_minor_posts(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.file_notification(uuid, uuid, text, text, text, text, boolean, interval)', 'execute') then
    raise exception 'Migration 124 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------- 9. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) The new keys (expect two rows, each "id"):
-- select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where contype = 'p' and conrelid in ('public.hit_joins'::regclass, 'public.conversation_members'::regclass);
-- (b) The new triggers (expect 10 rows: nine refuse_if_suspended, one quiet_suspended_actor):
-- select tgrelid::regclass, tgname from pg_trigger where tgname in ('refuse_if_suspended', 'quiet_suspended_actor') and tgrelid::regclass::text in ('follows', 'follow_requests', 'post_likes', 'story_likes', 'comment_likes', 'story_comment_likes', 'poll_votes', 'feed_group_requests', 'hit_joins', 'notifications');
--
-- The rolled-back test that goes with this file (run before applying it):
-- scratchpad safety/r124/t124_rollback.sql — the whole file twice, then each
-- finding tried as the people involved, inside one transaction that is undone.
