-- Reports reach a person, and that person can act on them.
--
-- A report used to be saved and seen by nobody. From here on:
--   * accounts marked as admins (only from Supabase, never from the app)
--     can read every report, and are notified of each new one;
--   * from a report an admin can remove the post or hit (hidden from
--     everyone, but kept, so it can be put back), suspend the account (it can
--     no longer post, comment, reply or message) or dismiss the report;
--     removing and suspending can both be undone.
--
-- To make yourself an admin, run this once in the SQL Editor with your
-- handle in place of yours_here:
--   update public.profiles set is_admin = true where handle = 'yours_here';
--
-- Needs migrations 08 (reports), 14 and 17 (push), 18 (notifications) and
-- 21 (blocking). Safe to run more than once.

-- ------------------------------------------------------------ admins and suspensions
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists suspended_at timestamptz;

-- The app can never change these two: only Supabase itself (the SQL Editor,
-- where nobody is signed in) or an admin's decision below.
create or replace function public.guard_moderation_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('courtside.moderating', true), '') <> 'on' then
    new.is_admin := old.is_admin;
    new.suspended_at := old.suspended_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_moderation_columns on public.profiles;
create trigger guard_moderation_columns before update on public.profiles
  for each row execute function public.guard_moderation_columns();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- A suspended account cannot post, comment, reply or message.
create or replace function public.refuse_if_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'suspended';
  end if;
  return new;
end $$;
do $$
declare
  t text;
begin
  foreach t in array array['posts', 'stories', 'comments', 'story_comments', 'questions', 'answers', 'messages', 'coach_questions', 'coach_replies', 'tips'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists refuse_if_suspended on public.%I', t);
      execute format('create trigger refuse_if_suspended before insert on public.%I for each row execute function public.refuse_if_suspended()', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ removed posts and hits
alter table public.posts add column if not exists removed_at timestamptz;
alter table public.stories add column if not exists removed_at timestamptz;

-- Only an admin's decision can remove or restore; an owner editing their post cannot undo it.
create or replace function public.guard_removed()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.moderating', true), '') <> 'on' then
    new.removed_at := old.removed_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_removed on public.posts;
create trigger guard_removed before update on public.posts for each row execute function public.guard_removed();
drop trigger if exists guard_removed on public.stories;
create trigger guard_removed before update on public.stories for each row execute function public.guard_removed();

-- Removed posts and hits are hidden from everyone but admins (who need them to undo).
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id) and public.can_view(author_id) and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));
drop policy if exists "read live stories" on public.stories;
create policy "read live stories" on public.stories for select
  using (((not archived and expires_at > now()) or auth.uid() = author_id) and public.can_view(author_id) and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));

-- ------------------------------------------------------------ reports
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists reviewed_at timestamptz;
alter table public.reports add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
do $$ begin
  alter table public.reports add constraint reports_status_check check (status in ('open', 'removed', 'suspended', 'dismissed'));
exception when duplicate_object then null; end $$;
create index if not exists reports_status_idx on public.reports (status, created_at desc);
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select using (public.is_admin());

-- An admin's decision on a report: remove, restore, suspend, unsuspend or dismiss.
create or replace function public.moderate_report(report uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.reports%rowtype;
  kind text;
  target uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.reports where id = report;
  if not found then raise exception 'no such report'; end if;
  kind := split_part(r.target, ':', 1);
  if split_part(r.target, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target := split_part(r.target, ':', 2)::uuid;
  end if;
  perform set_config('courtside.moderating', 'on', true);
  if decision in ('remove', 'restore') then
    if kind = 'post' and target is not null then
      update public.posts set removed_at = case when decision = 'remove' then now() else null end where id = target;
    elsif kind = 'hit' and target is not null then
      update public.stories set removed_at = case when decision = 'remove' then now() else null end where id = target;
    end if;
  elsif decision in ('suspend', 'unsuspend') then
    update public.profiles set suspended_at = case when decision = 'suspend' then now() else null end where id = r.target_user_id;
  elsif decision <> 'dismiss' then
    raise exception 'unknown decision';
  end if;
  perform set_config('courtside.moderating', 'off', true);
  update public.reports set
    status = case decision when 'remove' then 'removed' when 'suspend' then 'suspended' when 'dismiss' then 'dismissed' else 'open' end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = report;
end $$;
grant execute on function public.moderate_report(uuid, text) to authenticated;

-- Every new report reaches every admin, in the app and by push.
create or replace function public.notify_admins_of_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin uuid;
begin
  for admin in select id from public.profiles where is_admin loop
    perform public.file_notification(admin, new.reporter_id, 'report', new.id::text, 'report',
      case split_part(new.target, ':', 1) when 'post' then 'Reported a post' when 'hit' then 'Reported a hit' when 'profile' then 'Reported a profile' else 'Sent a report' end,
      false);
  end loop;
  return new;
end $$;
drop trigger if exists notify_admins_of_report on public.reports;
create trigger notify_admins_of_report after insert on public.reports
  for each row execute function public.notify_admins_of_report();

-- Push alerts: the same as migration 17, plus reports for admins.
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
  if new.kind = 'report' then
    perform public.send_push(new.user_id, 'New report', coalesce(new.preview, 'Someone sent a report'), '/admin-reports');
    return new;
  end if;
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
