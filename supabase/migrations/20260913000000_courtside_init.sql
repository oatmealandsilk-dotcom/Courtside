-- CourtSide · first real schema: accounts, posts, stories, and the social
-- edges between them. Everything else (discussions, coaching, health) is
-- still served from the in-app fixtures and gets its own migration later.
--
-- Shapes mirror src/data/types.ts. jsonb columns hold the nested objects
-- (PlayerProfile, MatchResult, SessionDetail) exactly as the app uses them.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      text not null unique check (handle ~ '^[a-z0-9_]{2,24}$'),
  name        text not null check (char_length(name) between 1 and 60),
  bio         text not null default '',
  location    text not null default '',
  avatar_url  text,
  is_coach    boolean not null default false,
  -- PlayerProfile. Empty until onboarding finishes; the app treats no goals as "not onboarded".
  profile     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- A row appears the moment someone signs up, from the metadata the app sends.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  final  text := regexp_replace(wanted, '[^a-z0-9_]', '', 'g');
begin
  if char_length(final) < 2 then final := 'player'; end if;
  final := left(final, 20);
  -- Keep the handle unique without failing the sign-up.
  while exists (select 1 from public.profiles where handle = final) loop
    final := left(final, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, final, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(replace(final, '_', ' '))));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- posts
create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('clip', 'match', 'session', 'note', 'gear', 'milestone')),
  body            text not null default '',
  media_label     text,
  image_url       text,
  video_url       text,
  thumbnail_url   text,
  match           jsonb,
  session         jsonb,
  tags            text[] not null default '{}',
  tagged_user_ids uuid[] not null default '{}',
  archived        boolean not null default false,
  views           integer not null default 0,
  shares          integer not null default 0,
  created_at      timestamptz not null default now()
);
create index posts_feed_idx on public.posts (created_at desc) where not archived;
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_saves (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

-- ----------------------------------------------------------------- stories
create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  image_url     text,
  video_url     text,
  thumbnail_url text,
  media_label   text,
  caption       text,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);
create index stories_live_idx on public.stories (expires_at desc) where not archived;

create table public.story_views (
  story_id  uuid not null references public.stories (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- ----------------------------------------------------------------- follows
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

-- --------------------------------------------------------------- security
alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_saves    enable row level security;
alter table public.comments      enable row level security;
alter table public.comment_likes enable row level security;
alter table public.stories       enable row level security;
alter table public.story_views   enable row level security;
alter table public.follows       enable row level security;

-- Profiles: everyone can read, you can only change your own.
create policy "profiles are public"      on public.profiles for select using (true);
create policy "edit your own profile"    on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Posts: archived ones are only visible to their author.
create policy "read live posts"          on public.posts for select using (not archived or auth.uid() = author_id);
create policy "post as yourself"         on public.posts for insert with check (auth.uid() = author_id);
create policy "edit your own posts"      on public.posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "delete your own posts"    on public.posts for delete using (auth.uid() = author_id);

-- Likes, saves, views, follows: readable by all, written only as yourself.
create policy "likes are public"         on public.post_likes for select using (true);
create policy "like as yourself"         on public.post_likes for insert with check (auth.uid() = user_id);
create policy "unlike as yourself"       on public.post_likes for delete using (auth.uid() = user_id);

create policy "your saves are yours"     on public.post_saves for select using (auth.uid() = user_id);
create policy "save as yourself"         on public.post_saves for insert with check (auth.uid() = user_id);
create policy "unsave as yourself"       on public.post_saves for delete using (auth.uid() = user_id);

create policy "comments are public"      on public.comments for select using (true);
create policy "comment as yourself"      on public.comments for insert with check (auth.uid() = author_id);
create policy "delete your own comments" on public.comments for delete using (auth.uid() = author_id);

create policy "comment likes are public" on public.comment_likes for select using (true);
create policy "like comments as yourself" on public.comment_likes for insert with check (auth.uid() = user_id);
create policy "unlike comments as yourself" on public.comment_likes for delete using (auth.uid() = user_id);

-- Stories: live ones are public; archived and expired ones only for the author.
create policy "read live stories"        on public.stories for select using ((not archived and expires_at > now()) or auth.uid() = author_id);
create policy "post stories as yourself" on public.stories for insert with check (auth.uid() = author_id);
create policy "edit your own stories"    on public.stories for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "delete your own stories"  on public.stories for delete using (auth.uid() = author_id);

create policy "story views are public"   on public.story_views for select using (true);
create policy "view as yourself"         on public.story_views for insert with check (auth.uid() = user_id);

create policy "follows are public"       on public.follows for select using (true);
create policy "follow as yourself"       on public.follows for insert with check (auth.uid() = follower_id);
create policy "unfollow as yourself"     on public.follows for delete using (auth.uid() = follower_id);

-- ----------------------------------------------------------------- storage
-- One public bucket for photos, clips and story media. Files live under
-- <user id>/..., which is how the write policies know whose they are.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy "media is public"          on storage.objects for select using (bucket_id = 'media');
create policy "upload into your folder"  on storage.objects for insert
  with check (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "replace your own files"   on storage.objects for update
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "delete your own files"    on storage.objects for delete
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------- counters
-- View counts are written by whoever is watching, which RLS would otherwise
-- block; this runs as the owner and only ever adds one.
create or replace function public.bump_post_views(post uuid)
returns void language sql security definer set search_path = public as $$
  update public.posts set views = views + 1 where id = post;
$$;
grant execute on function public.bump_post_views(uuid) to authenticated;
