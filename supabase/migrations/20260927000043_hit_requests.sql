-- "Looking for a hit": a post that asks for someone to play with. When,
-- where, what level, singles or doubles or just hitting, and how many spots.
-- Anyone can say "I'm in"; the first to join starts a group chat with the
-- poster, and everyone after is added to it, so the details are sorted there.
create table if not exists public.hit_requests (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at       timestamptz not null,
  place           jsonb not null check (jsonb_typeof(place) = 'object' and pg_column_size(place) < 2000 and char_length(coalesce(place->>'name', '')) between 1 and 120),
  level_min       numeric(4,1) check (level_min is null or level_min between 1 and 16.5),
  level_max       numeric(4,1) check (level_max is null or level_max between 1 and 16.5),
  format          text not null default 'hit' check (format in ('singles', 'doubles', 'hit')),
  spots           smallint not null default 1 check (spots between 1 and 3),
  note            text check (note is null or char_length(note) <= 280),
  conversation_id uuid references public.conversations (id) on delete set null,
  cancelled       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists hit_requests_starts on public.hit_requests (starts_at desc);

create table if not exists public.hit_joins (
  hit_id     uuid not null references public.hit_requests (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hit_id, user_id)
);

alter table public.hit_requests enable row level security;
alter table public.hit_joins enable row level security;
-- Everyone signed in sees open hits, except between people blocked either way.
drop policy if exists "hits are visible" on public.hit_requests;
create policy "hits are visible" on public.hit_requests for select using (auth.uid() is not null and not public.is_blocked_between(auth.uid(), author_id));
drop policy if exists "post your own hit" on public.hit_requests;
create policy "post your own hit" on public.hit_requests for insert with check (author_id = auth.uid() and starts_at > now() - interval '1 hour' and starts_at < now() + interval '30 days');
-- The poster can change the details or call it off; the chat link and date posted are the server's.
drop policy if exists "change your own hit" on public.hit_requests;
create policy "change your own hit" on public.hit_requests for update using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "delete your own hit" on public.hit_requests;
create policy "delete your own hit" on public.hit_requests for delete using (author_id = auth.uid());
create or replace function public.guard_hit_request() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.conversation_id := null; new.created_at := now(); new.cancelled := false; return new; end if;
  if auth.uid() is not null and coalesce(current_setting('courtside.hit_system', true), '') <> 'on' then
    new.conversation_id := old.conversation_id; new.created_at := old.created_at; new.author_id := old.author_id;
  end if;
  return new;
end $$;
drop trigger if exists guard_hit_request on public.hit_requests;
create trigger guard_hit_request before insert or update on public.hit_requests for each row execute function public.guard_hit_request();

-- Who is in: visible to everyone who can see the hit (it is a public sign-up).
drop policy if exists "joins are visible" on public.hit_joins;
create policy "joins are visible" on public.hit_joins for select using (exists (select 1 from public.hit_requests h where h.id = hit_id));
drop policy if exists "leave a hit" on public.hit_joins;
create policy "leave a hit" on public.hit_joins for delete using (user_id = auth.uid());

-- "I'm in": join, and land in the hit's group chat (made on the first join).
create or replace function public.join_hit(hit uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  taken int;
  conv uuid;
  label text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit;
  if not found or h.cancelled then raise exception 'That hit is no longer on.'; end if;
  if h.author_id = me then raise exception 'That is your own hit.'; end if;
  if h.starts_at < now() - interval '1 hour' then raise exception 'That hit has already happened.'; end if;
  if public.is_blocked_between(me, h.author_id) then raise exception 'blocked'; end if;
  -- Teen protection, as in chats: a player not known to be an adult only plays with people who follow each other.
  if (exists (select 1 from public.profiles where id in (me, h.author_id) and age_group is distinct from 'adult'))
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    raise exception 'teen_closed';
  end if;
  if exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return h.conversation_id; end if;
  select count(*) into taken from public.hit_joins where hit_id = hit;
  if taken >= h.spots then raise exception 'That hit is full.'; end if;
  insert into public.hit_joins (hit_id, user_id) values (hit, me);
  conv := h.conversation_id;
  if conv is null then
    label := 'Hit · ' || coalesce(h.place->>'name', 'Court');
    insert into public.conversations (title, is_group, created_by) values (left(label, 60), true, h.author_id) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, h.author_id), (conv, me) on conflict do nothing;
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set conversation_id = conv where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  else
    insert into public.conversation_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
  end if;
  perform public.file_notification(h.author_id, me, 'hit-join', hit::text, 'hit-request', coalesce(h.place->>'name', 'your hit'), false);
  return conv;
end $$;
grant execute on function public.join_hit(uuid) to authenticated;

-- Changing your mind: out of the list (the chat is yours to leave too).
create or replace function public.leave_hit(hit uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.hit_joins where hit_id = hit and user_id = auth.uid();
end $$;
grant execute on function public.leave_hit(uuid) to authenticated;

-- Phone alerts know the new kind of notification.
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
