-- CourtSide · migration 93: a profile you create yourself starts as an
-- ordinary player (security review, Oct 5).
--
-- The problem: migration 16_1 let an account make its own profile row when
-- the sign-up trigger had not (the app's ensureProfile does this). The rule
-- only checked that the row was your own. The guards that keep is_admin,
-- is_coach, suspended_at, the age, the follower counts, the inviter and the
-- join date out of your hands (migrations 15, 23, 34, 36, 54...) all run on
-- an EDIT, never on a new row. So an account with no profile row could create
-- one that said is_admin = true, and from then on read the waitlist emails,
-- coach applications and résumés, refund bookings and send the beta email.
-- Two such accounts exist today (both Google sign-ups whose profile rows were
-- removed by hand), and any account whose profile row is ever deleted in the
-- dashboard would be in the same spot.
--
-- What changes:
--   * A new row written by a signed-in player (or by anyone signed out)
--     always starts with the defaults on every protected field, whatever was
--     sent. The sign-up trigger and the dashboard are left alone: they run
--     with nobody signed in.
--   * Nobody signed out may insert a profile at all (the rule already
--     refused them; this removes the permission too).
--   * "Came from the waitlist" (referral_from_waitlist, migration 83) gets the
--     same guard as the inviter itself: only the invite functions change it.
--     Before, setting it back to true by hand let a new account move its
--     invite to a different person as often as it liked during its first day.
--
-- Nothing changes for anyone using the app: ensureProfile only ever sends
-- the id, a handle and a name, and the invite functions already set the
-- flag they need.
--
-- Still to do by hand (not here): if a profile row was deleted to remove
-- someone, ban or delete that account in Authentication → Users instead.
-- Deleting only the profile row does not end their access.
--
-- Works before or after migration 64 (which moves age_group off profiles):
-- the defaults are written by name, and a name the table no longer has is
-- simply skipped. Safe to run more than once.

create or replace function public.guard_new_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The sign-up trigger (handle_new_user) and the dashboard: nobody signed
  -- in and not the app's own roles. Left exactly as they are.
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;
  new := jsonb_populate_record(new, jsonb_build_object(
    'is_admin', false,
    'is_coach', false,
    'suspended_at', null,
    'age_group', null,
    'followers_count', 0,
    'following_count', 0,
    'referred_by', null,
    'referral_from_waitlist', false,
    'handle_changed_at', null,
    'open_to_hit_until', null,
    'created_at', now()));
  return new;
end $$;

drop trigger if exists guard_new_profile on public.profiles;
create trigger guard_new_profile before insert on public.profiles
  for each row execute function public.guard_new_profile();

revoke insert on public.profiles from anon;

-- The same as the live version (migrations 34-36), plus the waitlist flag.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.is_coach is distinct from old.is_coach and coalesce(current_setting('courtside.coach_system', true), '') <> 'on' then
      raise exception 'is_coach is not editable';
    end if;
    if (new.handle is distinct from old.handle or new.handle_changed_at is distinct from old.handle_changed_at)
       and coalesce(current_setting('courtside.handle_change', true), '') <> 'on' then
      raise exception 'handle is not editable';
    end if;
    if new.referred_by is distinct from old.referred_by and coalesce(current_setting('courtside.referral', true), '') <> 'on' then
      new.referred_by := old.referred_by;
    end if;
    -- Only claim_referral and credit_waitlist_referral move this (both set courtside.referral).
    if new.referral_from_waitlist is distinct from old.referral_from_waitlist and coalesce(current_setting('courtside.referral', true), '') <> 'on' then
      new.referral_from_waitlist := old.referral_from_waitlist;
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

-- Check after running (expect 1 row, guard_new_profile, BEFORE INSERT):
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.profiles'::regclass and tgname = 'guard_new_profile';
