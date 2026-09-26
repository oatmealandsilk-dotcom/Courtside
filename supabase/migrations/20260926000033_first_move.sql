-- The first move a new player makes after setup (post, answer, ask, or
-- "later"), and the numbers that say whether it works: how many new players
-- make a move on day one, and whether they come back in week two more often
-- than those who don't. Safe to run more than once.
alter table public.profiles add column if not exists first_move text;
alter table public.profiles add column if not exists first_move_at timestamptz;
alter table public.profiles drop constraint if exists profiles_first_move_check;
alter table public.profiles add constraint profiles_first_move_check check (first_move is null or first_move in ('post', 'instant', 'answer', 'ask', 'later'));

create or replace function public.first_day_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  with people as (
    select p.id, p.created_at, p.first_move from public.profiles p
    where p.created_at >= now() - interval '120 days'
  ), marked as (
    select pe.*,
      (exists (select 1 from public.posts x where x.author_id = pe.id and x.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.questions q where q.author_id = pe.id and q.created_at < pe.created_at + interval '1 day')
        or exists (select 1 from public.answers a where a.author_id = pe.id and a.created_at < pe.created_at + interval '1 day')) as moved,
      (exists (select 1 from public.feed_signals f where f.user_id = pe.id
                 and (f.last_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'
                      or f.first_seen_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days'))
        or exists (select 1 from public.posts x where x.author_id = pe.id and x.created_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days')
        or exists (select 1 from public.answers a where a.author_id = pe.id and a.created_at between pe.created_at + interval '7 days' and pe.created_at + interval '14 days')) as back
    from people pe
  )
  select jsonb_build_object(
    'new30', count(*) filter (where created_at >= now() - interval '30 days'),
    'moved30', count(*) filter (where created_at >= now() - interval '30 days' and moved),
    'cohort', count(*) filter (where created_at <= now() - interval '14 days'),
    'movers', count(*) filter (where created_at <= now() - interval '14 days' and moved),
    'moversBack', count(*) filter (where created_at <= now() - interval '14 days' and moved and back),
    'othersBack', count(*) filter (where created_at <= now() - interval '14 days' and not moved and back),
    'picked', jsonb_build_object(
      'post', count(*) filter (where first_move = 'post'),
      'instant', count(*) filter (where first_move = 'instant'),
      'answer', count(*) filter (where first_move = 'answer'),
      'ask', count(*) filter (where first_move = 'ask'),
      'later', count(*) filter (where first_move = 'later'))
  ) into out from marked;
  return out;
end $$;
revoke all on function public.first_day_stats() from public;
grant execute on function public.first_day_stats() to authenticated;
