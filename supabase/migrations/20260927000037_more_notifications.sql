-- More reasons to hear from CourtSide, the kinds that keep Instagram, TikTok
-- and Reddit inboxes busy. Safe to run more than once.
--   upvote        someone upvoted your thread
--   upvote-reply  someone upvoted your reply
--   milestone     your post passed 10, 25, 50, 100, 250... views
--   joined        a new player near you just joined

-- ------------------------------------------------------------ votes that save
-- A fix, not a feature: votes on threads and replies were never saved. The
-- guard on them only let an update through when the request said
-- "service_role", which Supabase no longer says, so even the voting
-- function's own update was refused (the vote showed on screen, then was
-- gone next time). The guard now lets through exactly the voting functions,
-- which raise a flag for their own step, the way the view counter does.
create or replace function public.guard_vote_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.voting', true), '') <> 'on'
     and auth.uid() is not null
     and (new.votes <> old.votes or new.voted_by <> old.voted_by) then
    raise exception 'votes go through vote_question / vote_answer';
  end if;
  return new;
end $$;
create or replace function public.vote_question(q uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.questions where id = q;
  if r is null then return; end if;
  perform set_config('courtside.voting', 'on', true);
  update public.questions set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = q;
  perform set_config('courtside.voting', 'off', true);
end $$;
create or replace function public.vote_answer(a uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.answers where id = a;
  if r is null then return; end if;
  perform set_config('courtside.voting', 'on', true);
  update public.answers set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = a;
  perform set_config('courtside.voting', 'off', true);
end $$;
grant execute on function public.vote_question(uuid, int) to authenticated;
grant execute on function public.vote_answer(uuid, int) to authenticated;

-- ------------------------------------------------------------ upvotes
create or replace function public.notify_question_upvote()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  for k in select key from jsonb_each_text(coalesce(new.voted_by, '{}'::jsonb))
           where value = '1' and (coalesce(old.voted_by, '{}'::jsonb) ->> key) is distinct from '1' loop
    begin
      perform public.file_notification(new.author_id, k::uuid, 'upvote', new.id::text, 'question', new.title);
    exception when others then null;
    end;
  end loop;
  return new;
end $$;
drop trigger if exists notify_question_upvote on public.questions;
create trigger notify_question_upvote after update of voted_by on public.questions
  for each row execute function public.notify_question_upvote();

create or replace function public.notify_answer_upvote()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  for k in select key from jsonb_each_text(coalesce(new.voted_by, '{}'::jsonb))
           where value = '1' and (coalesce(old.voted_by, '{}'::jsonb) ->> key) is distinct from '1' loop
    begin
      perform public.file_notification(new.author_id, k::uuid, 'upvote-reply', new.question_id::text, 'question', new.body);
    exception when others then null;
    end;
  end loop;
  return new;
end $$;
drop trigger if exists notify_answer_upvote on public.answers;
create trigger notify_answer_upvote after update of voted_by on public.answers
  for each row execute function public.notify_answer_upvote();

-- ------------------------------------------------------------ view milestones
create or replace function public.notify_view_milestone()
returns trigger language plpgsql security definer set search_path = public as $$
declare m int;
begin
  foreach m in array array[10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000] loop
    if coalesce(old.views, 0) < m and coalesce(new.views, 0) >= m then
      insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
      values (new.author_id, new.author_id, 'milestone', new.id::text, 'post', m::text || ' views');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists notify_view_milestone on public.posts;
create trigger notify_view_milestone after update of views on public.posts
  for each row execute function public.notify_view_milestone();

-- ------------------------------------------------------------ new players nearby
-- The first time a new account says where it plays, players in the same
-- city hear about it (at most 50, never anyone blocked either way).
create or replace function public.notify_joined_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare city text;
begin
  if coalesce(old.location, '') <> '' or coalesce(new.location, '') = '' then return new; end if;
  if new.created_at < now() - interval '14 days' then return new; end if;
  city := lower(trim(split_part(new.location, ',', 1)));
  if char_length(city) < 2 then return new; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
  select p.id, new.id, 'joined', new.id::text, 'profile', new.location
  from public.profiles p
  where p.id <> new.id
    and lower(trim(split_part(p.location, ',', 1))) = city
    and not public.is_blocked_between(p.id, new.id)
  order by p.created_at desc
  limit 50;
  return new;
end $$;
drop trigger if exists notify_joined_nearby on public.profiles;
create trigger notify_joined_nearby after update of location on public.profiles
  for each row execute function public.notify_joined_nearby();

-- ------------------------------------------------------------ push alerts
-- Same as migration 35, plus the four new kinds.
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
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted', 'joined') then '/user/' || new.actor_id
    when new.target_kind = 'coaching-request' then '/coach-request/' || new.target_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    else '/notifications' end;
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;
