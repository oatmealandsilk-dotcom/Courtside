-- Coach applications carry a link to the applicant's rating page — their UTR
-- profile on utrsports.net or their NTRP page on usta.com — so a reviewer can
-- check the rating with one click instead of searching for the person.
alter table public.coach_applications add column if not exists utr_link text;
alter table public.coach_applications add column if not exists ntrp_link text;

-- When the team changes an application's status (in Table Editor, or later
-- from a review screen), the applicant hears about it: a notification in
-- the app, which also sends a push alert. The note written in review_note,
-- if any, is included.
create or replace function public.notify_coach_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  words text;
begin
  if new.status is not distinct from old.status then return new; end if;
  words := case new.status
    when 'in-review' then 'Your coach application is being reviewed.'
    when 'approved' then 'Your coach application was approved. Welcome to CourtSide coaching!'
    when 'rejected' then 'Your coach application was not approved this time.'
    else 'Your coach application was updated.' end;
  if coalesce(new.review_note, '') <> '' then words := words || ' ' || new.review_note; end if;
  new.reviewed_at := now();
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
    values (new.user_id, new.user_id, 'coach-application', new.id::text, 'coach-application', left(words, 280));
  return new;
end $$;
drop trigger if exists notify_coach_application on public.coach_applications;
create trigger notify_coach_application before update on public.coach_applications
  for each row execute function public.notify_coach_application();

-- Push alerts: an application update comes from CourtSide itself, so it is
-- sent even though it is filed under the applicant's own name.
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
  if new.kind = 'posted' or new.user_id = new.actor_id then return new; end if;
  select coalesce(push_likes, true), coalesce(push_coach, true) into likes_on, coach_on from public.user_state where user_id = new.user_id;
  if new.kind = 'like' and likes_on is false then return new; end if;
  if new.kind = 'coach-reply' and coach_on is false then return new; end if;
  select coalesce(nullif(name, ''), handle, 'Someone') into who from public.profiles where id = new.actor_id;
  what := case new.kind
    when 'like' then 'liked your ' || case new.target_kind when 'hit' then 'hit' when 'question' then 'thread' else 'post' end
    when 'comment' then 'commented on your ' || case new.target_kind when 'hit' then 'hit' else 'post' end
    when 'answer' then 'replied to your thread'
    when 'coach-reply' then 'answered your question'
    when 'helpful' then 'found your reply helpful'
    when 'share' then 'shared your post'
    when 'follow' then 'started following you'
    when 'tag' then 'tagged you in a post'
    when 'follow-request' then 'asked to follow you'
    when 'follow-accepted' then 'accepted your follow request'
    else 'did something on CourtSide' end;
  link := case
    when new.kind in ('follow', 'follow-request', 'follow-accepted') then '/user/' || new.actor_id
    when new.target_kind = 'post' then '/post/' || new.target_id
    when new.target_kind = 'hit' then '/hits/' || new.target_id
    when new.target_kind = 'question' then '/question/' || new.target_id
    else '/notifications' end;
  perform public.send_push(new.user_id, coalesce(who, 'Someone') || ' ' || what, new.preview, link);
  return new;
end $$;
