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
--    with. Before, it only moved them up the list.
-- 2. Someone who made their account first and left their email on the
--    website afterwards (within their first day) is credited too. Before,
--    the waitlist was only checked at the moment the account was made.
-- 3. Someone already on the list (from Instagram, say) who later comes
--    through a player's link and leaves the same email gets that player's
--    label (and a friend's code) added. Before, the second visit was ignored.
-- 4. A label only credits whoever held that handle when the link was used.
--    Before, anyone could make an account called "instagram" and collect
--    every Instagram visitor. A player who changes handle after sharing is
--    still credited (looked up in handle_history).
-- 5. The owner's own (admin) accounts are credited from the waitlist like
--    everyone else, the same as a typed code or a join link already were.
--    The page promised it; the waitlist was the one route that refused.
-- 6. The invite link rides along with an email sign-up (the app sends it as
--    invited_by), so the credit is made the moment the account is, even if
--    the confirmation email is opened in another browser or a day later.
-- 7. "Invited by?" accepts a pasted link (…/join?ref=om, courtsidebase.com/
--    ?ref=om, a profile link) and ignores spaces and @, instead of saying
--    "No player with that handle".
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
--
-- Nothing here changes who is paid for players already counted, and
-- nothing is sent to anyone. Safe to run more than once.

begin;

-- When the waitlist row's label was set (3): the time a handle is checked against.
alter table public.waitlist add column if not exists source_at timestamptz;
update public.waitlist set source_at = created_at where source_at is null and source is not null;

-- (7) The handle in whatever was typed or pasted into "Invited by?".
create or replace function public.invite_handle_from(p_text text)
returns text language plpgsql immutable set search_path = public as $$
declare
  t text := lower(btrim(coalesce(p_text, '')));
begin
  if t ~ 'ref=' then
    -- …/join?ref=om, courtsidebase.com/?ref=om (an @ may be written as %40)
    t := coalesce(substring(t from 'ref=(?:@|%40)*([a-z0-9_]+)'), t);
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

-- (1, 4, 5) Who a person's waitlist row credits, or null.
create or replace function public.waitlist_inviter(u uuid)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare
  w record;
  who uuid;
begin
  select wl.id, lower(btrim(wl.source)) as src, coalesce(wl.source_at, wl.created_at) as src_at, wl.referred_by as code
    into w
    from public.waitlist wl join auth.users au on lower(btrim(au.email)) = lower(btrim(wl.email))
   where au.id = u
   order by wl.created_at limit 1;
  if w.id is null then return null; end if;

  -- ?ref=<handle>: whoever held that handle when the link was used.
  if w.src ~ '^[a-z0-9_]{2,24}$' then
    select p.id into who from public.profiles p
     where p.handle = w.src and p.created_at <= w.src_at
       and (p.handle_changed_at is null or p.handle_changed_at <= w.src_at);
    if who is null then
      -- They changed handle since: the account that let it go after the link was used.
      select h.user_id into who
        from public.handle_history h join public.profiles p on p.id = h.user_id
       where h.handle = w.src and h.released_at > w.src_at and p.created_at <= w.src_at
       order by h.released_at asc limit 1;
    end if;
  end if;

  -- ?r=<code>: the friend whose waitlist code it is, once they have an account with that email.
  if who is null and w.code is not null then
    select au.id into who
      from public.waitlist f
      join auth.users au on lower(btrim(au.email)) = lower(btrim(f.email))
      join public.profiles p on p.id = au.id
     where left(replace(f.id::text, '-', ''), 8) = w.code and f.id <> w.id
     order by f.created_at limit 1;
  end if;

  if who is null or who = u or public.is_blocked_between(u, who) then return null; end if;
  return who;
end $$;
revoke all on function public.waitlist_inviter(uuid) from public, anon, authenticated;

-- (1, 2) Credits a person from the waitlist when nobody is saved yet. Who, or null.
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

-- (2, 3) The waitlist: a later link fills in what the first visit lacked,
-- and an account made first (within its first day) is credited now.
create or replace function public.join_waitlist(p_email text, p_name text default null, p_source text default null, p_referred_by text default null)
returns table(place integer, code text, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_already boolean := false;
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
    -- A player's handle replaces no label, or a label that is no player's
    -- handle (instagram); a player's handle already there is kept.
    update public.waitlist w set source = p_source, source_at = now()
     where w.id = v_id and p_source is not null and w.source is distinct from p_source
       and (coalesce(btrim(w.source), '') = ''
            or (exists (select 1 from public.profiles p where p.handle = p_source)
                and not exists (select 1 from public.profiles p where p.handle = lower(btrim(w.source)))));
    update public.waitlist w set referred_by = p_referred_by
     where w.id = v_id and w.referred_by is null and p_referred_by is not null
       and p_referred_by <> left(replace(v_id::text, '-', ''), 8);
  end if;

  -- Made their account first, left their email here after: credited now, on their first day only.
  perform public.apply_waitlist_referral(p.id)
     from auth.users au join public.profiles p on p.id = au.id
    where lower(btrim(au.email)) = v_email and p.referred_by is null and p.created_at > now() - interval '1 day';

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
    select r.pos::integer, left(replace(v_id::text, '-', ''), 8), v_already
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

-- (7) "Invited by?": a pasted link, spaces and @ are fine.
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

-- (8) A waitlist guess may still be corrected on the first day.
create or replace function public.my_inviter()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when me.id is null then null
    when me.referred_by is null then jsonb_build_object('canSet', me.created_at >= now() - interval '1 day')
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
