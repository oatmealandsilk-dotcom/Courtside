-- Blocking, enforced by the database, both ways.
--
-- Until now a block only lived in the blocker's private settings and only
-- hid the other person on the blocker's own phone: the blocked person could
-- still message, comment, like, follow and see everything. From here on,
-- once either of two people has blocked the other:
--   * neither can send the other a message, or start a new chat;
--   * neither can comment on, or like, the other's posts, hits or comments;
--   * neither can follow the other, or ask to; any follow and any pending ask
--     between them is removed at the moment of the block;
--   * each one's posts, hits, comments, threads and replies are hidden from
--     the other.
-- Nobody is told they were blocked. Unblocking lifts all of this (removed
-- follows do not come back).
--
-- The app keeps saving blocks the way it always has, as the blocked list in
-- your settings; the database copies that list into its own table whenever
-- it changes. Needs migrations 02, 06, 08, 09 and 13. Safe to run more than once.

-- ------------------------------------------------------------ who blocked whom
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
-- No policies: nobody reads or writes this table from the app.

-- Whether either of two people has blocked the other. Internal only.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Whether you and one other person are blocked either way. This is all the
-- rules below need, and all anyone can ask: only about themselves.
create or replace function public.blocked_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_blocked_between(auth.uid(), other);
$$;
grant execute on function public.blocked_with(uuid) to anon, authenticated;

-- Whether a chat you are in is with someone you are blocked with.
create or replace function public.chat_is_blocked(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id <> auth.uid() and public.is_blocked_between(auth.uid(), m.user_id));
$$;
grant execute on function public.chat_is_blocked(uuid) to authenticated;

-- ------------------------------------------------------------ copy blocks from settings
create or replace function public.sync_blocks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted uuid[];
begin
  select coalesce(array_agg(distinct x::uuid), '{}') into wanted
    from unnest(coalesce(new.blocked_ids, '{}')) as x
    where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and x::uuid <> new.user_id;
  delete from public.blocks where blocker_id = new.user_id and not (blocked_id = any (wanted));
  insert into public.blocks (blocker_id, blocked_id)
    select new.user_id, w from unnest(wanted) as w where exists (select 1 from public.profiles where id = w)
    on conflict do nothing;
  -- A block ends any follow, and any ask to follow, between the two, both ways.
  delete from public.follows f using unnest(wanted) as w
    where (f.follower_id = new.user_id and f.following_id = w) or (f.follower_id = w and f.following_id = new.user_id);
  delete from public.follow_requests r using unnest(wanted) as w
    where (r.requester_id = new.user_id and r.target_id = w) or (r.requester_id = w and r.target_id = new.user_id);
  return new;
end $$;
drop trigger if exists sync_blocks on public.user_state;
create trigger sync_blocks after insert or update of blocked_ids on public.user_state
  for each row execute function public.sync_blocks();

-- ------------------------------------------------------------ messages
drop policy if exists "members send as themselves" on public.messages;
create policy "members send as themselves" on public.messages for insert
  with check (auth.uid() = sender_id and public.is_member(conversation_id) and not public.chat_is_blocked(conversation_id));

-- Opening a chat: an old chat with someone you are blocked with still opens
-- (to read), but no new one can be started with them.
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
    limit 1;
  if found_id is not null then return found_id; end if;
  if public.is_blocked_between(me, other) then
    raise exception 'blocked';
  end if;
  if exists (select 1 from public.profiles where id = other and age_group = 'teen')
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ comments and likes
-- Who wrote a post, hit or comment, read directly: a rule cannot rely on
-- reading it through the same hiding it is deciding about (a post hidden
-- from you would otherwise look like it had no author at all).
create or replace function public.author_of_post(p uuid)
returns uuid language sql stable security definer set search_path = public as $$ select author_id from public.posts where id = p $$;
create or replace function public.author_of_hit(h uuid)
returns uuid language sql stable security definer set search_path = public as $$ select author_id from public.stories where id = h $$;
create or replace function public.author_of_comment(c uuid)
returns uuid language sql stable security definer set search_path = public as $$ select author_id from public.comments where id = c $$;
create or replace function public.author_of_hit_comment(c uuid)
returns uuid language sql stable security definer set search_path = public as $$ select author_id from public.story_comments where id = c $$;
grant execute on function public.author_of_post(uuid), public.author_of_hit(uuid), public.author_of_comment(uuid), public.author_of_hit_comment(uuid) to anon, authenticated;

drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert
  with check (auth.uid() = author_id
    and public.can_view(public.author_of_post(post_id))
    and not public.blocked_with(public.author_of_post(post_id)));
drop policy if exists "comment on hits as yourself" on public.story_comments;
create policy "comment on hits as yourself" on public.story_comments for insert
  with check (auth.uid() = author_id
    and public.can_view(public.author_of_hit(story_id))
    and not public.blocked_with(public.author_of_hit(story_id)));

drop policy if exists "like as yourself" on public.post_likes;
create policy "like as yourself" on public.post_likes for insert
  with check (auth.uid() = user_id and not public.blocked_with(public.author_of_post(post_id)));
drop policy if exists "like hits as yourself" on public.story_likes;
create policy "like hits as yourself" on public.story_likes for insert
  with check (auth.uid() = user_id and not public.blocked_with(public.author_of_hit(story_id)));
drop policy if exists "like comments as yourself" on public.comment_likes;
create policy "like comments as yourself" on public.comment_likes for insert
  with check (auth.uid() = user_id and not public.blocked_with(public.author_of_comment(comment_id)));
drop policy if exists "like hit comments as yourself" on public.story_comment_likes;
create policy "like hit comments as yourself" on public.story_comment_likes for insert
  with check (auth.uid() = user_id and not public.blocked_with(public.author_of_hit_comment(comment_id)));

-- ------------------------------------------------------------ follows
drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows for insert
  with check (auth.uid() = follower_id and not public.blocked_with(following_id));
drop policy if exists "ask as yourself" on public.follow_requests;
create policy "ask as yourself" on public.follow_requests for insert
  with check (auth.uid() = requester_id and not public.blocked_with(target_id));

-- ------------------------------------------------------------ what each can see
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id) and public.can_view(author_id) and not public.blocked_with(author_id));
drop policy if exists "read live stories" on public.stories;
create policy "read live stories" on public.stories for select
  using (((not archived and expires_at > now()) or auth.uid() = author_id) and public.can_view(author_id) and not public.blocked_with(author_id));
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select using (not public.blocked_with(author_id));
drop policy if exists "hit comments are public" on public.story_comments;
create policy "hit comments are public" on public.story_comments for select using (not public.blocked_with(author_id));
drop policy if exists "threads are public" on public.questions;
create policy "threads are public" on public.questions for select using (not public.blocked_with(author_id));
drop policy if exists "answers are public" on public.answers;
create policy "answers are public" on public.answers for select using (not public.blocked_with(author_id));

-- ------------------------------------------------------------ blocks made before today
update public.user_state set blocked_ids = blocked_ids where coalesce(array_length(blocked_ids, 1), 0) > 0;
