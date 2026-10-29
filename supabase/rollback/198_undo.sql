-- CourtSide · undo for migration 20261028000198_most_active_courts.
--
-- NOT A MIGRATION (it belongs in supabase/rollback/, outside supabase/migrations
-- on purpose). Run it in the Supabase SQL editor as one piece only to take 198
-- back out. All-or-nothing; safe to run more than once.
--
-- It puts city_page() back exactly as 197 wrote it (checked letter for letter
-- at the end), stops the 'courtside-active-courts' job, and removes what 198
-- added: refresh_active_courts(), private.city_board_court_place() and the four
-- tables (city_board_active_courts, city_board_active_months,
-- city_board_checkin_tally, city_board_checkin_days; numbers only, no one in
-- them). Nothing else is touched (no session, hit, check-in, profile or
-- setting; refresh_city_board() and its job stay as they are). The app needs
-- no change either way: with no `active_courts` it shows the calm empty line.

begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.city_page(text, date)') is null then
    raise exception 'Undo 198 stopped before changing anything: the city boards (196) are not there. Nothing to undo.';
  end if;
  -- Only 198's version (or 197's already, on a second run) is replaced.
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure)
       not in ('e6c05cc304a90e64a76e2c5d1e65e0c7', '24bc9c0f69ee4dfd8a68583971d6943e') then
    raise exception 'Undo 198 stopped before changing anything: city_page changed after 198. Ask Claude to look.';
  end if;
  perform set_config('courtside.u198_grants', (
    select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
      from pg_proc p
     where p.oid in ('public.city_page(text, date)'::regprocedure)), true);
end $$;

-- The job first, so it never runs half-way through this.
do $$
begin
  if to_regnamespace('cron') is not null and exists (select 1 from cron.job where jobname = 'courtside-active-courts') then
    perform cron.unschedule('courtside-active-courts');
  end if;
end $$;

-- 197's city_page, exactly as 197 wrote it.
create or replace function public.city_page(p_city text, p_month date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_rules record;
  v_adult boolean;
  v_muted text[];
  v_my_city text;
  v_mine boolean;
  v_b public.board_cities;
  v_c public.city_board_cities;
  v_of int;
  v_me public.city_board_members;
  v_member boolean;
  v_cap int;
  v_room int;
  v_cands uuid[];
  v_ok uuid[] := '{}';
  v_batch uuid[];
  v_paid uuid[];
  v_asked uuid[];
  v_i int := 1;
  v_top uuid[];
  v_up uuid[] := '{}';
  v_fill uuid[];
  v_top_json jsonb;
  v_my_rank int;
  v_fill_json jsonb;
  v_courts jsonb;
  v_clip jsonb;
  v_city jsonb;
  v_me_json jsonb;
  v_rest_n int;
  v_rest_s int;
  v_nf int;
  v_drop uuid[] := '{}';
  cl record;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.flag_on_for('city-board', me) then return jsonb_build_object('off', true); end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month not in (date_trunc('month', current_date - 3)::date, date_trunc('month', current_date)::date, date_trunc('month', current_date + 1)::date) then
    raise exception 'month out of range';
  end if;
  if p_city is null or p_city !~ '^[a-z0-9-]{2,60}$' then return jsonb_build_object('city', null); end if;
  select * into v_b from public.board_cities b where b.id = p_city;
  if not found then return jsonb_build_object('city', null); end if;
  select * into v_rules from private.city_board_rules();
  select * into v_c from public.city_board_cities cb where cb.month = p_month and cb.city_id = p_city;
  select private.city_board_city(p.city_lat, p.city_lng, p.location) into v_my_city from public.profiles p where p.id = me;
  v_mine := coalesce(v_my_city = p_city, false);
  -- A city not on the board yet opens only for its own players.
  if v_c.rank is null and not v_mine then return jsonb_build_object('city', null); end if;

  v_adult := public.known_adult(me);   -- your own age only
  select us.muted_ids into v_muted from public.user_state us where us.user_id = me;
  v_muted := coalesce(v_muted, '{}');
  select * into v_me from public.city_board_members mb where mb.month = p_month and mb.user_id = me and mb.city_id = p_city;
  -- You are one of the city's players (its totals hold you) only from yesterday's count.
  v_member := coalesce(v_me.sessions, 0) > 0;
  select count(*)::int into v_of from public.city_board_cities cb where cb.month = p_month and cb.rank is not null;

  -- On a ranked city, at least two counted players always stay out of your
  -- reach besides the adults (anyone can be shown all of them, muting their
  -- way down the list): else the last one's number is the total minus all
  -- the rest. Every teen who follows you counts as in reach (you could follow
  -- back), so your own follows can't move this. When fewer than two would be
  -- left, that many of those teens stay off your list here too, picked by id,
  -- never by number. Not a friend of any teen here: nothing changes (196).
  if v_c.rank is not null then
    select count(*)::int into v_nf
      from public.city_board_members mb
     where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me and not mb.named
       and not (mb.friends_only and exists (select 1 from public.follows f where f.follower_id = mb.user_id and f.following_id = me));
    if v_nf < 2 then
      v_drop := array(select mb.user_id from public.city_board_members mb
                       where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me and mb.friends_only
                         and exists (select 1 from public.follows f where f.follower_id = mb.user_id and f.following_id = me)
                       order by md5(me::text || mb.user_id::text), mb.user_id
                       limit 2 - v_nf);
    end if;
  end if;

  -- Everyone who may be named to you here, most sessions (as of yesterday) first.
  -- An adult (`named`): as 196. A teen or no birthday on file (`friends_only`,
  -- 197): only when you follow each other, and never when either of you muted
  -- the other. Anyone who is not a friend of a teen here gets exactly 196's list.
  select coalesce(array_agg(x.user_id order by x.sessions desc, x.last_day desc nulls last, x.user_id), '{}') into v_cands
    from (select mb.user_id, mb.sessions, mb.last_day, mb.named
            from public.city_board_members mb
           where mb.month = p_month and mb.city_id = p_city and mb.sessions > 0 and mb.user_id <> me
             and (mb.named or (mb.friends_only and not (mb.user_id = any (v_drop)) and public.follow_each_other(me, mb.user_id)))
             and not (mb.user_id::text = any (v_muted))
           order by mb.sessions desc, mb.last_day desc nulls last, mb.user_id
           limit 200) x
   where case when x.named
              then private.city_board_named(x.user_id)       -- still adult, switch on, activity on, not suspended
              else private.city_board_friends_only(x.user_id) -- still a teen, switch on, activity on, not suspended
                   and public.follow_each_other(me, x.user_id)
                   and not coalesce((select us.muted_ids from public.user_state us where us.user_id = x.user_id) @> array[me::text], false)
         end
     and (select private.city_board_city(pp.city_lat, pp.city_lng, pp.location) from public.profiles pp where pp.id = x.user_id) = p_city
     and not public.is_blocked_between(me, x.user_id)
     and public.can_view(x.user_id)                          -- a private account only once you follow it
     and (v_adult or public.follow_each_other(me, x.user_id)); -- a teen: friends who follow each other only

  -- Up to hit today, ringed. Your own city: today's Find Players rule
  -- (players_in_town, unchanged), less anyone you muted or who turned "Show
  -- me on city boards" off. Another city: friends who follow each other with
  -- you (decision 4), who may be named, whose profile town is that city.
  if v_mine then
    select coalesce(array_agg(t.user_id order by t.o), '{}') into v_up
      from public.players_in_town() with ordinality as t(user_id, o)
      join public.profiles p on p.id = t.user_id
      left join public.user_state us on us.user_id = t.user_id
     where p.open_to_hit_until > now()
       and coalesce(us.city_boards, true)
       and not (t.user_id::text = any (v_muted));
  else
    select coalesce(array_agg(p.id order by p.open_to_hit_until desc, p.id), '{}') into v_up
      from public.follows f
      join public.profiles p on p.id = f.following_id
     where f.follower_id = me and p.id <> me
       and p.open_to_hit_until > now()
       and public.follow_each_other(me, p.id)
       and not public.is_blocked_between(me, p.id)
       and not (p.id::text = any (v_muted))
       and private.city_board_named(p.id)
       and private.city_board_city(p.city_lat, p.city_lng, p.location) = p_city;
  end if;

  -- How many may carry a number: never more than players - 2 (- 1 more when you
  -- are one of them), so no one's own count can be worked out from the total.
  v_cap := case when v_c.rank is null then 0
                else least(v_rules.top_max, greatest(0, v_c.players - 2 - case when v_member then 1 else 0 end)) end;
  v_room := greatest(0, v_rules.fill_to - cardinality(v_up));
  -- A stranger who does not follow you costs the day's age-check allowance
  -- (109; seeing them here says they are an adult), 5 at a time, best first.
  while (cardinality(v_ok) < v_cap
         or (select count(*) from unnest(v_ok) as x where not (x = any (v_up))) < v_room)
        and v_i <= cardinality(v_cands) and v_i <= 40 loop
    v_batch := v_cands[v_i : v_i + 4];
    v_paid := array(select x from unnest(v_batch) as x
                     where not exists (select 1 from public.follows f where f.follower_id = x and f.following_id = me));
    v_asked := case when cardinality(v_paid) > 0 then public.age_rule_budget(v_paid) else '{}'::uuid[] end;
    v_ok := v_ok || array(select u.x from unnest(v_batch) with ordinality as u(x, o)
                           where not (u.x = any (v_paid)) or u.x = any (v_asked) order by u.o);
    v_i := v_i + 5;
  end loop;
  if v_rules.up_strangers_elsewhere and not v_mine then
    v_up := v_up || array(select u.x from unnest(v_ok) with ordinality as u(x, o) join public.profiles p on p.id = u.x
                           where p.open_to_hit_until > now() and not (u.x = any (v_up))
                             and private.city_board_named(u.x)   -- never a teen, whatever this rule says (197)
                           order by u.o);
    v_room := greatest(0, v_rules.fill_to - cardinality(v_up));
  end if;

  -- Top players. The k people not shown (players - shown - you) hold the rest
  -- of the total, each at least 1: if the rest were exactly k, every one of
  -- them would be known to have played once. So: fewer rows until rest > k.
  v_top := v_ok[1 : v_cap];
  loop
    exit when coalesce(cardinality(v_top), 0) = 0;
    v_rest_n := v_c.players - cardinality(v_top) - case when v_member then 1 else 0 end;
    v_rest_s := v_c.sessions - case when v_member then v_me.sessions else 0 end
                - (select coalesce(sum(mb.sessions), 0)::int from public.city_board_members mb
                    where mb.month = p_month and mb.user_id = any (v_top));
    exit when v_rest_s > v_rest_n;
    v_top := v_top[1 : cardinality(v_top) - 1];
  end loop;
  v_top := coalesce(v_top, '{}');

  -- Ranked among the rows shown and you (your own count up to the minute):
  -- never among people you are not shown.
  with t as (
    select u.x as user_id, mb.sessions, u.o
      from unnest(v_top) with ordinality as u(x, o)
      join public.city_board_members mb on mb.month = p_month and mb.user_id = u.x
    union all
    select me, v_me.sessions_now, 0 where v_me.user_id is not null and v_c.rank is not null
  ), r as (select t.*, rank() over (order by t.sessions desc) as place from t)
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'sessions', r.sessions, 'rank', r.place) order by r.place, r.o)
                  filter (where r.user_id <> me), '[]'::jsonb),
         max(r.place) filter (where r.user_id = me)
    into v_top_json, v_my_rank from r;

  -- The fill after the ringed faces: the city's most active, no number unless already on Top players.
  v_fill := array(select u.x from unnest(v_ok) with ordinality as u(x, o) where not (u.x = any (v_up)) order by u.o limit v_room);
  select coalesce(jsonb_agg(jsonb_build_object('id', mb.user_id, 'habit', mb.habit,
                    'last_day', to_char(mb.last_day, 'YYYY-MM-DD'),
                    'sessions', case when mb.user_id = any (v_top) then mb.sessions end) order by u.o), '[]'::jsonb)
    into v_fill_json
    from unnest(v_fill) with ordinality as u(x, o)
    join public.city_board_members mb on mb.month = p_month and mb.user_id = u.x;

  -- Busiest courts: courts only.
  select coalesce(jsonb_agg(jsonb_build_object('court_id', k.court_id, 'name', k.name, 'courts', k.courts, 'sessions', k.sessions)
                  order by k.sessions desc, k.players desc, k.park_key), '[]'::jsonb)
    into v_courts
    from public.city_board_courts k where k.month = p_month and k.city_id = p_city;

  -- The clip: the first candidate this viewer may see, checked again now
  -- (and never one with someone on it who is blocked with you either way).
  for cl in
    select k.post_id, k.author_id, po.views
      from public.city_board_clips k
      join public.posts po on po.id = k.post_id
     where k.month = p_month and k.city_id = p_city
       and po.author_id = k.author_id
       and private.city_board_clip_ok(po)
       and not public.is_blocked_between(me, k.author_id)
       and not (k.author_id::text = any (v_muted))
       and not exists (select 1 from unnest(private.city_board_post_people(po)) as t(u)
                        where t.u <> me and (public.is_blocked_between(me, t.u) or t.u::text = any (v_muted)))
     order by k.place
  loop
    if cl.author_id <> me
       and not exists (select 1 from public.follows f where f.follower_id = cl.author_id and f.following_id = me)
       and not (cl.author_id = any (public.age_rule_budget(array[cl.author_id]))) then
      continue;
    end if;
    v_clip := jsonb_build_object('post_id', cl.post_id, 'author_id', cl.author_id, 'views', cl.views);
    exit;
  end loop;

  if v_c.rank is not null then
    v_city := jsonb_build_object('id', v_b.id, 'name', v_b.name, 'region', v_b.region, 'rank', v_c.rank, 'of', v_of,
      'sessions', v_c.sessions, 'players', v_c.players, 'per_value', v_c.per_value, 'per_rank', v_c.per_rank,
      'week_ago_rank', v_c.week_ago_rank, 'run', v_c.run);
  else
    v_city := jsonb_build_object('id', v_b.id, 'name', v_b.name, 'region', v_b.region, 'rank', null, 'of', v_of,
      'players_needed', private.city_board_needs(v_c.players, v_member));
  end if;
  if v_mine or v_me.user_id is not null then
    v_me_json := jsonb_build_object('rank', v_my_rank, 'sessions', coalesce(v_me.sessions_now, 0), 'in_total', coalesce(v_me.sessions, 0));
  end if;

  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM-DD'),
    'refreshed_at', (select m.refreshed_at from public.city_board_months m where m.month = p_month),
    'city', v_city, 'top', v_top_json, 'me', v_me_json, 'fill', v_fill_json,
    'up', to_jsonb(v_up), 'courts', v_courts, 'clip', v_clip);
end $$;
revoke all on function public.city_page(text, date) from public, anon;
grant execute on function public.city_page(text, date) to authenticated;

drop function if exists public.refresh_active_courts();
drop function if exists private.city_board_court_place(public.courts);
drop table if exists public.city_board_active_courts;
drop table if exists public.city_board_active_months;
drop table if exists public.city_board_checkin_tally;
drop table if exists public.city_board_checkin_days;

do $$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure) <> '24bc9c0f69ee4dfd8a68583971d6943e'
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.city_page(text, date)'::regprocedure)
     or to_regprocedure('public.refresh_active_courts()') is not null
     or to_regclass('public.city_board_active_courts') is not null
     or exists (select 1 from cron.job where jobname = 'courtside-active-courts')
     or not exists (select 1 from cron.job where jobname = 'courtside-city-board') then
    raise exception 'Undo 198 stopped: city_page did not come back as 197 wrote it. Nothing was changed.';
  end if;
  if (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '-'), '; ' order by p.oid::regprocedure::text)
        from pg_proc p where p.oid in ('public.city_page(text, date)'::regprocedure))
     is distinct from current_setting('courtside.u198_grants', true) then
    raise exception 'Undo 198 stopped: who may call city_page would change. Nothing was changed.';
  end if;
end $$;

commit;
