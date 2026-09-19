-- Follower and following counts, kept by the database.
--
-- The app used to download every follow on the whole app at every open and
-- count them itself; the database hands back at most 1,000 rows at a time,
-- so past that the counts (and Follow buttons) went wrong. Now each profile
-- carries its own two counts, and the database keeps them right on every
-- follow and unfollow. Nobody can set them by hand.
-- Needs migration 00 (profiles, follows). Safe to run more than once.

alter table public.profiles add column if not exists followers_count int not null default 0;
alter table public.profiles add column if not exists following_count int not null default 0;
create index if not exists follows_following_idx on public.follows (following_id);

-- Only the database's own counting may change the counts; any other change
-- to them (from the app) is quietly put back.
create or replace function public.guard_follow_counts()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.counting', true), '') <> 'on' then
    new.followers_count := old.followers_count;
    new.following_count := old.following_count;
  end if;
  return new;
end $$;
drop trigger if exists guard_follow_counts on public.profiles;
create trigger guard_follow_counts before update on public.profiles
  for each row execute function public.guard_follow_counts();

create or replace function public.count_follow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  step int;
  follower uuid;
  followed uuid;
begin
  -- A new follow has only a new row, a removed one only an old row.
  if tg_op = 'INSERT' then
    step := 1; follower := new.follower_id; followed := new.following_id;
  else
    step := -1; follower := old.follower_id; followed := old.following_id;
  end if;
  perform set_config('courtside.counting', 'on', true);
  update public.profiles set following_count = greatest(0, following_count + step) where id = follower;
  update public.profiles set followers_count = greatest(0, followers_count + step) where id = followed;
  perform set_config('courtside.counting', 'off', true);
  return null;
end $$;
drop trigger if exists count_follow on public.follows;
create trigger count_follow after insert or delete on public.follows
  for each row execute function public.count_follow();

-- Count everyone who exists today.
select set_config('courtside.counting', 'on', false);
update public.profiles p set
  followers_count = (select count(*) from public.follows f where f.following_id = p.id),
  following_count = (select count(*) from public.follows f where f.follower_id = p.id);
select set_config('courtside.counting', 'off', false);
