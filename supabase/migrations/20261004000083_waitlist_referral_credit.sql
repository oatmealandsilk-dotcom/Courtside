-- Waitlist referrals carried into the app (Oct 4, owner: "credit waitlist referrals").
-- Someone who joined the waitlist through a player's link (courtsidebase.com/?ref=tp)
-- and later makes an account with the same email is credited to that player, as if
-- they had typed the code. Only a real CourtSide handle counts (not instagram, not
-- the owner's own accounts, which are admins); the real-user rules (migration 80)
-- still decide any payout. A code typed at sign-up wins over this guess.

alter table public.profiles add column if not exists referral_from_waitlist boolean not null default false;

create or replace function public.credit_waitlist_referral()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  src text;
  who uuid;
begin
  if new.referred_by is not null then return null; end if;
  select lower(btrim(w.source)) into src
    from public.waitlist w join auth.users u on lower(u.email) = lower(w.email)
   where u.id = new.id and coalesce(btrim(w.source), '') <> ''
   order by w.created_at limit 1;
  if src is null then return null; end if;
  select p.id into who from public.profiles p
   where p.handle = src and p.id <> new.id and not coalesce(p.is_admin, false);
  if who is null or public.is_blocked_between(new.id, who) then return null; end if;
  perform set_config('courtside.referral', 'on', true);
  update public.profiles set referred_by = who, referral_from_waitlist = true where id = new.id;
  perform set_config('courtside.referral', 'off', true);
  return null;
end $$;
revoke all on function public.credit_waitlist_referral() from public, anon, authenticated;

drop trigger if exists credit_waitlist_referral on public.profiles;
create trigger credit_waitlist_referral after insert on public.profiles
  for each row execute function public.credit_waitlist_referral();

-- A typed code (or a join link) may replace a waitlist guess, once.
CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(p_code, '')));
  mine public.profiles;
  who uuid;
  followed uuid;
  them public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  wanted := btrim(ltrim(wanted, '@'));
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
end $function$;

CREATE OR REPLACE FUNCTION public.claim_referral(p_handle text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
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
  -- The invite counts either way. The follow only when this person is known
  -- to be an adult: a teen following an adult opens the teen to them
  -- (the teen rules, migration 54 onward). Answers null when no follow was made, so the app says
  -- nothing; follow_my_inviter makes it once the birthday says adult.
  if not public.known_adult(me) then return null; end if;
  perform public.follow_inviter_now(me, who);
  return who;
end;
$function$;

-- Accounts made in the last week from a waitlist link, credited now.
do $$
declare r record; src text; who uuid;
begin
  for r in select p.id from public.profiles p where p.referred_by is null and p.created_at > now() - interval '7 days' loop
    select lower(btrim(w.source)) into src from public.waitlist w join auth.users u on lower(u.email) = lower(w.email)
     where u.id = r.id and coalesce(btrim(w.source), '') <> '' order by w.created_at limit 1;
    if src is null then continue; end if;
    select p.id into who from public.profiles p where p.handle = src and p.id <> r.id and not coalesce(p.is_admin, false);
    if who is null then continue; end if;
    perform set_config('courtside.referral', 'on', true);
    update public.profiles set referred_by = who, referral_from_waitlist = true where id = r.id;
    perform set_config('courtside.referral', 'off', true);
  end loop;
end $$;
