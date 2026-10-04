-- Inviter follows by age (Oct 4, owner): someone who joins through an invite
-- follows the inviter automatically only when both are adults or both are teens.
-- One adult and one teen: no automatic follow; sign-up offers a Follow button,
-- and the normal follow rules apply to it. Ages not on file yet: wait
-- (follow_my_inviter runs again once the birthday is in).
-- NOTE for migration 64 (age_group moving to user_state): update same_age_band too.
create or replace function public.same_age_band(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pa.age_group is not null and pa.age_group = pb.age_group
                   from public.profiles pa, public.profiles pb where pa.id = a and pb.id = b), false)
$$;
revoke all on function public.same_age_band(uuid, uuid) from public, anon, authenticated;

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
  if not public.same_age_band(me, who) then return null; end if;
  perform public.follow_inviter_now(me, who);
  return who;
end;
$function$;

CREATE OR REPLACE FUNCTION public.follow_my_inviter()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  mine public.profiles;
begin
  if me is null then return null; end if;
  select * into mine from public.profiles where id = me;
  if mine.id is null or mine.referred_by is null or mine.created_at < now() - interval '7 days' then return null; end if;
  if not public.same_age_band(me, mine.referred_by) or public.is_blocked_between(me, mine.referred_by) then return null; end if;
  if exists (select 1 from public.follows where follower_id = me and following_id = mine.referred_by)
     or exists (select 1 from public.follow_requests where requester_id = me and target_id = mine.referred_by)
     or exists (select 1 from public.notifications where user_id = mine.referred_by and actor_id = me and kind in ('follow', 'follow-request', 'follow-accepted')) then
    return null;
  end if;
  perform public.follow_inviter_now(me, mine.referred_by);
  return mine.referred_by;
end $function$;
