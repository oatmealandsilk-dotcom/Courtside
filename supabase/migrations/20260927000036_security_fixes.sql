-- Security fixes from the September 27 review. Safe to run more than once.
-- Each section says what someone could do before, and what stops it now.

-- ------------------------------------------------------ 1. invite links
-- Before: anyone could call claim_referral with anyone's handle, any time,
-- and it made both people follow each other. That opened private accounts
-- and let an adult start messages with a teen.
-- Now: it only counts once, within a day of signing up; it never makes the
-- inviter follow you; and a private inviter gets a follow request instead.
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;

create or replace function public.claim_referral(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
  who uuid;
  mine public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into mine from public.profiles where id = me for update;
  if mine.id is null or mine.referred_by is not null or mine.created_at < now() - interval '1 day' then return null; end if;
  select id into who from public.profiles where handle = wanted;
  if who is null and to_regclass('public.handle_history') is not null then
    execute 'select user_id from public.handle_history where handle = $1 order by released_at desc limit 1' into who using wanted;
  end if;
  if who is null or who = me or public.is_blocked_between(me, who) then return null; end if;
  perform set_config('courtside.referral', 'on', true);
  update public.profiles set referred_by = who where id = me;
  perform set_config('courtside.referral', 'off', true);
  if coalesce((select is_private from public.profiles where id = who), false) then
    insert into public.follow_requests (requester_id, target_id) values (me, who) on conflict do nothing;
  else
    insert into public.follows (follower_id, following_id) values (me, who) on conflict do nothing;
  end if;
  return who;
end;
$$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

-- The profile guard, again (same rules as migration 35), plus: who invited
-- you moves only inside claim_referral.
alter table public.profiles add column if not exists handle_changed_at timestamptz;
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
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------ 2. private accounts
-- Before: a follow could be written straight into the table, skipping the
-- request a private account has to accept. Now: only public accounts can be
-- followed directly; accepting a request still works (it runs as the server).
drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows for insert with check (
  auth.uid() = follower_id
  and not public.blocked_with(following_id)
  and not coalesce((select p.is_private from public.profiles p where p.id = following_id), false)
);

-- ------------------------------------------------------ 3. uploaded files
-- Before: anyone could list every file in the media bucket, including
-- archived and removed posts. Public links still work without this rule.
-- Now: you can list only your own folder. Also: at most 60 uploads a day
-- per person, and only real photo and video types (no SVG pages).
drop policy if exists "media is public" on storage.objects;
drop policy if exists "list your own media" on storage.objects;
create policy "list your own media" on storage.objects for select
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "upload into your folder" on storage.objects;
create policy "upload into your folder" on storage.objects for insert
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
    and (select count(*) from storage.objects o
         where o.bucket_id = 'media' and o.name like auth.uid()::text || '/%' and o.created_at > now() - interval '1 day') < 60
  );
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif',
                                 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v']
  where id = 'media';

-- ------------------------------------------------------ 4. coach badges
-- Before: anyone could reply to "Ask a coach" questions, or mark their own
-- answer as a coach's, and get the verified badge. Now: only approved
-- coaches can reply there, and the badge is stamped by the server.
drop policy if exists "reply as yourself" on public.coach_replies;
create policy "reply as yourself" on public.coach_replies for insert with check (
  auth.uid() = coach_user_id
  and exists (select 1 from public.profiles where id = auth.uid() and is_coach)
);
create or replace function public.stamp_from_coach()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.from_coach := coalesce((select is_coach from public.profiles where id = new.author_id), false);
  return new;
end $$;
drop trigger if exists stamp_from_coach on public.answers;
create trigger stamp_from_coach before insert or update on public.answers
  for each row execute function public.stamp_from_coach();

-- ------------------------------------------------------ 5. reports
-- Before: a report could name anyone as the person responsible, so an admin
-- acting on it could suspend the wrong account. Now: for a post or instant
-- the server fills in its real author, and every report starts open.
create or replace function public.stamp_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := split_part(new.target, ':', 1);
  thing text := split_part(new.target, ':', 2);
begin
  new.status := 'open';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.created_at := now();
  if thing ~ '^[0-9a-f-]{36}$' then
    if kind = 'post' then new.target_user_id := (select author_id from public.posts where id = thing::uuid);
    elsif kind = 'hit' then new.target_user_id := (select author_id from public.stories where id = thing::uuid);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists stamp_report on public.reports;
create trigger stamp_report before insert on public.reports
  for each row execute function public.stamp_report();

-- ------------------------------------------------------ 6. waitlist
-- Before: rows could be written straight into the waitlist with any date.
-- The page joins through join_waitlist, which stays; the direct door closes.
drop policy if exists "anyone can join the waitlist" on public.waitlist;

-- ------------------------------------------------------ 7. the age check
-- Before: a birthday could be edited or deleted from the settings row and
-- the check run again, turning a teen into an adult. Now: once set, the
-- birthday moves only inside set_birth_date (which never changes it).
-- And an account with no age yet is treated with the teen protections.
create or replace function public.guard_birth_date()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('courtside.age_check', true), '') <> 'on' then
    if tg_op = 'UPDATE' then new.birth_date := old.birth_date;
    elsif tg_op = 'INSERT' then new.birth_date := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_birth_date on public.user_state;
create trigger guard_birth_date before insert or update on public.user_state
  for each row execute function public.guard_birth_date();
drop policy if exists "your settings are yours" on public.user_state;
drop policy if exists "read your settings" on public.user_state;
drop policy if exists "start your settings" on public.user_state;
drop policy if exists "change your settings" on public.user_state;
create policy "read your settings" on public.user_state for select using (auth.uid() = user_id);
create policy "start your settings" on public.user_state for insert with check (auth.uid() = user_id);
create policy "change your settings" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_birth_date(dob date)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  stored date;
  years int;
  label text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select birth_date into stored from public.user_state where user_id = me;
  if stored is null then
    if dob is null or dob > current_date or dob < date '1900-01-01' then raise exception 'bad date'; end if;
    stored := dob;
  end if;
  years := extract(year from age(current_date, stored))::int;
  if years < 13 then
    raise exception 'under_13';
  end if;
  perform set_config('courtside.age_check', 'on', true);
  insert into public.user_state (user_id, birth_date) values (me, stored)
    on conflict (user_id) do update set birth_date = coalesce(public.user_state.birth_date, excluded.birth_date);
  label := case when years < 18 then 'teen' else 'adult' end;
  update public.profiles
    set age_group = label,
        is_private = case when label = 'teen' and age_group is null then true else is_private end
    where id = me;
  perform set_config('courtside.age_check', 'off', true);
  return label;
end $$;

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
  -- Anyone not known to be an adult gets the teen protection: they must follow you first.
  if exists (select 1 from public.profiles where id = other and age_group is distinct from 'adult')
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    raise exception 'teen_closed';
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;

-- ------------------------------------------------------ 8. honest new rows
-- Before: a new row could carry its own date (a post dated 2099 stays at
-- the top forever), its own view and vote counts, or an instant that never
-- expires. Now: the server sets those when a person adds the row.
create or replace function public.stamp_new_row()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  new.created_at := now();
  case tg_table_name
    when 'posts' then new.views := 0; new.shares := 0; new.removed_at := null; new.edited_at := null;
    when 'stories' then new.expires_at := now() + interval '24 hours'; new.removed_at := null;
    when 'questions' then new.votes := 0; new.voted_by := '{}'::jsonb;
    when 'answers' then new.votes := 0; new.voted_by := '{}'::jsonb;
    when 'tips' then new.votes := 0; new.voted_by := '{}'::jsonb;
    when 'coach_replies' then new.helpful_by := '{}';
    else null;
  end case;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['posts', 'stories', 'questions', 'answers', 'tips', 'coach_questions', 'coach_replies', 'comments', 'story_comments', 'messages'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists stamp_new_row on public.%I', t);
      execute format('create trigger stamp_new_row before insert on public.%I for each row execute function public.stamp_new_row()', t);
    end if;
  end loop;
end $$;

-- And afterwards: an instant's expiry and a post's "first post" mark stay put.
create or replace function public.guard_story_expiry()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.expires_at := old.expires_at;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_story_expiry on public.stories;
create trigger guard_story_expiry before update on public.stories
  for each row execute function public.guard_story_expiry();
create or replace function public.guard_first_post()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.is_first := old.is_first; end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name = 'is_first') then
    drop trigger if exists guard_first_post on public.posts;
    create trigger guard_first_post before update on public.posts for each row execute function public.guard_first_post();
  end if;
end $$;

-- ------------------------------------------------------ 9. what others can see
-- Before: comments and likes on private, archived or removed posts could be
-- read by anyone, and anyone could see who viewed every instant. Now: you
-- see comments and likes only on posts and instants you can see, and only
-- an instant's author sees who viewed it.
drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select
  using (not public.blocked_with(author_id) and exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists "hit comments are public" on public.story_comments;
create policy "hit comments are public" on public.story_comments for select
  using (not public.blocked_with(author_id) and exists (select 1 from public.stories s where s.id = story_comments.story_id));
drop policy if exists "likes are public" on public.post_likes;
create policy "likes are public" on public.post_likes for select
  using (exists (select 1 from public.posts p where p.id = post_likes.post_id));
drop policy if exists "hit likes are public" on public.story_likes;
create policy "hit likes are public" on public.story_likes for select
  using (exists (select 1 from public.stories s where s.id = story_likes.story_id));
drop policy if exists "story views are public" on public.story_views;
drop policy if exists "story viewers for the author" on public.story_views;
create policy "story viewers for the author" on public.story_views for select
  using (auth.uid() = user_id or auth.uid() = public.author_of_hit(story_id));

-- ------------------------------------------------------ 10. chats
-- Before: your membership row could be moved into someone else's chat, and
-- any member could rewrite anyone's message. Now: members can only mark
-- where they have read to, and only a message's sender can change its words.
revoke update on public.conversation_members from anon, authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
create or replace function public.guard_message_edit()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.sender_id := old.sender_id;
    new.conversation_id := old.conversation_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body and auth.uid() <> old.sender_id then
      raise exception 'only the sender can edit a message';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_message_edit on public.messages;
create trigger guard_message_edit before update on public.messages
  for each row execute function public.guard_message_edit();

-- No more than 30 messages a minute from one person (every one sends a push alert).
create or replace function public.limit_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'slow down' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists limit_messages on public.messages;
create trigger limit_messages before insert on public.messages
  for each row execute function public.limit_messages();
create index if not exists messages_sender_time_idx on public.messages (sender_id, created_at desc);

-- ------------------------------------------------------ 11. sizes
-- Nothing a person types can be megabytes long. (Rows already there are left alone.)
do $$
declare c record;
begin
  for c in select * from (values
    ('messages', 'body', 4000), ('questions', 'title', 300), ('questions', 'body', 10000),
    ('answers', 'body', 10000), ('tips', 'body', 1000), ('coach_questions', 'title', 300),
    ('coach_questions', 'body', 10000), ('coach_replies', 'body', 10000), ('reports', 'reason', 1000),
    ('reports', 'target', 200), ('comments', 'body', 2200), ('story_comments', 'body', 2200)
  ) as v(tbl, col, max) loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.tbl and column_name = c.col) then
      begin
        execute format('alter table public.%I add constraint %I check (char_length(%I) <= %s) not valid', c.tbl, c.tbl || '_' || c.col || '_len', c.col, c.max);
      exception when duplicate_object then null;
      end;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------ 12. AI coach limits
-- Before: many questions sent at once all saw "0 used" and all reached the
-- paid model. Now: each question takes its place in the count before the
-- model is called, in one step that cannot be raced.
create or replace function public.take_coach_message(p_user uuid, p_cap int)
returns int language sql security definer set search_path = public as $$
  insert into public.coach_usage as u (user_id, day, messages)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set messages = u.messages + 1 where u.messages < p_cap
  returning messages;
$$;
revoke all on function public.take_coach_message(uuid, int) from public, anon, authenticated;

create table if not exists public.plan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_of date not null,
  plans   int  not null default 0,
  primary key (user_id, week_of)
);
alter table public.plan_usage enable row level security;
create or replace function public.take_plan(p_user uuid, p_week date, p_cap int)
returns int language sql security definer set search_path = public as $$
  insert into public.plan_usage as u (user_id, week_of, plans) values (p_user, p_week, 1)
  on conflict (user_id, week_of) do update set plans = u.plans + 1 where u.plans < p_cap
  returning plans;
$$;
revoke all on function public.take_plan(uuid, date, int) from public, anon, authenticated;

-- ------------------------------------------------------ 13. small leaks
-- Author lookups no longer answer people who are not signed in.
revoke execute on function public.author_of_post(uuid), public.author_of_hit(uuid), public.author_of_comment(uuid), public.author_of_hit_comment(uuid) from anon;
