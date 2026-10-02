-- 62: tag who you played with in a session from your log.
--
-- NOT APPLIED — needs the owner's OK. This file has not been run on the live
-- database. It adds two tables, new rules on who can read a post, new words
-- for the phone alert, and changes how a post's session stats are filled in.
-- Until it runs, the app keeps the Opponent box as free text only (it asks
-- once whether session_tags exists), shows no names from any post's session
-- stats (before this file a phone could write its own), and everything else
-- works as before.
--
-- What it does (the owner's words, Oct 2: "You can tag your opponent and if
-- they accept it becomes public"):
--
--   * session_tags: one row per person tagged in a session from someone's own
--     log (up to 3: a doubles partner and two opponents). Each row is
--     'pending' until the tagged person answers, then 'accepted' or
--     'declined'; 'removed' when they take an accepted tag back off. Only
--     the two people on a row can read it; nobody else ever learns that a
--     tag is waiting or was turned down. The app cannot write the table
--     directly: everything goes through the functions below.
--   * Who can tag: only the session's owner, only on a match or a practice,
--     and never on a copy of someone else's session. Never yourself; never
--     someone you are blocked with (either way); and someone not known to be
--     an adult (a teen, or an account with no age on file) only once they
--     follow you, the same teen protection as starting a chat. A suspended
--     account cannot tag. Tagging the same person on the same session again
--     changes nothing and never sends a second alert; someone who said no to
--     a session, or took their name off it, cannot be tagged on it again.
--   * Limits that deleting cannot reset: every new tag is written to
--     session_tag_log, which nothing in the app can change or empty. At most
--     30 new tags a day, and only the first 3 a day from one person to the
--     same person send an alert (past that the tag is still made and waits
--     in their Your sessions, quietly).
--   * The tagged person is told once ("Sam tagged you in a match"), in the
--     app and on their phone. They answer Accept or Decline; Accept can also
--     add the session to their own log (their result is the other side of
--     the tagger's: a win for Sam is a loss for an opponent, a win for a
--     doubles partner). That copy is theirs: it stays when the tag goes,
--     unless they ask for it to go too (practice_sessions.from_session_id
--     marks a copy, so accepting the same session again never makes two).
--     The alert stays when a tag is only taken off (so putting it back never
--     buzzes anyone twice) and goes when the session itself is deleted.
--     A no can become a yes later, while the session has room and the
--     tagger has not taken the no off their log; a tag taken back off is final.
--   * Public only after Accept, and only what was accepted. A post carrying
--     the session gets a "with" list of the ACCEPTED people, worked out here
--     and never taken from the phone: [{"id", "handle", "name", "role"}].
--     Pending and declined names never reach a post. With names on it, a
--     post's result and time on court are the logged session's own, not the
--     phone's. If the tagger later changes the session (its result, kind,
--     day or length) or switches someone's side of the net, the people who
--     accepted are asked again (no second buzz) and are off the posts
--     meanwhile. Accept, decline, removal (either side), a block between the
--     two, a deleted account and a changed name or handle all update every
--     post carrying the session at once. The place and the free-text notes
--     stay private, as before.
--   * An accepted person can open the posts they are on (as with a tag in a
--     post, migration 48), so the post can sit on their Tagged tab.
--
-- Replaces, as they are live (checked against the live database on Oct 2):
--   * fill_post_session_stats (migration 58): same rules, plus the "with"
--     list. It now runs with the database's own rights so it can read the
--     tags; it still only ever looks at the post author's own rows.
--   * push_for_notification (migration 56): one branch added for the new
--     'session-tag' kind. Migration 60 (map, not live) changes only this
--     function's trigger, and 61 (chat photos, not live) does not touch it,
--     so either can run before or after this file.
--   * the "read live posts" rule (migration 48): adds "or you are an
--     accepted player on its session".
-- If a migration after 59 changed any of these, merge by hand first. Once
-- this has run, do not run 56 or 58 again: they would put back the older
-- versions (58's would stop dropping a "with" list sent by a phone).
--
-- Needs 13, 18, 21, 23, 39, 48, 56, 58 (all live). Safe to run more than once.

-- ============================================================ 1. the table
create table if not exists public.session_tags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  tagger_id uuid not null references public.profiles (id) on delete cascade,
  tagged_id uuid not null references public.profiles (id) on delete cascade,
  -- In a match: an opponent, or a doubles partner. In a practice everyone is 'partner' ("with").
  role text not null default 'opponent' check (role in ('opponent', 'partner')),
  -- 'removed': the tagged person took an accepted tag back off. Final: they
  -- cannot put their name back by themselves, nor be tagged on it again.
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  -- The tagger took a no (or a removal) off their own log. The row stays so
  -- that person is never asked again on this session, and it can no longer
  -- be turned into a yes.
  tagger_dropped boolean not null default false,
  -- The tagged person's own copy in their log, when they asked for one.
  mirrored_session_id uuid references public.practice_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (session_id, tagged_id),
  check (tagger_id <> tagged_id)
);
create index if not exists session_tags_tagged on public.session_tags (tagged_id, status);
create index if not exists session_tags_tagger on public.session_tags (tagger_id, created_at desc);

-- Every new tag ever made, kept whatever happens to the tag or its session
-- afterwards, so the daily limits cannot be reset by deleting a session or
-- taking tags off and putting them back. Who tagged whom and when, nothing
-- else; rows older than two days are cleared as new ones come in. A deleted
-- account's rows go (as the tagger) or lose the name (as the one tagged,
-- still counting toward the tagger's day). Nobody reads or writes it from
-- the app.
create table if not exists public.session_tag_log (
  id bigint generated always as identity primary key,
  tagger_id uuid not null references public.profiles (id) on delete cascade,
  tagged_id uuid references public.profiles (id) on delete set null,
  alerted boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists session_tag_log_tagger on public.session_tag_log (tagger_id, created_at desc);
create index if not exists session_tag_log_pair on public.session_tag_log (tagger_id, tagged_id, created_at desc);
alter table public.session_tag_log enable row level security;
revoke all on public.session_tag_log from anon, authenticated;

-- On a copy in the tagged person's own log: the session it was copied from,
-- so accepting the same session again (after a tag was taken off and put
-- back) finds the copy instead of making a second one. Only a hint for its
-- owner's own log; nobody else can read it.
alter table public.practice_sessions add column if not exists from_session_id uuid;
create index if not exists practice_sessions_from on public.practice_sessions (user_id, from_session_id) where from_session_id is not null;

-- The two people on a row read it; nobody else, signed in or not. No one
-- writes it from the app: the functions below do.
alter table public.session_tags enable row level security;
drop policy if exists "your session tags" on public.session_tags;
create policy "your session tags" on public.session_tags for select
  using (auth.uid() is not null and (auth.uid() = tagger_id or auth.uid() = tagged_id));
revoke insert, update, delete, truncate on public.session_tags from anon, authenticated;

-- The tagger's "Waiting" turns to the name live.
do $$ begin
  begin alter publication supabase_realtime add table public.session_tags; exception when duplicate_object then null; end;
end $$;

-- ============================================================ 2. internal helpers
-- Why one person may not tag another, or null when they may. Never names a
-- reason the app could not already tell (blocking and age are public facts
-- to the two people involved).
create or replace function public.session_tag_refusal_for(tagger uuid, who uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when tagger is null then 'signed_out'
    when who is null or not exists (select 1 from public.profiles where id = who) then 'missing'
    when who = tagger then 'self'
    when exists (select 1 from public.profiles where id = tagger and suspended_at is not null) then 'suspended'
    when public.is_blocked_between(tagger, who) then 'blocked'
    -- Teen protection, as for a new chat: someone not known to be an adult must follow you first.
    when exists (select 1 from public.profiles where id = who and age_group is distinct from 'adult')
         and not exists (select 1 from public.follows where follower_id = who and following_id = tagger) then 'teen_closed'
    else null end
$$;

-- A session's accepted players, as a post shows them, or null for none.
-- Opponents first, then partners, each in the order they were tagged. A
-- pair blocked either way is left out even before the tag is removed, and
-- a session changed to drills or fitness names nobody.
create or replace function public.session_with(s uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'name', p.name, 'role', t.role)
                   order by (t.role = 'partner'), t.created_at, t.id)
  from public.session_tags t
  join public.practice_sessions ps on ps.id = t.session_id and ps.user_id = t.tagger_id
  join public.profiles p on p.id = t.tagged_id
  where t.session_id = s and t.status = 'accepted' and ps.kind in ('match', 'practice')
    and not public.is_blocked_between(t.tagger_id, t.tagged_id)
$$;

-- The author's own session a post's stats carry: the sessionId it names
-- when that session is the author's, else the one logged from its tracker
-- session. Never someone else's.
create or replace function public.post_session_ref(sess jsonb, author uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ps.id from public.practice_sessions ps
      where ps.id = case when sess->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (sess->>'sessionId')::uuid end
        and ps.user_id = author),
    (select ps.id from public.practice_sessions ps
      where ps.activity_id = case when sess->>'activityId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (sess->>'activityId')::uuid end
        and ps.user_id = author
      limit 1))
$$;

-- A post's stats with the "with" list worked out again (and no list when
-- nobody has accepted). The session's id is always written the database's
-- way (lower case), however the phone wrote it, so the post can always be
-- found again when a tag changes. With names on it:
--   * stats from your own log say what the log says (kind, result, time on
--     court), never the phone's word, so a name only ever sits next to what
--     that person accepted;
--   * stats from a tracker get the sessionId of the session they were logged
--     as, so the list can still be found and taken off after the tracker
--     row expires.
create or replace function public.put_session_with(sess jsonb, author uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ref uuid;
  v_with jsonb;
  v_ps public.practice_sessions;
  v_out jsonb := sess - 'with';
begin
  if sess is null or jsonb_typeof(sess) <> 'object' then return sess; end if;
  v_ref := public.post_session_ref(v_out, author);
  if v_ref is null then return v_out; end if;
  if v_out ? 'sessionId' then v_out := v_out || jsonb_build_object('sessionId', v_ref::text); end if;
  v_with := public.session_with(v_ref);
  if v_with is null then return v_out; end if;
  if not (v_out ? 'activityId') then
    select * into v_ps from public.practice_sessions where id = v_ref;
    v_out := (v_out - 'won')
      || jsonb_build_object(
           'kind', v_ps.kind,
           'minutes', v_ps.minutes,
           'focus', case when v_ps.kind = 'match' and v_ps.won is not null then 'Match · ' || case when v_ps.won then 'Won' else 'Lost' end else initcap(v_ps.kind) end)
      || case when v_ps.kind = 'match' and v_ps.won is not null then jsonb_build_object('won', v_ps.won) else '{}'::jsonb end;
  end if;
  return v_out || jsonb_build_object('sessionId', v_ref::text, 'with', v_with);
end $$;

-- Every post by the session's owner carrying it gets its list again. The
-- posts trigger below does the work: a change to nothing but "with" makes
-- it work the list out again and leave the rest of the stats alone. The id
-- is compared in lower case too, for any post saved before ids were always
-- written that way.
create or replace function public.refresh_session_posts(s uuid, owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_act uuid;
begin
  if s is null or owner is null then return; end if;
  select activity_id into v_act from public.practice_sessions where id = s and user_id = owner;
  update public.posts p set session = p.session || '{"with": "refresh"}'::jsonb
   where p.author_id = owner and p.session is not null and jsonb_typeof(p.session) = 'object'
     and (lower(p.session->>'sessionId') = s::text or (v_act is not null and lower(p.session->>'activityId') = v_act::text));
end $$;

-- ============================================================ 3. post stats (migration 58's, plus "with")
-- Posts are public, so a post's tracker stats are rebuilt here from the
-- private row rather than trusted from the phone: time on court and where it
-- came from, heart rate only when the author sent a maxHr key and is a
-- confirmed adult, never a start time, device, calories or Strain, and never
-- offered for CourtSide's Instagram. New: the "with" list is always the
-- server's (whatever the phone sent is dropped), and only the author's own
-- session ever gives one. Runs with the database's rights to read the tags,
-- but only ever looks at the post author's own rows.
create or replace function public.fill_post_session_stats() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_a public.detected_activities; v_adult boolean; v_src text; v_s jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' and old.session is not null and jsonb_typeof(old.session) = 'object'
     and (new.session - 'with') is not distinct from (old.session - 'with') then
    -- Nothing changed but (at most) the list: keep the stats, work the list out again.
    if new.session is distinct from old.session then new.session := public.put_session_with(new.session, new.author_id); end if;
    if new.session ? 'activityId' then new.feature_ok := false; end if;
    return new;
  end if;
  if pg_column_size(new.session) > 4000 then raise exception 'session too large'; end if;
  if not (new.session ? 'activityId') then
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  v_adult := coalesce((select age_group = 'adult' from public.profiles where id = new.author_id), false);
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', 'Tennis', 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
  if v_adult and new.session ? 'maxHr' then v_s := v_s || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr)); end if;
  if (new.session->>'intensity') in ('1', '2', '3', '4', '5') then v_s := v_s || jsonb_build_object('intensity', (new.session->>'intensity')::int); end if;
  new.session := public.put_session_with(v_s, new.author_id);
  new.feature_ok := false;
  return new;
end $$;
drop trigger if exists fill_post_session_stats on public.posts;
create trigger fill_post_session_stats before insert or update of session, feature_ok on public.posts for each row execute function public.fill_post_session_stats();

-- Finding the posts someone is an accepted player on (their Tagged tab).
create index if not exists posts_session_with on public.posts using gin ((session->'with') jsonb_path_ops);

-- Who can read a post (migration 48's rule): an accepted player on its
-- session can open it too, like someone tagged in it. Everything else stays.
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id)
    and (public.can_view(author_id) or auth.uid() = any(tagged_user_ids)
         or (session->'with') @> jsonb_build_array(jsonb_build_object('id', auth.uid())))
    and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));

-- ============================================================ 4. keeping posts right
-- A tag accepted, declined, removed, or its role changed: every post carrying
-- the session, at once. Deleting a row (removal, a block, a deleted session
-- or account) does the same.
create or replace function public.session_tags_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted' then perform public.refresh_session_posts(old.session_id, old.tagger_id); end if;
    -- The session itself was deleted: its alert has nothing left to open. (A
    -- tag only taken off keeps its alert, so putting it back never alerts again.)
    if not exists (select 1 from public.practice_sessions where id = old.session_id) then
      delete from public.notifications where user_id = old.tagged_id and kind = 'session-tag' and target_id = old.session_id::text;
    end if;
    return old;
  end if;
  if (old.status = 'accepted' or new.status = 'accepted')
     and (old.status is distinct from new.status or old.role is distinct from new.role) then
    perform public.refresh_session_posts(new.session_id, new.tagger_id);
  end if;
  return new;
end $$;
drop trigger if exists session_tags_changed on public.session_tags;
create trigger session_tags_changed after update or delete on public.session_tags
  for each row execute function public.session_tags_changed();

-- A block either way ends the tags between the two (pending or accepted).
-- They do not come back on unblocking, like a follow.
create or replace function public.session_tags_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.session_tags
   where (tagger_id = new.blocker_id and tagged_id = new.blocked_id)
      or (tagger_id = new.blocked_id and tagged_id = new.blocker_id);
  return null;
end $$;
drop trigger if exists session_tags_on_block on public.blocks;
create trigger session_tags_on_block after insert on public.blocks
  for each row execute function public.session_tags_on_block();

-- The tagger changes what the session was (its kind, result, day or
-- length) after people accepted: what they said yes to is not what it says
-- any more, so they are asked again. Their tag goes back to waiting (their
-- name comes off the posts meanwhile) and their alert shows as new in the
-- app, without a second buzz. On anything but a match everyone is "with".
create or replace function public.session_tags_on_session_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind is distinct from old.kind and new.kind <> 'match' then
    update public.session_tags set role = 'partner' where session_id = new.id and role <> 'partner';
  end if;
  update public.notifications n set read = false
    from public.session_tags t
   where t.session_id = new.id and t.status = 'accepted'
     and n.user_id = t.tagged_id and n.kind = 'session-tag' and n.target_id = new.id::text;
  update public.session_tags set status = 'pending', responded_at = null where session_id = new.id and status = 'accepted';
  return null;
end $$;
drop trigger if exists session_tags_on_session_edit on public.practice_sessions;
create trigger session_tags_on_session_edit after update of kind, won, day, minutes on public.practice_sessions
  for each row when (old.kind is distinct from new.kind or old.won is distinct from new.won or old.day is distinct from new.day or old.minutes is distinct from new.minutes)
  execute function public.session_tags_on_session_edit();

-- A new name or handle shows on the posts they accepted.
create or replace function public.session_tags_on_rename() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select session_id, tagger_id from public.session_tags where tagged_id = new.id and status = 'accepted' loop
    perform public.refresh_session_posts(r.session_id, r.tagger_id);
  end loop;
  return null;
end $$;
drop trigger if exists session_tags_on_rename on public.profiles;
create trigger session_tags_on_rename after update of name, handle on public.profiles
  for each row when (old.name is distinct from new.name or old.handle is distinct from new.handle)
  execute function public.session_tags_on_rename();

-- ============================================================ 5. what the app calls
-- Why you may not tag this person, or null when you may (for greying out a
-- name before trying). The same check tag_session makes.
create or replace function public.session_tag_refusal(who uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.session_tag_refusal_for(auth.uid(), who)
$$;

-- Tag someone on a session of yours. Returns the tag's id. Tagging someone
-- already on it returns the same id; nobody is told twice. Switching an
-- accepted person's side of the net asks them again (back to waiting, no
-- second buzz): they said yes to being an opponent, not a partner.
-- Refusals, as the error message: 'not_your_session', 'copy',
-- 'not_a_match_or_practice', 'bad_role', 'self', 'missing', 'suspended',
-- 'blocked', 'teen_closed', 'declined', 'too_many', 'rate_limited'.
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
  -- Held still while it is counted, so two quick taps cannot make a fourth.
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
  if (select count(*) from public.session_tags where session_id = s and status in ('pending', 'accepted')) >= 3 then
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

-- Take a tag off.
--   The tagger (the session's owner): a waiting or accepted tag goes. A no
--   (or a tag the other person took back off) stays, marked as taken off
--   your log: that person is never asked again on this session and can no
--   longer turn it into a yes.
--   The tagged person: a waiting tag becomes a no; an accepted one becomes
--   'removed' (final: they cannot put their name back by themselves). Their
--   own copy of the session stays unless drop_mine.
-- Anyone else: 'not_yours'. Already gone: nothing happens.
create or replace function public.untag_session(t uuid, drop_mine boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_t public.session_tags;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into v_t from public.session_tags where id = t for update;
  if not found then return; end if;
  if v_t.tagger_id = me then
    if v_t.status in ('pending', 'accepted') then delete from public.session_tags where id = t;
    else update public.session_tags set tagger_dropped = true where id = t;
    end if;
    return;
  end if;
  if v_t.tagged_id <> me then raise exception 'not_yours'; end if;
  update public.session_tags
     set status = case v_t.status when 'pending' then 'declined' when 'accepted' then 'removed' else v_t.status end,
         responded_at = case when v_t.status in ('pending', 'accepted') then now() else responded_at end,
         mirrored_session_id = case when coalesce(drop_mine, false) then null else mirrored_session_id end
   where id = t;
  if coalesce(drop_mine, false) and v_t.mirrored_session_id is not null then
    delete from public.practice_sessions where id = v_t.mirrored_session_id and user_id = me;
  end if;
  update public.notifications set read = true where user_id = me and kind = 'session-tag' and target_id = v_t.session_id::text;
end $$;

-- Accept or decline a tag of you. Accept with add_to_mine (the default) also
-- puts the session in your own log once: same day, length and kind, your
-- side of the result, and who it was with (their first name, as private
-- text, like any session you log). Returns that session of yours (as the
-- table's row), or null.
-- A no can still become a yes, while the session has room for you (3 at
-- most) and the tagger has not taken the no off their log. A tag you took
-- back off ('removed') cannot: 'removed'. Declining an accepted tag is the
-- same as taking it back off.
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
     and (select count(*) from public.session_tags where session_id = v_sid and status in ('pending', 'accepted') and id <> t) >= 3 then
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

-- Every tag you made or that names you, newest first, with what the tagged
-- person needs for the sheet: the kind, the day, the length, and for a match
-- the result from YOUR side (mirrored when you are the one tagged). Never the
-- tagger's notes or free-text opponent. mirrored_session_id is only ever
-- your own copy (null on tags you made). dropped: the tagger took a no off
-- their log (it can no longer be answered).
drop function if exists public.my_session_tags();
create function public.my_session_tags()
returns table (
  id uuid, session_id uuid, tagger_id uuid, tagged_id uuid, role text, status text, dropped boolean,
  mirrored_session_id uuid, created_at timestamptz, responded_at timestamptz,
  kind text, day date, minutes int, won boolean
) language sql stable security definer set search_path = public as $$
  select t.id, t.session_id, t.tagger_id, t.tagged_id, t.role, t.status, t.tagger_dropped,
         case when t.tagged_id = auth.uid() then t.mirrored_session_id end,
         t.created_at, t.responded_at,
         s.kind, s.day, s.minutes,
         case when t.tagger_id = auth.uid() then s.won
              when s.kind = 'match' and s.won is not null then case when t.role = 'partner' then s.won else not s.won end end
  from public.session_tags t
  join public.practice_sessions s on s.id = t.session_id
  where auth.uid() is not null and (t.tagger_id = auth.uid() or t.tagged_id = auth.uid())
  order by t.created_at desc, t.id
$$;

-- ============================================================ 6. phone alerts know the new kind
-- Migration 56's version (the live one, checked Oct 2), with one branch
-- added: 'session-tag' says "Sam tagged you in a match" (or "in a practice")
-- and opens Your sessions on that tag.
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
begin
  if new.kind = 'coach-application' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-apply');
    return new;
  end if;
  if new.kind = 'refund' then
    perform public.send_push(new.user_id, 'CourtSide', new.preview, '/coach-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'milestone' then
    select coalesce(push_likes, true) into likes_on from public.user_state where user_id = new.user_id;
    if likes_on is not false then
      perform public.send_push(new.user_id, 'Your post is taking off', 'It just passed ' || coalesce(new.preview, 'a milestone') || '.', '/post/' || new.target_id);
    end if;
    return new;
  end if;
  if new.kind = 'posted' or new.user_id = new.actor_id then return new; end if;
  if new.kind = 'hit-match' then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' is also looking for a hit', coalesce(new.preview || '. ', '') || 'Message them?', '/hit-request/' || new.target_id);
    return new;
  end if;
  if new.kind = 'session-tag' then
    select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
    perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' tagged you in a ' || case when new.preview = 'match' then 'match' else 'practice' end,
      'Accept or decline.', '/your-sessions?tag=' || new.target_id);
    return new;
  end if;
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind in ('like', 'upvote', 'upvote-reply') and likes_on is false then return new; end if;
  if new.kind in ('coach-reply', 'coach-answer') and coach_on is false then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'instant' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'instant' else 'post' end
    when 'comment-reply' then 'replied to your comment'
    when 'answer' then 'replied to your thread'
    when 'coach-reply' then 'answered your question'
    when 'coach-answer' then 'answered your request'
    when 'booking' then 'booked you'
    when 'helpful' then 'found your reply helpful'
    when 'share' then 'shared your post'
    when 'follow' then 'started following you'
    when 'tag' then 'tagged you in a post'
    when 'follow-request' then 'asked to follow you'
    when 'follow-accepted' then 'accepted your follow request'
    when 'upvote' then 'upvoted your thread'
    when 'upvote-reply' then 'upvoted your reply'
    when 'joined' then 'just joined CourtSide near you'
    when 'hit-join' then 'is in for your hit'
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted', 'joined') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    when new.target_kind = 'hit-request' then '/hit-request/' || new.target_id
    else '/notifications' end;
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;

-- ============================================================ 7. tidy what was there
-- Before this file the phone could have put its own "with" into a post's
-- stats. Every post that has one gets the server's list instead (none,
-- the first time this runs). Running it again only works the lists out again.
update public.posts set session = session - 'with' where session is not null and jsonb_typeof(session) = 'object' and session ? 'with';

-- ============================================================ 8. who may call what
-- Server only.
revoke all on function public.session_tag_refusal_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.session_with(uuid) from public, anon, authenticated;
revoke all on function public.post_session_ref(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.put_session_with(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.refresh_session_posts(uuid, uuid) from public, anon, authenticated;
revoke all on function public.session_tags_changed() from public, anon, authenticated;
revoke all on function public.session_tags_on_block() from public, anon, authenticated;
revoke all on function public.session_tags_on_rename() from public, anon, authenticated;
revoke all on function public.session_tags_on_session_edit() from public, anon, authenticated;
-- Signed-in players.
revoke all on function public.session_tag_refusal(uuid) from public, anon;
grant execute on function public.session_tag_refusal(uuid) to authenticated;
revoke all on function public.tag_session(uuid, uuid, text) from public, anon;
grant execute on function public.tag_session(uuid, uuid, text) to authenticated;
revoke all on function public.untag_session(uuid, boolean) from public, anon;
grant execute on function public.untag_session(uuid, boolean) to authenticated;
revoke all on function public.respond_session_tag(uuid, boolean, boolean) from public, anon;
grant execute on function public.respond_session_tag(uuid, boolean, boolean) to authenticated;
revoke all on function public.my_session_tags() from public, anon;
grant execute on function public.my_session_tags() to authenticated;

-- ============================================================ 9. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The new table and its rule (expect session_tags, row security on, one rule "your session tags"):
-- select c.relname, c.relrowsecurity, (select string_agg(policyname, ', ') from pg_policies where tablename = 'session_tags') from pg_class c where c.relname = 'session_tags';
--
-- (b) Who may call what (expect tag_session, untag_session, respond_session_tag, my_session_tags, session_tag_refusal true; session_with and refresh_session_posts false):
-- select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('tag_session', 'untag_session', 'respond_session_tag', 'my_session_tags', 'session_tag_refusal', 'session_with', 'refresh_session_posts') order by 1;
--
-- (c) No post carries a "with" list yet (expect 0 the first time):
-- select count(*) from posts where session ? 'with';
--
-- (d) No function name exists twice (expect no rows):
-- select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace group by 1 having count(*) > 1;
--
-- (e) The tag log cannot be read from the app (expect false, false):
-- select has_table_privilege('authenticated', 'public.session_tag_log', 'select'), has_table_privilege('anon', 'public.session_tag_log', 'select');
