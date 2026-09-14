-- CourtSide · security hardening from the September audit.
--
-- 1. Owners may edit their profile but not promote themselves to coach,
--    change their handle, or rewrite counters. Those columns move only
--    under the service role.
-- 2. Server-side length limits on everything a user can type, so one
--    oversized row cannot slow the feed for everyone.
-- 3. The media bucket accepts photos and videos only, at 50 MB.
-- 4. A view counts once per person per post.
-- 5. Weekly plans record how many times they were generated, so the
--    Edge Function can cap regeneration.

-- ----------------------------------------------------- protected columns
create or replace function public.guard_profile_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.is_coach is distinct from old.is_coach then
      raise exception 'is_coach is not editable';
    end if;
    if new.handle is distinct from old.handle then
      raise exception 'handle is not editable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

create or replace function public.guard_post_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.views <> old.views or new.shares <> old.shares then
      raise exception 'counters are not editable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_post_columns on public.posts;
create trigger guard_post_columns
  before update on public.posts
  for each row execute function public.guard_post_columns();

-- ------------------------------------------------------------ size limits
alter table public.posts
  add constraint posts_body_len      check (char_length(body) <= 2200),
  add constraint posts_tags_count    check (cardinality(tags) <= 20 and cardinality(tagged_user_ids) <= 20),
  add constraint posts_media_label_len check (media_label is null or char_length(media_label) <= 120);

alter table public.stories
  add constraint stories_caption_len check (caption is null or char_length(caption) <= 200);

alter table public.profiles
  add constraint profiles_bio_len      check (char_length(bio) <= 300),
  add constraint profiles_location_len check (char_length(location) <= 80),
  add constraint profiles_profile_size check (pg_column_size(profile) <= 16384);

-- ------------------------------------------------------------- media bucket
update storage.buckets set
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'],
  file_size_limit = 52428800
where id = 'media';

-- ----------------------------------------------------------- honest views
create table if not exists public.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);
alter table public.post_views enable row level security;
-- Nobody reads or writes this directly; bump_post_views is the only way in.

create or replace function public.bump_post_views(post uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.post_views (post_id, user_id) values (post, auth.uid())
    on conflict do nothing;
  if found then
    update public.posts set views = views + 1 where id = post;
  end if;
end $$;

-- ----------------------------------------------------------- plan cap
alter table public.training_plans
  add column if not exists generations int not null default 0;
