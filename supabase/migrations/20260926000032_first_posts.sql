-- Everyone's first post is marked, so the app can welcome it: a "New to
-- CourtSide" tag, a place near the top of nearby feeds, and a list for the
-- founder to say hi. Safe to run more than once.
alter table public.posts add column if not exists is_first boolean not null default false;

create or replace function public.mark_first_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_first := not exists (select 1 from public.posts p where p.author_id = new.author_id);
  return new;
end $$;

drop trigger if exists posts_mark_first on public.posts;
create trigger posts_mark_first before insert on public.posts
  for each row execute function public.mark_first_post();

-- Posts already there: each author's earliest one.
update public.posts set is_first = true
where id in (select distinct on (author_id) id from public.posts order by author_id, created_at asc)
  and is_first = false;

create index if not exists posts_first_recent_idx on public.posts (created_at desc) where is_first;
