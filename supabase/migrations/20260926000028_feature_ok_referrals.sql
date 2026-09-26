-- Two small things for growth. Safe to run more than once.
--
-- 1. A post carries whether its author is fine with CourtSide featuring it
--    on CourtSide's own channels (Instagram and the like). On by default.
alter table public.posts add column if not exists feature_ok boolean not null default true;

-- 2. Invites. Everyone's invite link carries their handle; when a friend
--    joins through it, the friend's profile remembers who brought them and
--    the two follow each other. Counting a person's invites is a count of
--    profiles that point at them.
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

create or replace function public.claim_referral(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  who uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select id into who from public.profiles where handle = lower(trim(p_handle)) limit 1;
  if who is null or who = me then return null; end if;
  -- Only the first invite counts; a second link does not steal the credit.
  update public.profiles set referred_by = who where id = me and referred_by is null;
  insert into public.follows (follower_id, following_id) values (me, who) on conflict do nothing;
  insert into public.follows (follower_id, following_id) values (who, me) on conflict do nothing;
  return who;
end;
$$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;
