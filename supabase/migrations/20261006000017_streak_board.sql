-- CourtSide · migration 20261006000017: "Friends on a streak" in the weekly
-- recap (owner, Oct 5: "go for streak board").
--
-- NOT APPLIED — needs the owner's OK, and the rolled-back test on the live
-- database first (described at the end). Run it in the Supabase SQL editor
-- as one piece. It is all-or-nothing: if a check below fails, it stops and
-- nothing at all changes. Safe to run more than once. It only adds one
-- question the app can ask; no table, column or rule anyone uses today is
-- changed or removed.
--
-- ORDER: needs migration 134 (the streak flame) and 109 (the day's limit
-- on questions about age), both live on Oct 5. It can run before or after
-- the app that shows the board: until it runs, that app shows only friends
-- who follow each other with you (worked out on the phone from the streaks
-- it already has), and an older app never asks.
--
-- What the board is: at the bottom of your weekly recap, up to 5 people you
-- follow who are on a streak right now (3 days in a row or more), longest
-- first, with you in your place. The app draws it; this file adds the one
-- question behind it, friends_on_streak(), whose answer is a list of
-- (person, days, last day), never anything else about them.
--
-- Who can be on your board, in plain words:
--   * Only people you follow, with a running streak: 3 days or more, whose
--     last day is your yesterday or later (your phone says what today is,
--     within a day of the server's, as set_my_streak allows).
--   * Never someone you are blocked with (either way), never a suspended
--     account, never someone you muted, and never a private account unless
--     you follow it (the same rule as the flame itself, migration 134).
--   * The teen rule (as 124's "who's in" and 130's King of the Court): a
--     player who follows you back can always be on it; anyone else only
--     when they are known to be an adult. So a teen never shows on the
--     board of someone the teen does not follow. Whether someone is an
--     adult is only asked within the day's budget (age_rule_budget, 109),
--     one person at a time, only for people who do not follow you back,
--     only until the board has its 5, and at most 15 people a time; past
--     that, people who do not follow you back are left off, whatever
--     their age. Asking about the same person again that day is free.
--   * Never someone who turned their activity status off (user_state's
--     show_activity, as 130's Flyby): the board says who is playing, so
--     it keeps to the same promise ("activity status off, it isn't shown").
--   * Signed in only. Your own row never comes from here: the app adds you
--     from your own count.
--
-- There is no "hide my streak" setting in the app today (Oct 5), so none is
-- read here; a private account already shows its streak only to followers.
-- Every friend on a streak is looked at (no cut-off before the rules), so a
-- friend who follows you back is never crowded off by people further up
-- who could not be shown; the looking stops once the board has its 5.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- Relied on and never rewritten here: exactly as live on Oct 5.
  kept constant text[][] := array[
    ['public.can_view',           'bc84d0d3557df1b7eea9bfd353bcc9a2'],
    ['public.is_blocked_between', 'f7246d0dbae4888d3a96a1d317c9de5f'],
    ['public.is_suspended',       '26f652f2bbe907f1e5ef2c709c310a6f'],
    ['public.known_adult',        'a79e745befd4374ea124ccf1692145a2'],
    ['public.age_rule_budget',    '9f020e0237d8c5e61e913cbc6d5f6923']
  ];
  -- Made by this file: absent before, or exactly as this file leaves it.
  made constant text[][] := array[
    ['public.friends_on_streak',  '7f6e17f73e931405486f693cbfd5fa83']
  ];
  i int;
  n int;
  now_is text;
  wrong text[] := '{}';
begin
  if to_regclass('public.player_streaks') is null
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'player_streaks'
           and column_name in ('user_id', 'days', 'through_day')) <> 3
     or to_regclass('public.follows') is null
     or to_regclass('public.age_rule_asks') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'muted_ids' and udt_name = '_text')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_state' and column_name = 'show_activity' and udt_name = 'bool') then
    raise exception 'Migration 20261006000017 stopped before changing anything: migrations 8, 109 and 134 have to run first.';
  end if;
  for i in 1 .. array_length(kept, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(kept[i][1], '.', 1) and p.proname = split_part(kept[i][1], '.', 2);
    if n <> 1 or now_is <> kept[i][2] then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(made, 1) loop
    select count(*), max(md5(p.prosrc)) into n, now_is from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = split_part(made[i][1], '.', 1) and p.proname = split_part(made[i][1], '.', 2);
    if n > 1 or (n = 1 and now_is <> made[i][2]) then
      wrong := wrong || made[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 20261006000017 stopped before changing anything: % changed since it was written (Oct 5). This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;
end $$;

-- ------------------------------------------------------- 1. friends on a streak
-- Up to 5 people you follow on a running streak, longest first (then the
-- freshest, then a fixed order), by the rules at the top of this file.
-- p_today is your phone's today; a day more than one from the server's is
-- refused ('day out of range'), and the app then shows friends who follow
-- each other with you only.
create or replace function public.friends_on_streak(p_today date)
returns table (user_id uuid, days integer, through_day date)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  muted text[];
  c record;
  shown int := 0;
  asked int := 0;
begin
  if me is null then return; end if;
  if p_today is null or p_today < current_date - 1 or p_today > current_date + 1 then
    raise exception 'day out of range';
  end if;
  select us.muted_ids into muted from public.user_state us where us.user_id = me;
  for c in
    select s.user_id as who, s.days as n, s.through_day as last_day,
           exists (select 1 from public.follows b where b.follower_id = s.user_id and b.following_id = me) as follows_back
      from public.follows f
      join public.player_streaks s on s.user_id = f.following_id
     where f.follower_id = me
       and s.user_id <> me
       and s.days >= 3
       and s.through_day >= p_today - 1
       and public.can_view(s.user_id)
       and not public.is_blocked_between(me, s.user_id)
       and not public.is_suspended(s.user_id)
       and not (s.user_id::text = any (coalesce(muted, '{}')))
       and coalesce((select us2.show_activity from public.user_state us2 where us2.user_id = s.user_id), true)
     order by s.days desc, s.through_day desc, s.user_id
  loop
    if not c.follows_back then
      -- Someone who does not follow you back: only a known adult, asked within the day's budget, 15 at most here.
      continue when asked >= 15;
      asked := asked + 1;
      continue when not (c.who = any (public.age_rule_budget(array[c.who])));
      continue when not public.known_adult(c.who);
    end if;
    user_id := c.who;
    days := c.n;
    through_day := c.last_day;
    return next;
    shown := shown + 1;
    exit when shown >= 5;
  end loop;
end $$;
revoke all on function public.friends_on_streak(date) from public, anon;
grant execute on function public.friends_on_streak(date) to authenticated;

-- ------------------------------------------------------------- 2. last check
do $$
begin
  if to_regprocedure('public.friends_on_streak(date)') is null
     or not (select prosecdef from pg_proc where oid = to_regprocedure('public.friends_on_streak(date)'))
     or has_function_privilege('anon', 'public.friends_on_streak(date)', 'execute')
     or not has_function_privilege('authenticated', 'public.friends_on_streak(date)', 'execute') then
    raise exception 'Migration 20261006000017 stopped: the result was not as planned; nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
-- (a) The question is there, for signed-in players only (expect t, f, t):
-- select to_regprocedure('public.friends_on_streak(date)') is not null as made,
--        has_function_privilege('anon', 'public.friends_on_streak(date)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.friends_on_streak(date)', 'execute') as players;
--
-- The rolled-back test that goes with this file (run before applying it):
-- this whole file twice, then each rule tried as the people involved,
-- inside one transaction that was then undone (nothing was saved; checked
-- after: no test account, no function left). Oct 6, live database, with
-- 558 made-up accounts. V follows: A1 (adult, one way, 12), A2 (adult,
-- each other, 9 through yesterday), T1 (teen, one way, 20), T2 (teen, each
-- other, 7), N (no age on file, one way, 15), P (private adult V follows,
-- 6), F (each other, 8, through tomorrow: a time zone ahead), E1/E2 (5,
-- today/yesterday), E3 (3); and, never on the board, S (suspended, 30),
-- B (blocked V, 25), B2 (V blocked, 24), M (V muted, 11), HA (each other,
-- 50, activity status off), O (ran out 3 days ago), L (2 days), U (40, not
-- followed). V's board: A1, A2, F, T2, P; the teen and the no-age player
-- who do not follow V left off; V asked about 4 people (A1, N, P, T1), the
-- same again later that day cost nothing. An adult stranger following T1
-- never saw T1; T1's friend who follows each other with T1 did; a teen saw
-- an adult friend, never a one-way teen or no-age player. 20 no-age players
-- ahead of one adult: 15 asked, then the adult left off and a friend shown.
-- 210 no-age players ahead of a friend: 15 asked, the friend still shown.
-- With the day's 300 used up: a one-way adult left off, a friend shown,
-- nothing more asked. Undoing the block, the mute and the suspension, T1
-- following V back, V unfollowing A1, and HA turning activity status back
-- on each changed the board as they should. The phone's today a day either
-- side worked; two days off and none refused; signed out refused; anon
-- can't run it, players can, the helpers stay closed; 134's reading rule
-- unchanged. And with a relied-on helper changed, it stopped before
-- changing anything.
--   RESULT 10_board_V=A1:12 A2:9@-1 F:8@1 T2:7 P:6 | 10_board_X=A1:12 |
--   10_board_Y=T1:20 | 10_board_T2=V:8 | 10_board_W=MW:3 | 10_board_Z=MZ:3 |
--   10_board_U=(none) | 11_asks=V=4 X=2 Y=0 T2=0 W=15 Z=300 |
--   12_V_asked_about=A1,N,P,T1 | 14_V_asks_after_again=4 |
--   21_V_today_plus_1=A1:12 F:8@1 T2:7 P:6 E1:5 | 22_V_today_-2=refused |
--   23_V_no_day=refused | 30_anon=refused | 31_no_sub=0 |
--   40_V_after_unblock_unmute_unsuspend=S:30 B:25 A1:12 M:11 A2:9@-1 |
--   41_V_after_T1_follows_back=S:30 B:25 T1:20 A1:12 M:11 |
--   42_V_after_unfollow_A1=S:30 B:25 T1:20 M:11 A2:9@-1 |
--   43_V_after_HA_shows_activity=HA:50 S:30 B:25 T1:20 M:11 |
--   50_grants=anon=false players=true definer=true copies=1 |
--   60_T2_teen_viewer_oneway_A1_N_T1=A1:12 V:8 |
--   61_helpers_closed=budget=false known_adult=false |
--   70_board_W3=MW3:3 | 71_W3_asks=15
