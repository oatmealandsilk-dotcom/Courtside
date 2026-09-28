-- Last seen on the map: where a player last had Location on, to about a
-- kilometre, and when. Only signed-in adults see adults' spots; a teen's
-- is never shown to anyone but the teen. Blocking hides it both ways.
-- Turning Location off in the app deletes the row. Someone who hides their
-- activity status keeps a spot on the map but no "active 2h ago".
-- Needs migrations 08 (user_state), 13 (age_group) and 21 (blocked_with).
-- Safe to run more than once.
create table if not exists public.last_seen (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  city text check (city is null or char_length(city) <= 80),
  seen_at timestamptz not null default now(),
  show_activity boolean not null default true
);

alter table public.last_seen enable row level security;
drop policy if exists "adults see adults' last spot" on public.last_seen;
create policy "adults see adults' last spot" on public.last_seen for select to authenticated using (
  user_id = auth.uid()
  or (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.age_group = 'adult')
    and exists (select 1 from public.profiles p where p.id = last_seen.user_id and p.age_group = 'adult')
    and not public.blocked_with(user_id)
  )
);
-- No insert, update or delete policies: writes go through the two functions below.

-- Records your spot, rounded to two decimals (about a kilometre), never finer.
create or replace function public.mark_last_seen(p_lat double precision, p_lng double precision, p_city text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  shown boolean;
begin
  if me is null or p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return; end if;
  select coalesce(show_activity, true) into shown from public.user_state where user_id = me;
  insert into public.last_seen (user_id, lat, lng, city, seen_at, show_activity)
  values (me, round(p_lat::numeric, 2), round(p_lng::numeric, 2), left(nullif(btrim(p_city), ''), 80), now(), coalesce(shown, true))
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, city = excluded.city, seen_at = now(), show_activity = excluded.show_activity;
end $$;
revoke all on function public.mark_last_seen(double precision, double precision, text) from public;
grant execute on function public.mark_last_seen(double precision, double precision, text) to authenticated;

-- Location off: the spot goes.
create or replace function public.forget_last_seen()
returns void language sql security definer set search_path = public as $$
  delete from public.last_seen where user_id = auth.uid();
$$;
revoke all on function public.forget_last_seen() from public;
grant execute on function public.forget_last_seen() to authenticated;
