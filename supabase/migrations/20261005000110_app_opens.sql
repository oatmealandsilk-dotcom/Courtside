-- CourtSide · migration 110: "opened the app today" (Oct 5, owner).
--
-- What it is for: seeing whether people come back. One row per person per
-- day they open the app, kept in our own database (no outside analytics
-- company), so the owner can read:
--   * daily active users: how many different people opened the app that day;
--   * day-1 return: of the new players whose first day was D, how many
--     opened it again on D + 1;
--   * day-7 return: the same, a week later (D + 7).
--
-- How it is written: only through note_app_open(platform, day), which the
-- app calls once a day when it starts or comes back to the front. It can
-- only ever write the caller's own row, and only the first open of a day
-- counts (later ones change nothing). Nobody can read, change or delete
-- rows from the app, except admins reading them.
--
-- The day is the phone's own date (so a 9pm sign-up in New York and a
-- next-morning open count as day 0 and day 1, not as the same UTC day). It
-- must be within one day of today in UTC, which every time zone on Earth
-- is; anything else is taken as today in UTC.
--
-- How to read it (Supabase → SQL Editor → New query):
--   select * from public.retention_summary();      -- one line per day, newest first
--   select * from public.retention_overall();      -- the last 30 days in one line
-- Both also answer an admin signed in to the app.
--
-- "New" means the account was made around its first recorded open, so
-- people who already had accounts before this shipped are not counted as
-- new on the day tracking started. Rows go when the account is deleted.
-- Safe to run more than once.

begin;

create table if not exists public.app_opens (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  day      date not null,
  first_at timestamptz not null default now(),
  platform text not null default 'other' check (platform in ('ios', 'android', 'web', 'other')),
  primary key (user_id, day)
);
create index if not exists app_opens_day_idx on public.app_opens (day);

alter table public.app_opens enable row level security;
revoke all on public.app_opens from public, anon, authenticated;
-- Admins may read the rows (the app's own admin pages could, later); nobody writes them directly.
grant select on public.app_opens to authenticated;
drop policy if exists app_opens_admin_read on public.app_opens;
create policy app_opens_admin_read on public.app_opens for select to authenticated using (public.is_admin());

-- The one way in: the caller's own row for today, first open of the day only.
create or replace function public.note_app_open(p_platform text, p_day date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  d     date := coalesce(p_day, (now() at time zone 'utc')::date);
  plat  text := case when lower(coalesce(p_platform, '')) in ('ios', 'android', 'web') then lower(p_platform) else 'other' end;
begin
  if me is null then return; end if;
  if d < today - 1 or d > today + 1 then d := today; end if;
  -- Someone still mid-sign-up has no profile yet: nothing to note, and no error.
  insert into public.app_opens (user_id, day, platform)
  select me, d, plat
  where exists (select 1 from public.profiles p where p.id = me)
  on conflict (user_id, day) do nothing;
end $$;
revoke all on function public.note_app_open(text, date) from public, anon;
grant execute on function public.note_app_open(text, date) to authenticated;

-- One line per day, newest first: who opened the app, who was new, and how
-- many of the new ones came back the next day and a week later. A rate is
-- empty until that next day (or week) has come.
-- Admins only: an admin signed in to the app, or the owner in the SQL editor
-- (a direct database connection, never the app's own connection).
create or replace function public.retention_summary(p_days int default 30)
returns table (
  day          date,
  active_users int,
  new_users    int,
  day1_back    int,
  day1_rate    numeric,
  day7_back    int,
  day7_rate    numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'utc')::date;
  span  int  := greatest(1, least(coalesce(p_days, 30), 366));
begin
  if not (public.is_admin() or session_user <> 'authenticator') then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
  with days as (
    select (today - g)::date as d from generate_series(0, span - 1) g
  ), active as (
    select o.day as d, count(*)::int as people from public.app_opens o
    where o.day >= today - span group by o.day
  ), firsts as (
    select o.user_id, min(o.day) as first_day from public.app_opens o group by o.user_id
  ), newcomers as (
    select f.user_id, f.first_day from firsts f
    join public.profiles p on p.id = f.user_id
    where (p.created_at at time zone 'utc')::date >= f.first_day - 1
  ), cohorts as (
    select nc.first_day as d,
      count(*)::int as joined,
      (count(*) filter (where exists (select 1 from public.app_opens o where o.user_id = nc.user_id and o.day = nc.first_day + 1)))::int as back1,
      (count(*) filter (where exists (select 1 from public.app_opens o where o.user_id = nc.user_id and o.day = nc.first_day + 7)))::int as back7
    from newcomers nc group by nc.first_day
  )
  select ds.d,
    coalesce(a.people, 0),
    coalesce(c.joined, 0),
    coalesce(c.back1, 0),
    case when ds.d + 1 > today or coalesce(c.joined, 0) = 0 then null else round(100.0 * c.back1 / c.joined, 1) end,
    coalesce(c.back7, 0),
    case when ds.d + 7 > today or coalesce(c.joined, 0) = 0 then null else round(100.0 * c.back7 / c.joined, 1) end
  from days ds
  left join active a on a.d = ds.d
  left join cohorts c on c.d = ds.d
  order by ds.d desc;
end $$;
revoke all on function public.retention_summary(int) from public, anon;
grant execute on function public.retention_summary(int) to authenticated;

-- The same days in one line: average daily active users, new players, and
-- the share of them who came back on day 1 and day 7 (only counting days
-- whose day 1, or day 7, has come). Admins only, through retention_summary.
create or replace function public.retention_overall(p_days int default 30)
returns table (
  days             int,
  avg_daily_active numeric,
  new_users        int,
  day1_rate        numeric,
  day7_rate        numeric
)
language sql stable security definer set search_path = public as $$
  select count(*)::int,
    round(avg(s.active_users), 1),
    coalesce(sum(s.new_users), 0)::int,
    round(100.0 * sum(s.day1_back) filter (where s.day1_rate is not null)
          / nullif(sum(s.new_users) filter (where s.day1_rate is not null), 0), 1),
    round(100.0 * sum(s.day7_back) filter (where s.day7_rate is not null)
          / nullif(sum(s.new_users) filter (where s.day7_rate is not null), 0), 1)
  from public.retention_summary(p_days) s
$$;
revoke all on function public.retention_overall(int) from public, anon;
grant execute on function public.retention_overall(int) to authenticated;

commit;

-- Check (should list note_app_open, retention_summary, retention_overall):
--   select proname from pg_proc where proname in ('note_app_open', 'retention_summary', 'retention_overall');
