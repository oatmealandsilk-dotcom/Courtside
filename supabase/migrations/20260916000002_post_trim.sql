-- A clip can be trimmed without re-encoding: the feed plays from trim_start
-- to trim_end. A post can also be marked silent.
alter table public.posts
  add column if not exists trim_start numeric,
  add column if not exists trim_end numeric,
  add column if not exists muted boolean not null default false,
  -- Pinned by the author: shown first in their profile grid.
  add column if not exists pinned boolean not null default false;

-- Likes on comments left on hits, mirroring comment_likes for posts.
create table if not exists public.story_comment_likes (
  comment_id uuid not null references public.story_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.story_comment_likes enable row level security;
drop policy if exists "hit comment likes are public" on public.story_comment_likes;
create policy "hit comment likes are public"    on public.story_comment_likes for select using (true);
drop policy if exists "like hit comments as yourself" on public.story_comment_likes;
create policy "like hit comments as yourself"   on public.story_comment_likes for insert with check (auth.uid() = user_id);
drop policy if exists "unlike hit comments as yourself" on public.story_comment_likes;
create policy "unlike hit comments as yourself" on public.story_comment_likes for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------ private accounts
-- A private account is seen in full only by its followers; following one
-- takes a request the owner accepts.
alter table public.profiles add column if not exists is_private boolean not null default false;

create table if not exists public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
alter table public.follow_requests enable row level security;
drop policy if exists "see requests you are part of" on public.follow_requests;
create policy "see requests you are part of" on public.follow_requests for select using (auth.uid() = requester_id or auth.uid() = target_id);
drop policy if exists "ask as yourself" on public.follow_requests;
create policy "ask as yourself"               on public.follow_requests for insert with check (auth.uid() = requester_id);
drop policy if exists "withdraw or decline" on public.follow_requests;
create policy "withdraw or decline"           on public.follow_requests for delete using (auth.uid() = requester_id or auth.uid() = target_id);

-- Accepting: the account being followed adds the follow row (which the
-- ordinary follow policy would refuse, since it is not their own follow) and
-- clears the ask, in one step.
create or replace function public.accept_follow_request(requester uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.follow_requests where requester_id = requester and target_id = auth.uid()) then
    raise exception 'no such request';
  end if;
  insert into public.follows (follower_id, following_id) values (requester, auth.uid()) on conflict do nothing;
  delete from public.follow_requests where requester_id = requester and target_id = auth.uid();
end;
$$;

-- Who may see an account's posts and hits: everyone for a public account,
-- the owner and their followers for a private one.
create or replace function public.can_view(author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select author = auth.uid()
      or not coalesce((select is_private from public.profiles where id = author), false)
      or exists (select 1 from public.follows where follower_id = auth.uid() and following_id = author);
$$;
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select using ((not archived or auth.uid() = author_id) and public.can_view(author_id));
drop policy if exists "read live stories" on public.stories;
create policy "read live stories" on public.stories for select using (((not archived and expires_at > now()) or auth.uid() = author_id) and public.can_view(author_id));
