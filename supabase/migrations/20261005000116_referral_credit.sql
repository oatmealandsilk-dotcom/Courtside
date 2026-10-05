-- CourtSide · migration 116: invite credit that survives the trip to the app
-- (Oct 5, owner: "make sure the credits from referrals transfer").
--
-- What it is for: someone opens a player's link (courtsidebase.com/?ref=om,
-- app.courtsidebase.com/join?ref=om, or a waitlist friend's ?r=code), then
-- installs the iPhone app from TestFlight, which cannot carry the link. The
-- player who shared it should still be credited (profiles.referred_by). The
-- checks on Oct 5 found the ways that credit was being lost; this fixes the
-- database half of them. In plain words:
--
-- 1. A friend's waitlist link (?r=code) now credits that friend in the app,
--    once the friend has an account with the email they joined the list
--    with. Before, it only moved them up the list. Only a list entry made
--    before the friend's account counts, so an entry someone adds later for
--    an existing account's email never points at that account.
-- 2. Someone who made their account first and left their email on the
--    website afterwards (within their first day) gets that link's player
--    filled in at "Invited by?". Nothing is credited until they press
--    Continue themselves: the website is signed out and cannot tell whose
--    email it is given, so it never credits an account on its own.
-- 3. Someone already on the list (from Instagram, say) who later comes
--    through a player's or a friend's link with the same email: that link is
--    kept to one side (later_source, later_code) and filled in at "Invited
--    by?" the same way. The first visit's label and code are never changed
--    from the website, so nobody can move someone else's credit to themselves.
-- 4. A label only credits whoever held that handle when the link was used.
--    Before, anyone could make an account called "instagram" and collect
--    every Instagram visitor. A player who changes handle after sharing is
--    still credited (handle_history), but only for the handle they really
--    held then. Our own campaign labels (instagram, reddit, qr...) never
--    credit anyone, and can no longer be taken as handles.
-- 5. The owner's own (admin) accounts are credited from the waitlist like
--    everyone else, the same as a typed code or a join link already were.
--    The page promised it; the waitlist was the one route that refused.
-- 6. The invite link rides along with an email sign-up (the app sends it as
--    invited_by), so the credit is made the moment the account is, even if
--    the confirmation email is opened in another browser or a day later.
-- 7. "Invited by?" accepts a pasted link (…/join?ref=om, courtsidebase.com/
--    ?ref=om, a friend's courtsidebase.com/?r=code, a profile link) and
--    ignores spaces and @, instead of saying "No player with that handle".
-- 8. Someone credited from the waitlist can still correct it on their first
--    day: my_inviter says canSet for that guess, and the app shows the box.
-- 9. "Came back on a later day" (part of what counts an invited player for
--    the partner payout) now means at least 20 hours after joining, not just
--    a different UTC date: a 7:30pm sign-up in New York opened again at
--    8:05pm no longer counts as a second day. Opening the app (app_opens,
--    migration 110) now counts as coming back. Players already counted stay
--    counted.
-- 10. The inviter's list says "needs to finish signing up" for someone who
--    never started setup (it skipped that step for brand-new accounts).
-- 11. The waitlist only hands out someone's ?r= link when their email is
--    new to the list. Typing an email that is already there says "You're
--    already in" without that person's link, which would otherwise name
--    their account once they have one.
--
-- Nothing here changes who is paid for players already counted, and
-- nothing is sent to anyone. Needs migration 110 (app_opens). Stops before
-- changing anything if a function it replaces was changed since it was
-- written. Safe to run more than once.

begin;

-- ------------------------------------------------------------------ 0. check
-- md5 of each function's body: as it is live (Oct 5), or as this file leaves it.
-- Functions this file adds: absent, or as this file leaves them.
do $$
declare
  expected constant text[][] := array[
    ['claim_invite_code', '28f934e382957e2c13e4b11f64bea003', '73b84c28c2374b8b44eb5ee613746708'],
    ['claim_referral', '584dc321ad018c378d549eac78a7dc2d', 'f2178ab9f1ccdd859150596ccd50f2d2'],
    ['credit_waitlist_referral', '4e3a3cff5127de1a410720a73f687480', 'dccc282d1e9228d9389b37f20a3f984b'],
    ['invite_second_day', '793f5a931a1ba756b960e0f9cb114304', 'b2da94c30b820977f86e3b77c8ceb0f7'],
    ['invite_set_up', '2ef2c9b0a894c854d4211d744e5642c8', 'd018f637b03fea455abc0388e7470b83'],
    ['join_waitlist', '64d5eda5c63c80032f2571412aa770d4', '78d77b64b4c1fa2642280bf7d8e00a9d'],
    ['my_inviter', '16d22368d0429efae960f454fb35c99c', '071811b9b44c3a31def77d371056604f'],
    ['handle_status', '846b0c25adef4458209d6028e5c9e6d7', 'dc5972622a19912d6d16d066bce59e0e'],
    ['handle_new_user', 'db81bca1544a16ac8a22d052ebf11a44', '5006fdfb55dc8fb2e31820ca59334562'],
    ['campaign_label', 'absent', '642dd68675eacf631aed884f7f62ad31'],
    ['invite_handle_from', 'absent', 'ec0d382c48089c9642212bd2b3bb8e5d'],
    ['waitlist_label_owner', 'absent', '0abe7debb1ca91e4d4bcdcb50bd3bdef'],
    ['waitlist_code_owner', 'absent', '37c73dfe2dfe95a3154575d3fed08d91'],
    ['waitlist_inviter', 'absent', '265642ba676df96cfd680ec94affe254'],
    ['waitlist_suggestion', 'absent', 'eb8fef1319d6043ffbd269f77dd22ff9'],
    ['apply_waitlist_referral', 'absent', '1d5e8e0ade1fecaea41b3a875b186829']
  ];
  i int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.app_opens') is null or to_regclass('public.handle_history') is null then
    raise exception 'Migration 116 stopped before changing anything: migrations 34 and 110 have to run first.';
  end if;
  for i in 1 .. array_length(expected, 1) loop
    select coalesce(max(md5(p.prosrc)), 'absent') into now_is from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1];
    if now_is not in (expected[i][2], expected[i][3]) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 116 stopped before changing anything: % changed since it was written. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- When the waitlist row's label was set: the time a handle is checked against.
alter table public.waitlist add column if not exists source_at timestamptz;
update public.waitlist set source_at = created_at where source_at is null and source is not null;
-- (3) A later visit's player label or friend code: only ever offered to the
-- person to confirm, never credited by itself.
alter table public.waitlist add column if not exists later_source text;
alter table public.waitlist add column if not exists later_source_at timestamptz;
alter table public.waitlist add column if not exists later_code text;

-- (4) Our own campaign labels: the same list as waitlist.html's CAMPAIGNS,
-- without the people's names on it (they may sign up as themselves).
create or replace function public.campaign_label(p text)
returns boolean language sql immutable set search_path = public as $$
  select lower(btrim(coalesce(p, ''))) = any (array[
    'instagram', 'ig', 'insta', 'courtsidebase', 'courtside', 'reddit', 'tiktok', 'facebook', 'fb',
    'twitter', 'threads', 'youtube', 'snapchat', 'whatsapp', 'discord', 'linktree', 'linkinbio', 'bio',
    'email', 'newsletter', 'qr', 'flyer', 'poster', 'google', 'share', 'web', 'app', 'testflight', 'beta'])
$$;
revoke all on function public.campaign_label(text) from public, anon, authenticated;

-- (4) Nobody can take a campaign label as a handle: the sign-up check and a
-- handle change say it is taken. An existing 2-letter handle (tp) also says
-- taken, so the website can tell a real ?ref=tp from a made-up one.
create or replace function public.handle_status(p_handle text)
returns text language plpgsql stable security definer set search_path = public as $$
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
  if exists (
    select 1 from public.handle_history
    where handle = wanted and released_at > now() - interval '14 days' and user_id is distinct from me
  ) then
    return 'held';
  end if;
  return 'ok';
end $$;

-- (4) A sign-up asking for a campaign label gets a number added, as a taken one does.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  final  text := regexp_replace(wanted, '[^a-z0-9_]', '', 'g');
begin
  if char_length(final) < 2 then final := 'player'; end if;
  final := left(final, 20);
  -- Keep the handle unique without failing the sign-up.
  while exists (select 1 from public.profiles where handle = final)
     or exists (select 1 from public.handle_history where handle = final and released_at > now() - interval '14 days')
     or public.campaign_label(final) loop
    final := left(final, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, final, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(replace(final, '_', ' '))));
  return new;
end $$;

-- (7) The handle in whatever was typed or pasted into "Invited by?". A
-- friend's waitlist link comes back as r=<code> (claim_invite_code reads it).
create or replace function public.invite_handle_from(p_text text)
returns text language plpgsql immutable set search_path = public as $$
declare
  t text := lower(btrim(coalesce(p_text, '')));
begin
  if t ~ 'ref=' then
    -- …/join?ref=om, courtsidebase.com/?ref=om (an @ may be written as %40)
    t := coalesce(substring(t from 'ref=(?:@|%40)*([a-z0-9_]+)'), t);
  elsif t ~ '(^|[?&])r=[0-9a-f]{8}([^0-9a-f]|$)' then
    -- courtsidebase.com/?r=1a2b3c4d: a friend's waitlist link
    return 'r=' || substring(t from '(?:^|[?&])r=([0-9a-f]{8})(?:[^0-9a-f]|$)');
  elsif t ~ '^(https?://|www\.)' or t ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+/' then
    -- any other link: its last part (app.courtsidebase.com/u/om, instagram.com/om/)
    t := regexp_replace(t, '[?#].*$', '');
    t := regexp_replace(t, '/+$', '');
    t := regexp_replace(t, '^.*/', '');
  end if;
  t := regexp_replace(t, '\s', '', 'g');
  return ltrim(t, '@');
end $$;
grant execute on function public.invite_handle_from(text) to anon, authenticated;

-- (4) Who a ?ref= label credits: whoever held that handle when it was used.
create or replace function public.waitlist_label_owner(p_src text, p_at timestamptz)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  src text := lower(btrim(coalesce(p_src, '')));
  who uuid;
begin
  if p_at is null or src !~ '^[a-z0-9_]{2,24}$' or public.campaign_label(src) then return null; end if;
  select p.id into who from public.profiles p
   where p.handle = src and p.created_at <= p_at
     and (p.handle_changed_at is null or p.handle_changed_at <= p_at);
  if who is null then
    -- They changed handle since: the account that let it go after the link
    -- was used, and only when it is the first handle that account let go
    -- after then (the one it really held). Taking a label later and letting
    -- it go collects nothing.
    select h.user_id into who
      from public.handle_history h join public.profiles p on p.id = h.user_id
     where h.handle = src and h.released_at > p_at and p.created_at <= p_at
       and not exists (select 1 from public.handle_history h2
                        where h2.user_id = h.user_id and h2.released_at > p_at and h2.released_at < h.released_at)
     order by h.released_at asc limit 1;
  end if;
  return who;
end $$;
revoke all on function public.waitlist_label_owner(text, timestamptz) from public, anon, authenticated;

-- (1) Whose waitlist code it is: their account with that email, when their
-- list entry is older than the account (an entry added later for an
-- existing account's email never points at it).
create or replace function public.waitlist_code_owner(p_code text, p_not uuid default null)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select au.id
    from public.waitlist f
    join auth.users au on lower(btrim(au.email)) = lower(btrim(f.email))
    join public.profiles p on p.id = au.id
   where p_code ~ '^[0-9a-f]{8}$' and left(replace(f.id::text, '-', ''), 8) = p_code
     and f.id is distinct from p_not and f.created_at <= p.created_at
   order by f.created_at limit 1
$$;
revoke all on function public.waitlist_code_owner(text, uuid) from public, anon, authenticated;

-- (1, 4, 5) Who a person's waitlist row credits, or null.
create or replace function public.waitlist_inviter(u uuid)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare
  w record;
  who uuid;
begin
  select wl.id, wl.source, coalesce(wl.source_at, wl.created_at) as src_at, wl.referred_by as code
    into w
    from public.waitlist wl join auth.users au on lower(btrim(au.email)) = lower(btrim(wl.email))
   where au.id = u
   order by wl.created_at limit 1;
  if w.id is null then return null; end if;
  who := coalesce(public.waitlist_label_owner(w.source, w.src_at), public.waitlist_code_owner(w.code, w.id));
  if who is null or who = u or public.is_blocked_between(u, who) then return null; end if;
  return who;
end $$;
revoke all on function public.waitlist_inviter(uuid) from public, anon, authenticated;

-- (2, 3) Who to fill in at "Invited by?" for the person to confirm: their
-- waitlist row's own link, else the link they came back through later.
create or replace function public.waitlist_suggestion(u uuid)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare
  w record;
  who uuid;
begin
  who := public.waitlist_inviter(u);
  if who is not null then return who; end if;
  select wl.id, wl.later_source, wl.later_source_at, wl.later_code
    into w
    from public.waitlist wl join auth.users au on lower(btrim(au.email)) = lower(btrim(wl.email))
   where au.id = u
   order by wl.created_at limit 1;
  if w.id is null then return null; end if;
  who := coalesce(public.waitlist_label_owner(w.later_source, w.later_source_at), public.waitlist_code_owner(w.later_code, w.id));
  if who is null or who = u or public.is_blocked_between(u, who) then return null; end if;
  return who;
end $$;
revoke all on function public.waitlist_suggestion(uuid) from public, anon, authenticated;

-- (1) Credits a person from the waitlist when nobody is saved yet. Who, or null.
-- Runs only as the account is made (credit_waitlist_referral).
create or replace function public.apply_waitlist_referral(u uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mine public.profiles;
  who uuid;
begin
  select * into mine from public.profiles where id = u for update;
  if mine.id is null or mine.referred_by is not null then return null; end if;
  who := public.waitlist_inviter(u);
  if who is null then return null; end if;
  perform set_config('courtside.referral', 'on', true);
  update public.profiles set referred_by = who, referral_from_waitlist = true where id = u;
  perform set_config('courtside.referral', 'off', true);
  return who;
end $$;
revoke all on function public.apply_waitlist_referral(uuid) from public, anon, authenticated;

-- (6, 1, 4, 5) When an account is made: the invite link it signed up through
-- first (the same checks as claim_referral), else the waitlist.
create or replace function public.credit_waitlist_referral()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  wanted text;
  who uuid;
begin
  if new.referred_by is not null then return null; end if;
  select public.invite_handle_from(u.raw_user_meta_data ->> 'invited_by') into wanted from auth.users u where u.id = new.id;
  if wanted ~ '^[a-z0-9_]{2,24}$' then
    select id into who from public.profiles where handle = wanted;
    if who is null then
      select user_id into who from public.handle_history where handle = wanted order by released_at desc limit 1;
    end if;
    if who is not null and who <> new.id and not public.is_blocked_between(new.id, who) then
      perform set_config('courtside.referral', 'on', true);
      update public.profiles set referred_by = who, referral_from_waitlist = false where id = new.id;
      perform set_config('courtside.referral', 'off', true);
      return null;
    end if;
  end if;
  perform public.apply_waitlist_referral(new.id);
  return null;
end $$;
revoke all on function public.credit_waitlist_referral() from public, anon, authenticated;

drop trigger if exists credit_waitlist_referral on public.profiles;
create trigger credit_waitlist_referral after insert on public.profiles
  for each row execute function public.credit_waitlist_referral();

-- (3, 11) The waitlist. A visit by someone already on it never changes their
-- row's label or code (the page is signed out, so anyone can type anyone's
-- email): a later link is only kept to one side, to offer them. Their ?r=
-- code comes back only when the email is new to the list.
create or replace function public.join_waitlist(p_email text, p_name text default null, p_source text default null, p_referred_by text default null)
returns table(place integer, code text, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_already boolean := false;
  v_later text;
  v_code text;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'that does not look like an email' using errcode = '22023';
  end if;
  p_name := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  p_source := nullif(left(regexp_replace(lower(coalesce(p_source, '')), '[^a-z0-9_-]', '', 'g'), 40), '');
  p_referred_by := nullif(regexp_replace(lower(coalesce(p_referred_by, '')), '[^0-9a-f]', '', 'g'), '');
  if p_referred_by is not null and char_length(p_referred_by) <> 8 then p_referred_by := null; end if;
  if p_referred_by is not null and not exists (
    select 1 from public.waitlist w where left(replace(w.id::text, '-', ''), 8) = p_referred_by
  ) then p_referred_by := null; end if;

  insert into public.waitlist (email, name, source, source_at, referred_by)
  values (v_email, p_name, p_source, case when p_source is not null then now() end, p_referred_by)
  on conflict (lower(email)) do nothing
  returning id into v_id;

  if v_id is null then
    select w.id into v_id from public.waitlist w where lower(w.email) = v_email;
    v_already := true;
    v_later := case when p_source ~ '^[a-z0-9_]{2,24}$' and not public.campaign_label(p_source) then p_source end;
    v_code := case when p_referred_by <> left(replace(v_id::text, '-', ''), 8) then p_referred_by end;
    update public.waitlist w
       set later_source = coalesce(v_later, w.later_source),
           later_source_at = case when v_later is not null then now() else w.later_source_at end,
           later_code = coalesce(v_code, w.later_code)
     where w.id = v_id and (v_later is not null or v_code is not null);
  end if;

  return query
    with brought as (
      select w.referred_by as ref, count(*) as n
      from public.waitlist w where w.referred_by is not null group by w.referred_by
    ),
    ranked as (
      select w.id,
             row_number() over (order by coalesce(b.n, 0) desc, w.created_at asc, w.id asc) as pos
      from public.waitlist w
      left join brought b on b.ref = left(replace(w.id::text, '-', ''), 8)
    )
    select r.pos::integer, case when not v_already then left(replace(v_id::text, '-', ''), 8) end, v_already
    from ranked r where r.id = v_id;
end $$;
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon, authenticated;

-- (7) A link claim: the handle read the same forgiving way.
create or replace function public.claim_referral(p_handle text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted text := public.invite_handle_from(p_handle);
  who uuid;
  mine public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into mine from public.profiles where id = me for update;
  if mine.id is null or (mine.referred_by is not null and not coalesce(mine.referral_from_waitlist, false)) or mine.created_at < now() - interval '1 day' then return null; end if;
  select id into who from public.profiles where handle = wanted;
  if who is null and to_regclass('public.handle_history') is not null then
    execute 'select user_id from public.handle_history where handle = $1 order by released_at desc limit 1' into who using wanted;
  end if;
  if who is null or who = me or public.is_blocked_between(me, who) then return null; end if;
  perform set_config('courtside.referral', 'on', true);
  update public.profiles set referred_by = who, referral_from_waitlist = false where id = me;
  perform set_config('courtside.referral', 'off', true);
  -- The invite counts either way. The follow only when both are adults or
  -- both are teens (migration 84); null when no follow was made.
  if not public.same_age_band(me, who) then return null; end if;
  perform public.follow_inviter_now(me, who);
  return who;
end $$;

-- (7) "Invited by?": a pasted link, a friend's waitlist link, spaces and @ are fine.
create or replace function public.claim_invite_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted text := public.invite_handle_from(p_code);
  mine public.profiles;
  who uuid;
  followed uuid;
  them public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into mine from public.profiles where id = me;
  if mine.id is null then return jsonb_build_object('error', 'not-found'); end if;
  if mine.referred_by is not null and not coalesce(mine.referral_from_waitlist, false) then
    select * into them from public.profiles where id = mine.referred_by;
    return jsonb_strip_nulls(jsonb_build_object('error', 'already', 'handle', them.handle));
  end if;
  if mine.created_at < now() - interval '1 day' then return jsonb_build_object('error', 'too-late'); end if;
  -- A friend's waitlist link: the friend it belongs to, once they have an account.
  if wanted ~ '^r=[0-9a-f]{8}$' then
    who := public.waitlist_code_owner(substr(wanted, 3));
    if who is null then return jsonb_build_object('error', 'not-found'); end if;
    select handle into wanted from public.profiles where id = who;
  end if;
  if wanted !~ '^[a-z0-9_]{2,24}$' then return jsonb_build_object('error', 'not-found'); end if;
  select id into who from public.profiles where handle = wanted;
  if who is null and to_regclass('public.handle_history') is not null then
    execute 'select user_id from public.handle_history where handle = $1 order by released_at desc limit 1' into who using wanted;
  end if;
  if who = me then return jsonb_build_object('error', 'self'); end if;
  -- Someone blocked either way looks the same as no such person.
  if who is null or public.is_blocked_between(me, who) then return jsonb_build_object('error', 'not-found'); end if;
  followed := public.claim_referral(wanted);
  select * into mine from public.profiles where id = me;
  if mine.referred_by is distinct from who then return jsonb_build_object('error', 'not-found'); end if;
  select * into them from public.profiles where id = who;
  return jsonb_build_object('ok', true, 'id', who, 'handle', them.handle, 'followed', followed is not null);
end $$;
revoke all on function public.claim_invite_code(text) from public, anon;
grant execute on function public.claim_invite_code(text) to authenticated;

-- (8) A waitlist credit may still be corrected on the first day. (2, 3) With
-- nobody saved yet, the waitlist's guess comes back as `suggested`, for the
-- app to fill in at "Invited by?": it counts only once they press Continue.
create or replace function public.my_inviter()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when me.id is null then null
    when me.referred_by is null then jsonb_strip_nulls(jsonb_build_object(
      'canSet', me.created_at >= now() - interval '1 day',
      'suggested', case when me.created_at >= now() - interval '1 day'
        then (select s.handle from public.profiles s where s.id = public.waitlist_suggestion(me.id)) end))
    else jsonb_strip_nulls(jsonb_build_object('id', r.id, 'handle', r.handle, 'name', r.name,
      'canSet', coalesce(me.referral_from_waitlist, false) and me.created_at >= now() - interval '1 day'))
  end
  from (select 1) one
  left join public.profiles me on me.id = auth.uid()
  left join public.profiles r on r.id = me.referred_by
$$;
revoke all on function public.my_inviter() from public, anon;
grant execute on function public.my_inviter() to authenticated;

-- (9) Came back: at least 20 hours after joining, within 14 days.
create or replace function public.invite_second_day(u uuid, joined timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  with s(t) as (
              select updated_at        from public.push_tokens    where user_id = u
    union all select last_seen_at      from public.device_sightings where user_id = u
    union all select first_seen_at     from public.device_sightings where user_id = u
    union all select seen_at           from public.last_seen      where user_id = u
    union all select seen_at           from public.exact_spots    where user_id = u
    union all select first_seen_at     from public.feed_signals   where user_id = u
    union all select last_seen_at      from public.feed_signals   where user_id = u
    union all select updated_at        from public.user_state     where user_id = u
    union all select first_at          from public.app_opens      where user_id = u
    union all select created_at        from public.posts          where author_id = u
    union all select created_at        from public.comments       where author_id = u
    union all select created_at        from public.post_likes     where user_id = u
    union all select created_at        from public.questions      where author_id = u
    union all select created_at        from public.answers        where author_id = u
    union all select created_at        from public.messages       where sender_id = u
    union all select viewed_at         from public.story_views    where user_id = u
    union all select created_at        from public.hit_joins      where user_id = u
    union all select created_at        from public.hit_requests   where author_id = u
    union all select created_at        from public.court_checkins where user_id = u
    union all select created_at        from public.follows        where follower_id = u
    union all select created_at        from public.practice_sessions where user_id = u
  )
  select min(t) from s
   where t >= joined + interval '20 hours' and t < joined + interval '14 days' and t <= now()
$$;
revoke all on function public.invite_second_day(uuid, timestamptz) from public, anon, authenticated;

-- (10) No profile yet means not set up (it answered null, and the step was skipped).
create or replace function public.invite_set_up(pr jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
    coalesce(pr->>'onboardedAt', '') <> ''
      or (jsonb_typeof(pr->'goals') = 'array' and jsonb_array_length(pr->'goals') > 0),
    false)
$$;
revoke all on function public.invite_set_up(jsonb) from public, anon, authenticated;

commit;
