-- Likes and comments on hits (stories), mirroring the post tables.
create table if not exists public.story_likes (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_comments (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists story_comments_story_idx on public.story_comments (story_id, created_at);

alter table public.story_likes    enable row level security;
alter table public.story_comments enable row level security;

create policy "hit likes are public"        on public.story_likes    for select using (true);
create policy "like hits as yourself"       on public.story_likes    for insert with check (auth.uid() = user_id);
create policy "unlike hits as yourself"     on public.story_likes    for delete using (auth.uid() = user_id);
create policy "hit comments are public"     on public.story_comments for select using (true);
create policy "comment on hits as yourself" on public.story_comments for insert with check (auth.uid() = author_id);
create policy "delete your own hit comments" on public.story_comments for delete using (auth.uid() = author_id);
