-- Push notifications and crash reports.
--
-- Push: each phone that allows alerts leaves its push address (a "token")
-- here. When something is filed for someone — a like, a reply, a follow —
-- or a message arrives for them, the database itself asks Expo's push
-- service to deliver an alert to their phones. Likes and coach replies
-- respect the switches in Settings.
--
-- Crash reports: when the app hits an error it files what happened here
-- (the error, the screen, the app version and platform, the account), so
-- problems are seen without anyone having to report them. Read them in
-- Table Editor → app_errors. Nobody can read them from the app.
--
-- Needs migrations 06 (messages) and 08 (notifications, user_state).

create extension if not exists pg_net;

-- ------------------------------------------------------------ push addresses
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "your push addresses" on public.push_tokens;
create policy "your push addresses" on public.push_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A phone that signs in as someone else hands its address over: the row is
-- replaced rather than refused. Runs as the owner so the old row can go.
create or replace function public.save_push_token(t text, p text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or t is null or length(t) < 10 then return; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at) values (t, auth.uid(), coalesce(p, 'ios'), now())
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;
grant execute on function public.save_push_token(text, text) to authenticated;

-- ------------------------------------------------------------ sending
-- One alert to every phone of one person, through Expo's push service.
-- Not callable from the app: only the triggers below use it.
create or replace function public.send_push(target uuid, title text, body text, href text)
returns void language plpgsql security definer set search_path = public as $$
declare
  messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', token, 'title', title, 'body', left(coalesce(body, ''), 180), 'sound', 'default',
    'data', jsonb_build_object('href', href)))
    into messages
    from public.push_tokens where user_id = target;
  if messages is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;
revoke all on function public.send_push(uuid, text, text, text) from public, anon, authenticated;

-- Something filed for someone: the same words the app's Notifications page uses.
create or replace function public.push_for_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  what text;
  link text;
  likes_on boolean := true;
  coach_on boolean := true;
begin
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
drop trigger if exists push_for_notification on public.notifications;
create trigger push_for_notification after insert on public.notifications
  for each row execute function public.push_for_notification();

-- A new message: an alert to everyone else in the chat, with the sender's name.
create or replace function public.push_for_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  member uuid;
  words text;
begin
  select coalesce(nullif(name, ''), handle, 'New message') into who from public.profiles where id = new.sender_id;
  words := case new.kind when 'post' then 'Sent a post' when 'question' then 'Sent a thread' when 'profile' then 'Sent a profile' else new.body end;
  for member in select user_id from public.conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    perform public.send_push(member, who, words, '/messages/' || new.conversation_id);
  end loop;
  return new;
end $$;
drop trigger if exists push_for_message on public.messages;
create trigger push_for_message after insert on public.messages
  for each row execute function public.push_for_message();

-- ------------------------------------------------------------ crash reports
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(message) <= 2000),
  stack text check (char_length(stack) <= 8000),
  screen text,
  platform text,
  app_version text,
  fatal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
-- Anyone using the app may file one (signed out too); nobody can read them back from the app.
drop policy if exists "file a crash report" on public.app_errors;
create policy "file a crash report" on public.app_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
