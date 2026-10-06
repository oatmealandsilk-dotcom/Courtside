-- CourtSide · migration 133: the first-move page's new moves (Oct 5, owner:
-- "Do all"). After setup, the page now leads with the one move that fits
-- where the player is: share their invite link ('invite'), follow players
-- near them ('follow'), or, for a teen, find a friend by @handle ('find').
-- A clip is the second option, and "Later" stays. This lets the profile
-- keep those three, and first_day_stats count them beside the others.
-- Until it runs, the app's save of one of the new moves is refused and
-- nothing is kept (quietly, as before); the old moves save as always.
-- Safe to run more than once.

begin;

alter table public.profiles drop constraint if exists profiles_first_move_check;
alter table public.profiles add constraint profiles_first_move_check
  check (first_move is null or first_move in ('post', 'instant', 'answer', 'ask', 'later', 'invite', 'follow', 'find'));

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
      'later', count(*) filter (where first_move = 'later'),
      'invite', count(*) filter (where first_move = 'invite'),
      'follow', count(*) filter (where first_move = 'follow'),
      'find', count(*) filter (where first_move = 'find'))
  ) into out from marked;
  return out;
end $$;
revoke all on function public.first_day_stats() from public;
grant execute on function public.first_day_stats() to authenticated;

commit;
