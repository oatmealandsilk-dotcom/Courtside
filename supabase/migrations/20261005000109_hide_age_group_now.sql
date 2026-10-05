-- CourtSide · migration 109: nobody but you can read your age group.
-- (Migration 64, brought up to date with everything that went live since.)
--
-- NOT APPLIED — needs the owner's OK. Run it in the Supabase SQL editor as
-- one piece. It is all-or-nothing: if any check below fails, it stops and
-- nothing at all changes.
--
-- Why this exists. Migration 64 (written Oct 2) does this job but was never
-- run. Since then migrations 65–106 went live, and some of them made parts
-- of 64 (the hit rules, the map rule) or changed things 64 did not know
-- about (the inviter follow in 84, the new-profile guard in 93). Running 64
-- as it is would now either stop on its own checks or put back older
-- versions of later fixes. This file does what 64 meant to do, written
-- against the database as it is live on Oct 5, and never undoes a later fix
-- (map round 3 and 105, the security work in 93–104, contacts in 88/89/97,
-- match scores in 91, Android alerts in 106).
--
-- The problem (still live today): every profile row carries age_group
-- ('teen' or 'adult'), and every signed-in account can read every profile
-- row. Accounts are free, so anyone can make one and download the list of
-- teen accounts. (Signed-out readers were already limited to adults by 94.)
--
-- What it does:
--   * Your age group moves next to your birthday, into your own settings row
--     (user_state.age_group), which only you can read. Nobody can write it
--     but set_birth_date, the same as the birthday itself. Every age on file
--     is copied across, then profiles.age_group is removed, in the same run.
--   * Every server rule that needs someone's age asks one helper,
--     known_adult(id), which only the server can call (already true today;
--     it now reads the settings row). The teen rules themselves do not
--     change: new chats, group adds, session tags and joining hits still
--     need a follow from a teen; the map, court check-ins, court and hit
--     alerts, heart rate on posts, groups and New on CourtSide work exactly
--     as before for everyone.
--   * The inviter follow (84) compares the two people's ages through the
--     settings rows instead of the profiles.
--   * The app's three yes/no questions, never the age itself, each limited
--     to 300 different people a day: open_to_you (may you message / add /
--     tag them), shown_at_court (which of these posts may show on a court's
--     page for you) and session_tag_refusal (as before, now with the limit).
--     can_join_groups (73) already uses the same daily limit; until now that
--     limit was missing from the database, so it failed every time. It works
--     after this.
--   * The same 300-a-day limit now also covers every action whose yes or no
--     depends on someone else's age, so trying them one after another
--     cannot be used to test accounts either: starting a chat
--     (open_conversation), making a group chat or adding to one
--     (create_group, add_group_members, through group_fits), tagging
--     someone on a session (tag_session), inviting people to a hit
--     (invite_to_hit) and joining a hit (join_hit). Asking about someone who
--     follows you (or, for hits, someone you follow each other with) never
--     counts: the answer does not depend on their age. Past the limit the
--     action says 'age_rule_limit' for everyone alike. Nobody near normal
--     use comes close: it is 300 different people a day.
--   * Signed out, nothing about people comes back at all: no profiles and
--     no posts (94 and 103 showed adults only, which meant comparing that
--     list with what a free account sees picked out every teen). Links
--     shared outside the app keep working: their page asks share_preview
--     (68), which does not read through these rules.
--   * The three small helpers the hit, join and map rules ask
--     (hit_shown_to_you, join_shown_to_you, spot_shown_to_you, from 95 and
--     78) move to a separate area of the database called "private", which
--     the app's gateway does not open. The rules use them exactly as before;
--     nobody can call them by name from outside any more. The two helpers
--     only the signed-out rules used (shown_signed_out, post_shown_signed_out)
--     are removed: anyone could call them and ask "is this account an adult?"
--     about any id, as often as they liked.
--   * Already live and left as they are: who can read a hit and who is in it
--     (95, word for word 64's rule), who can see a spot on the map
--     (78/98/105).
--
-- The app: the version live since Oct 2 (commit 6dab7fd) already works both
-- ways. It notices the age is gone from profile rows, reads your own age
-- from your settings row, and asks the server the yes/no questions above.
-- An app older than Oct 2 would no longer see its own age and would treat
-- its own account as a teen's until it updates (64's "Old phones" note).
-- The link-preview worker (cloudflare/share-worker.js, not switched on yet)
-- read profiles and posts signed out; it is changed alongside this file to
-- ask share_preview instead, so its cards stay the same.
--
-- What this does NOT hide (said plainly, as in 64). Each needs an app change
-- or an owner decision, so it is listed rather than changed here:
--   * Someone signed in can still work out, one person at a time, that an
--     account is "not known to be an adult" from the teen rules' visible
--     effects (a locked Message button, the private switch a teen starts
--     with). The 300-a-day limit, per account, stops a sweep from one
--     account; someone making many accounts gets 300 a day for each.
--   * share_preview (68), the shared-link page: for a public account that is
--     not suspended, the card opens only for known adults, and anyone can
--     ask it about any id or handle without signing in. Comparing that with
--     the profile list a free account sees still picks out public accounts
--     that are not known adults. Closing it needs the share link itself to
--     carry a key the sharer's app makes (an app change).
--   * New on CourtSide (new_on_courtside, 63) shows adults and 16-17 year
--     olds; recent public accounts it leaves out are, by its own rule, under
--     16 or without a birthday.
--   * Court pages (court_rings, my_courts, court_people_you_follow, the
--     court card in share_preview) leave out posts by teens, while the same
--     posts, with their court, show in the feed to anyone signed in
--     (103's "later" item). Comparing the counts can single a teen out.
--   * A brand-new account can learn whether one inviter is in its own age
--     band (claim_referral / claim_invite_code follow the inviter only
--     then, 84): once per account, on its first day.
--   * A hit's joined_count counts everyone who joined, including teens a
--     stranger cannot see in the list of who joined: a number, never who.
--
-- Tried on the live database on Oct 5, inside a transaction that was then
-- undone (nothing was saved): the age group could no longer be listed
-- signed out or by a signed-in stranger; a teen still read their own; the
-- map (map_players, map_pair_ok), contacts, hits, joins, New on CourtSide,
-- court pages and every person-to-person rule gave exactly the same answers
-- before and after for every account (the only change: signed out, 0
-- profiles and 0 posts); every SQL function still compiled; running it twice
-- changed nothing. Then a teen and an adult in the same position were each
-- put to every function the app can call that takes a person (or their
-- handle), signed out and as an adult stranger, before the day's limit and
-- past it. Signed out, only share_preview told them apart. Past the limit,
-- only share_preview and (for an account made that day) claim_referral and
-- claim_invite_code did: the items above. Past the limit nobody new was
-- answered, and with room for one, one was. No table the app can read
-- showed a stranger every adult but hid a public teen. The app's gateway
-- refuses the "private" area (only public is open to it).
--
-- Safe to run more than once. After it runs, do not re-run 64 or any file
-- older than this that reads profiles.age_group.

begin;

-- ------------------------------------------------------------------ 0. checks
-- Stop before changing anything if the live database is not the shape this
-- file was written against (Oct 5, after 106).
do $$
declare
  -- Every function this file rewrites: its body as it is live on Oct 5, and
  -- as this file leaves it (so a second run passes too). md5 of the body.
  expected constant text[][] := array[
    ['court_facts',               '4072f6fc09fceb91cbf7e52e21ec44e2', 'ecb4b7d9a2f7aa64700494026786b79c'],
    ['court_right_now',           '5f2b17585528751df92cbec7fa8b9f5c', 'eafcfcfa02c39c05a54ccbbc4c7de2bf'],
    ['fill_post_session_stats',   'e8312c41b2f36aa72ffa714a1857ede6', '29ce26bf1b7ed4b7b6dfe37472dc8cfd'],
    ['group_fits',                'c8d90a805e38127aefb4a450437a010e', 'd38b5d2fd95a3dfbb80192e8bfe3708e'],
    ['join_hit',                  'd0bf6d07351541e2de9b177aa706540e', 'fe0811398f64cc2f145a62d12bc73a58'],
    ['known_adult',               '4b04546086eb0bbb13aa77f8e2bf1633', 'a79e745befd4374ea124ccf1692145a2'],
    ['new_on_courtside',          '646774b73f53a89f0a5628a137ced848', '2239944b413b30b0c54ce850b090b7a0'],
    ['notify_joined_nearby',      '0ae17dc06ac1423bc53ee676c66bf6a1', 'b8ca4082a343d262557abbc1fc79cc37'],
    ['open_conversation',         'c0dc9c7dc3510b1af1293ed37fc97ec0', '8866607ea290d350fcdf2805199da0ac'],
    ['players_court_access',      'bc7cf203fb9b04df69e23f7d034a93e0', '57b63584e688790a6fa05884eb5abbf0'],
    ['same_age_band',             'b573f7ddd762a972497030f2dcec4f04', '5e39fb5120814d0ef105dc42b5c9d465'],
    ['session_tag_refusal',       '76451c55e05b5ed3a556ab5f939e708f', '4abbe6cb3ff33f3955e20d9614c27e08'],
    ['session_tag_refusal_for',   '4ae6cb474a22fb68a104c4fb6cf53bc9', 'a44555790bb45553cfeb69e1634e4f52'],
    ['set_birth_date',            '2318bb8d966d8c049109846a8669de36', 'b9763abefa6a5fe7d5ad8e465fdced3a'],
    ['shows_at_court',            'f9bd9fd13991a4c4889c3a2eca26cc8f', 'b325f768cd4001366038723b73c94fbd'],
    ['tell_adults_new_player',    '8f40c093675ea2993573b366c8c22faf', '23900e6aa0a7e3ff561f27c64c397c83'],
    ['tell_court_about_post',     '9e88cff0ed2438f16da0798018e2b891', '7974938b1e6fa71d0c81ca8fc202efda'],
    ['tell_followers_up_for_hit', '44c1763f06869fd627732ea407645938', 'b72440b06c45afe6dd3ea4667796798a'],
    ['tell_hit_matches',          '500ad845afc6ce9098aac49de8390c00', 'a24e59d69b3f61ae8208dfc2743621f2'],
    ['tell_map_about_hit',        '32b43cb0ae0a80e25d6dfc1c08708494', '281db33a3247e05422be20ffe41a6f62'],
    ['tag_session',               'a9a2a9dff57d3e639ef25f5d6c577f83', '5f010cf73d62d73f3f994f5f03a86265'],
    ['invite_to_hit',             '726e2a48e3245429a0584d4c1760640f', '508f247eaed83a26de9aef5ea0c506a4']
  ];
  -- Live and relied on, never rewritten here: each must still be exactly as
  -- it is on Oct 5 (93).
  kept constant text[][] := array[
    ['guard_new_profile',     '5b34b898d39fda92ae5de03dca77ef58']
  ];
  -- Taken out of the app's reach by this file (section 5): as live on Oct 5
  -- until it runs, gone from public afterwards.
  moved constant text[][] := array[
    ['spot_shown_to_you',     'b0225e84dee18f183091409c94b91794'],
    ['hit_shown_to_you',      '804e768ee326e84b68eb1d7d96dd5ec5'],
    ['join_shown_to_you',     'ccf84032815473107b4f5f44bc2f064a'],
    ['shown_signed_out',      'fc4bbdc9fc5b56aa92c8c7f64607a093'],
    ['post_shown_signed_out', 'bf1ff56078653da9f6848866dac3b5e5']
  ];
  -- Made new by this file: absent before, or as this file leaves them.
  made constant text[][] := array[
    ['age_rule_budget',       '9f020e0237d8c5e61e913cbc6d5f6923'],
    ['open_to_you',           'c9df7f07753d5b4476b90a89ba6567e4'],
    ['shown_at_court',        '6c10fcbfbb25867eea33cd888d475950'],
    ['guard_state_age_group', '30bb970f947e818de7f47e4db9149f6c']
  ];
  -- The private helpers (section 5): absent before, or as this file leaves them.
  made_private constant text[][] := array[
    ['spot_shown_to_you',     'b0225e84dee18f183091409c94b91794'],
    ['hit_shown_to_you',      '804e768ee326e84b68eb1d7d96dd5ec5'],
    ['join_shown_to_you',     'ccf84032815473107b4f5f44bc2f064a']
  ];
  i int;
  wrong text[] := '{}';
  bad text;
  on_profiles boolean := exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group');
  on_settings boolean := exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_state' and column_name = 'age_group');
begin
  if not on_profiles and not on_settings then
    raise exception 'Migration 109 stopped before changing anything: there is no age group on profiles or on settings rows. Ask Claude to look.';
  end if;

  -- 1. The functions this file rewrites are still the ones it was written against.
  for i in 1 .. array_length(expected, 1) loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1])
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = expected[i][1]
                  and md5(p.prosrc) not in (expected[i][2], expected[i][3])) then
      wrong := wrong || expected[i][1];
    end if;
  end loop;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 109 stopped before changing anything: % changed after Oct 5. This file must be brought up to date with that change first.', array_to_string(wrong, ', ');
  end if;

  -- 2. What it keeps and relies on is still there, unchanged.
  for i in 1 .. array_length(kept, 1) loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1])
       or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = kept[i][1]
                  and md5(p.prosrc) <> kept[i][2]) then
      wrong := wrong || kept[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(moved, 1) loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = moved[i][1]
               and md5(p.prosrc) <> moved[i][2]) then
      wrong := wrong || moved[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(made, 1) loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = made[i][1]
               and md5(p.prosrc) <> made[i][2]) then
      wrong := wrong || made[i][1];
    end if;
  end loop;
  for i in 1 .. array_length(made_private, 1) loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'private' and p.proname = made_private[i][1] and md5(p.prosrc) <> made_private[i][2]) then
      wrong := wrong || ('private.' || made_private[i][1]);
    end if;
  end loop;
  -- Anything else already in "private" was not made by this file.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and not (p.proname = any (array(select made_private[k][1] from generate_subscripts(made_private, 1) as g(k))));
  if bad is not null then
    wrong := wrong || ('private: ' || bad);
  end if;
  if cardinality(wrong) > 0 then
    raise exception 'Migration 109 stopped before changing anything: % is not as this file expects (changed after Oct 5). Bring this file up to date first.', array_to_string(wrong, ', ');
  end if;

  -- 3. Nothing else in the database reads the age: every function that
  --    mentions it is one this file deals with.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and not (p.proname = any (array(select expected[k][1] from generate_subscripts(expected, 1) as g(k))))
      and p.proname not in ('guard_age_group', 'guard_new_profile', 'guard_state_age_group');
  if bad is not null then
    raise exception 'Migration 109 stopped before changing anything: % read the age group and this file does not rewrite them yet.', bad;
  end if;
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('public', 'pg_catalog', 'information_schema') and p.prosrc ~* 'age_group';
  if bad is not null then
    raise exception 'Migration 109 stopped before changing anything: % (outside public) read the age group.', bad;
  end if;
  select string_agg(schemaname || '.' || tablename || ' (' || policyname || ')', ', ') into bad
    from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~* 'age_group|known_adult';
  if bad is not null then
    raise exception 'Migration 109 stopped before changing anything: these rules read the age directly: %.', bad;
  end if;
  select string_agg(schemaname || '.' || viewname, ', ') into bad
    from pg_views where schemaname not in ('pg_catalog', 'information_schema') and definition ~* 'age_group';
  if bad is not null then
    raise exception 'Migration 109 stopped before changing anything: these views read the age: %.', bad;
  end if;
  if on_profiles then
    -- Only the column's own yes/no check may hang on it (no view, index, rule or trigger).
    select string_agg(pg_describe_object(d.classid, d.objid, d.objsubid), ', ') into bad
      from pg_depend d
      where d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.profiles'::regclass
        and d.refobjsubid = (select attnum from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'age_group')
        and not (d.classid = 'pg_constraint'::regclass
                 and exists (select 1 from pg_constraint c where c.oid = d.objid and c.contype = 'c' and c.conrelid = 'public.profiles'::regclass));
    if bad is not null then
      raise exception 'Migration 109 stopped before changing anything: % depend on profiles.age_group.', bad;
    end if;
  end if;

  -- 4. The helper stays server-only: every function that asks it runs as
  --    the server, and no rule asks it directly.
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* 'known_adult' and not p.prosecdef;
  if bad is not null then
    raise exception 'Migration 109 stopped before changing anything: % ask known_adult without running as the server.', bad;
  end if;

  -- 5. The rules this file relies on are in place: as live on Oct 5, or as
  --    this file leaves them (a second run). The three rules section 5
  --    points at the private helpers must read exactly as below, apart from
  --    where the helper lives, so repointing them cannot undo a later change.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hit_requests'
                 and policyname = 'hits are visible' and cmd = 'SELECT' and roles = '{authenticated}'
                 and regexp_replace(replace(qual, 'private.', ''), '\s+', ' ', 'g')
                     = '((auth.uid() IS NOT NULL) AND (NOT blocked_with(author_id)) AND ((author_id = auth.uid()) OR hit_shown_to_you(id)))')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hit_joins'
                 and policyname = 'joins are visible' and cmd = 'SELECT' and roles = '{authenticated}'
                 and regexp_replace(replace(qual, 'private.', ''), '\s+', ' ', 'g')
                     = '((EXISTS ( SELECT 1 FROM hit_requests h WHERE (h.id = hit_joins.hit_id))) AND join_shown_to_you(hit_id, user_id))')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'last_seen'
                 and policyname = 'who sees a spot' and cmd = 'SELECT' and roles = '{authenticated}'
                 and regexp_replace(replace(qual, 'private.', ''), '\s+', ' ', 'g')
                     = '((user_id = auth.uid()) OR spot_shown_to_you(user_id))')
     or not (exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                     and policyname = 'signed out see adults only' and permissive = 'RESTRICTIVE' and qual = 'shown_signed_out(id)')
             or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                     and policyname = 'signed out see no profiles' and permissive = 'RESTRICTIVE' and roles = '{anon}' and qual = 'false'))
     or not (exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts'
                     and policyname = 'signed out see adults'' posts only' and permissive = 'RESTRICTIVE'
                     and qual = 'post_shown_signed_out(author_id, tagged_user_ids, session)')
             or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts'
                     and policyname = 'signed out see no posts' and permissive = 'RESTRICTIVE' and roles = '{anon}' and qual = 'false'))
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_state'
                 and policyname = 'read your settings' and cmd = 'SELECT' and qual ~ 'auth\.uid\(\) = user_id')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_state'
                and cmd in ('SELECT', 'ALL') and policyname <> 'read your settings')
     or exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'user_state') then
    raise exception 'Migration 109 stopped before changing anything: the rules for hits, the map, signed-out readers or settings rows are not as on Oct 5. Ask Claude to look.';
  end if;
end $$;

-- ------------------------------------------------- 0b. hold the two tables still
-- From here until the file finishes, nobody's age can change half way: a
-- birthday being saved, or a new account being made, waits a moment while
-- every age is copied across and the old column is removed, then goes
-- through. Reading carries on as normal. If the two tables cannot be held
-- within 5 seconds (someone busy with them), the file stops and nothing at
-- all changes; running it again a minute later is fine.
set local lock_timeout = '5s';
lock table public.profiles, public.user_state in share row exclusive mode;

-- ------------------------------------------- 1. where the age lives from now on
alter table public.user_state add column if not exists age_group text check (age_group in ('teen', 'adult'));

-- Like the birthday beside it: only set_birth_date (which switches
-- courtside.age_check on for the moment it writes) can put a value here. A
-- new settings row starts with none; an edit keeps whatever was there.
create or replace function public.guard_state_age_group()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('courtside.age_check', true), '') <> 'on' then
    if tg_op = 'UPDATE' then new.age_group := old.age_group;
    else new.age_group := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_state_age_group() from public, anon, authenticated;
drop trigger if exists guard_state_age_group on public.user_state;
create trigger guard_state_age_group before insert or update on public.user_state
  for each row execute function public.guard_state_age_group();

-- Copy every age across (only while the old column is still there).
-- Everyone with an age already has a settings row (set_birth_date makes it
-- first), so this is an edit of the age alone, which no other trigger on
-- settings rows listens to. If someone somehow has no row, one is made for
-- them with two triggers held off for that one copy, inside this run only:
-- the block list's (sync_blocks: a new row reads as "no blocks") and the
-- map's (sync_spot_settings: a new row reads as "no spot shown").
do $$
declare
  missing boolean;
  blocks_sync boolean := exists (select 1 from pg_trigger where tgname = 'sync_blocks' and tgrelid = 'public.user_state'::regclass);
  spot_sync boolean := exists (select 1 from pg_trigger where tgname = 'sync_spot_settings' and tgrelid = 'public.user_state'::regclass);
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group') then
    return;
  end if;
  perform set_config('courtside.age_check', 'on', true);
  execute $copy$
    update public.user_state s set age_group = p.age_group
      from public.profiles p
      where p.id = s.user_id and p.age_group in ('teen', 'adult') and s.age_group is distinct from p.age_group
  $copy$;
  execute $copy$
    select exists (select 1 from public.profiles p where p.age_group in ('teen', 'adult')
                   and not exists (select 1 from public.user_state s where s.user_id = p.id))
  $copy$ into missing;
  if missing then
    if blocks_sync then execute 'alter table public.user_state disable trigger sync_blocks'; end if;
    if spot_sync then execute 'alter table public.user_state disable trigger sync_spot_settings'; end if;
    execute $copy$
      insert into public.user_state (user_id, age_group)
        select p.id, p.age_group from public.profiles p
        where p.age_group in ('teen', 'adult') and not exists (select 1 from public.user_state s where s.user_id = p.id)
        on conflict (user_id) do nothing
    $copy$;
    if blocks_sync then execute 'alter table public.user_state enable trigger sync_blocks'; end if;
    if spot_sync then execute 'alter table public.user_state enable trigger sync_spot_settings'; end if;
  end if;
  perform set_config('courtside.age_check', 'off', true);
  -- Every age made it across, or nothing changes.
  execute $copy$
    select exists (select 1 from public.profiles p left join public.user_state s on s.user_id = p.id
                   where p.age_group is distinct from s.age_group)
  $copy$ into missing;
  if missing then
    raise exception 'Migration 109 stopped: an age group did not copy across to its settings row. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------- 2. the one server-side helper
-- Whether someone is known to be an adult. A teen, or an account with no
-- birthday given yet, is not. Server only: the app can never call it.
create or replace function public.known_adult(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select age_group = 'adult' from public.user_state where user_id = u), false)
$$;
revoke all on function public.known_adult(uuid) from public, anon, authenticated;

-- ---------------------------------------------------- 3. your birthday, once
-- As live (migrations 13 and 36), but the label is kept in your own
-- settings row instead of on your public profile.
create or replace function public.set_birth_date(dob date)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  stored date;
  had text;
  years int;
  label text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select birth_date, age_group into stored, had from public.user_state where user_id = me;
  if stored is null then
    if dob is null or dob > current_date or dob < date '1900-01-01' then raise exception 'bad date'; end if;
    stored := dob;
  end if;
  years := extract(year from age(current_date, stored))::int;
  if years < 13 then
    raise exception 'under_13';
  end if;
  label := case when years < 18 then 'teen' else 'adult' end;
  perform set_config('courtside.age_check', 'on', true);
  insert into public.user_state (user_id, birth_date, age_group) values (me, stored, label)
    on conflict (user_id) do update set birth_date = coalesce(public.user_state.birth_date, excluded.birth_date),
                                        age_group = excluded.age_group;
  perform set_config('courtside.age_check', 'off', true);
  -- A teen account starts private the first time; after that it is the teen's choice.
  if label = 'teen' and had is null then
    update public.profiles set is_private = true where id = me;
  end if;
  return label;
end $$;

-- ------------------------------------------- 4. every rule that needs an age
-- Each is exactly as live on Oct 5 but for where the age is read.

-- Chats (migrations 13, 36, 54).
create or replace function public.open_conversation(other uuid, wanted uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_id uuid;
begin
  if me is null or other is null or other = me then raise exception 'bad participants'; end if;
  select cm.conversation_id into found_id
    from public.conversation_members cm
    join public.conversation_members o on o.conversation_id = cm.conversation_id and o.user_id = other
    where cm.user_id = me
      and (select count(*) from public.conversation_members x where x.conversation_id = cm.conversation_id) = 2
      and not exists (select 1 from public.conversations c where c.id = cm.conversation_id and c.is_group)
    limit 1;
  if found_id is not null then return found_id; end if;
  if public.is_blocked_between(me, other) then
    raise exception 'blocked';
  end if;
  -- Anyone not known to be an adult gets the teen protection: they must follow you first.
  -- Unless they follow you, the answer depends on their age, so asking
  -- counts towards your day's limit (section 6, as open_to_you).
  if exists (select 1 from public.profiles where id = other)
     and not exists (select 1 from public.follows where follower_id = other and following_id = me) then
    if not (other = any (public.age_rule_budget(array[other]))) then
      raise exception 'age_rule_limit';
    end if;
    if not public.known_adult(other) then
      raise exception 'teen_closed';
    end if;
  end if;
  insert into public.conversations (id) values (coalesce(wanted, gen_random_uuid())) returning id into found_id;
  insert into public.conversation_members (conversation_id, user_id) values (found_id, me), (found_id, other);
  return found_id;
end $$;

-- Groups (migration 54). Used by create_group and add_group_members (and so
-- open_group and add_to_group) and by join_hit. Now volatile: asking counts
-- towards the day's limit, which writes it down.
create or replace function public.group_fits(adder uuid, members uuid[], newcomers uuid[])
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  asking uuid[];
begin
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n, unnest(coalesce(members, '{}') || coalesce(newcomers, '{}')) m
    where m <> n and public.is_blocked_between(n, m)
  ) then
    return 'blocked';
  end if;
  -- Whether someone may be added depends on their age when they do not
  -- follow the adder. When a player asks this about other people, it counts
  -- towards that player's day's limit (section 6, as open_to_you); past it,
  -- the answer is 'age_rule_limit' whoever they are.
  if auth.uid() is not null then
    select coalesce(array_agg(distinct n), '{}') into asking
      from unnest(coalesce(newcomers, '{}')) n
      where n <> adder and n <> auth.uid()
        and exists (select 1 from public.profiles p where p.id = n)
        and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder);
    if cardinality(asking) > 0 then
      if not (asking <@ public.age_rule_budget(asking)) then
        return 'age_rule_limit';
      end if;
    end if;
  end if;
  if exists (
    select 1 from unnest(coalesce(newcomers, '{}')) n
    join public.profiles p on p.id = n
    where n <> adder and not public.known_adult(n)
      and not exists (select 1 from public.follows f where f.follower_id = n and f.following_id = adder)
  ) then
    return 'teen_closed';
  end if;
  return null;
end $$;

-- Hits (migrations 43, 54).
create or replace function public.join_hit(hit uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  taken int;
  conv uuid;
  label text;
  in_chat uuid[];
  fits text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.cancelled then raise exception 'That hit is no longer on.'; end if;
  if h.author_id = me then raise exception 'That is your own hit.'; end if;
  if h.starts_at < now() - interval '1 hour' then raise exception 'That hit has already happened.'; end if;
  if public.is_blocked_between(me, h.author_id) then raise exception 'blocked'; end if;
  -- When the answer below depends on the host's age (you are a known adult
  -- and you do not follow each other), asking counts towards your day's
  -- limit (section 6, as open_to_you).
  if public.known_adult(me)
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    if not (h.author_id = any (public.age_rule_budget(array[h.author_id]))) then
      raise exception 'age_rule_limit';
    end if;
  end if;
  -- Teen protection, as in chats: a player not known to be an adult only plays with people who follow each other.
  if (exists (select 1 from public.profiles p where p.id in (me, h.author_id) and not public.known_adult(p.id)))
     and not (exists (select 1 from public.follows where follower_id = me and following_id = h.author_id)
          and exists (select 1 from public.follows where follower_id = h.author_id and following_id = me)) then
    raise exception 'teen_closed';
  end if;
  if exists (select 1 from public.hit_joins where hit_id = hit and user_id = me) then return h.conversation_id; end if;
  select count(*) into taken from public.hit_joins where hit_id = hit;
  if taken >= h.spots then raise exception 'That hit is full.'; end if;
  conv := h.conversation_id;
  if conv is not null then
    perform 1 from public.conversations where id = conv for update;
    select coalesce(array_agg(user_id), '{}') into in_chat from public.conversation_members where conversation_id = conv;
    if not (me = any (in_chat)) then
      if exists (select 1 from public.conversation_removals r where r.conversation_id = conv and r.user_id = me) then
        raise exception 'removed';
      end if;
      if cardinality(in_chat) >= public.group_cap() then raise exception 'That hit is full.'; end if;
      fits := public.group_fits(h.author_id, in_chat, array[me]);
      if fits is not null then raise exception '%', fits; end if;
    end if;
  end if;
  insert into public.hit_joins (hit_id, user_id) values (hit, me);
  if conv is null then
    label := 'Hit · ' || coalesce(h.place->>'name', 'Court');
    insert into public.conversations (title, is_group, created_by) values (left(label, 60), true, h.author_id) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id, role) values (conv, h.author_id, 'admin'), (conv, me, 'member') on conflict do nothing;
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set conversation_id = conv where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  else
    insert into public.conversation_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
  end if;
  -- The line is skipped rather than refusing the join (a suspended account
  -- cannot write it, nor can someone over the 30-messages-a-minute limit).
  begin
    perform public.post_group_event(conv, me, 'joined');
  exception when others then
    null;
  end;
  perform public.file_notification(h.author_id, me, 'hit-join', hit::text, 'hit-request', coalesce(h.place->>'name', 'your hit'), false);
  return conv;
end $$;

-- Session tags (migration 62).
create or replace function public.session_tag_refusal_for(tagger uuid, who uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when tagger is null then 'signed_out'
    when who is null or not exists (select 1 from public.profiles where id = who) then 'missing'
    when who = tagger then 'self'
    when exists (select 1 from public.profiles where id = tagger and suspended_at is not null) then 'suspended'
    when public.is_blocked_between(tagger, who) then 'blocked'
    -- Teen protection, as for a new chat: someone not known to be an adult must follow you first.
    when not public.known_adult(who)
         and not exists (select 1 from public.follows where follower_id = who and following_id = tagger) then 'teen_closed'
    else null end
$$;

-- Tagging someone on a session (migrations 62, 77), exactly as live but for
-- one thing: when whether you may tag them depends on their age (they do
-- not follow you), asking counts towards your day's limit (section 6, as
-- session_tag_refusal); past it, 'age_rule_limit' for everyone alike.
create or replace function public.tag_session(s uuid, who uuid, as_role text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_s public.practice_sessions;
  v_t public.session_tags;
  v_role text;
  v_why text;
  v_alert boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  -- Held still while it is counted, so two quick taps cannot take one place twice.
  select * into v_s from public.practice_sessions where id = s for update;
  if not found or v_s.user_id is distinct from me then raise exception 'not_your_session'; end if;
  -- Your copy of someone else's session is theirs to tag, not yours.
  if v_s.from_session_id is not null then raise exception 'copy'; end if;
  if v_s.kind not in ('match', 'practice') then raise exception 'not_a_match_or_practice'; end if;
  v_role := case when v_s.kind = 'match' then coalesce(as_role, 'opponent') else 'partner' end;
  if v_role not in ('opponent', 'partner') then raise exception 'bad_role'; end if;
  v_why := public.session_tag_refusal_for(me, who);
  if (v_why is null or v_why = 'teen_closed')
     and not exists (select 1 from public.follows where follower_id = who and following_id = me) then
    if not (who = any (public.age_rule_budget(array[who]))) then
      raise exception 'age_rule_limit';
    end if;
  end if;
  if v_why is not null then raise exception '%', v_why; end if;

  select * into v_t from public.session_tags where session_id = s and tagged_id = who for update;
  if found then
    if v_t.status in ('declined', 'removed') then raise exception 'declined'; end if;
    if v_t.role <> v_role then
      update public.session_tags
         set role = v_role,
             status = case when status = 'accepted' then 'pending' else status end,
             responded_at = case when status = 'accepted' then null else responded_at end
       where id = v_t.id;
      if v_t.status = 'accepted' then
        update public.notifications set read = false where user_id = who and kind = 'session-tag' and target_id = s::text;
      end if;
    end if;
    return v_t.id;
  end if;
  if (select count(*) from public.session_tags where session_id = s and status in ('pending', 'accepted')) >= public.session_tag_room(v_s.kind) then
    raise exception 'too_many';
  end if;
  -- Counted from the log, which deleting a session or a tag never empties.
  if (select count(*) from public.session_tag_log where tagger_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;
  -- The first 3 tags a day from you to one person alert them; the rest wait quietly in their Your sessions.
  v_alert := (select count(*) from public.session_tag_log where tagger_id = me and tagged_id = who and created_at > now() - interval '1 day') < 3;
  delete from public.session_tag_log where tagger_id = me and created_at < now() - interval '2 days';
  insert into public.session_tag_log (tagger_id, tagged_id, alerted) values (me, who, v_alert);

  insert into public.session_tags (session_id, tagger_id, tagged_id, role) values (s, me, who, v_role) returning * into v_t;
  -- Once per session and person: the same target and words never file twice,
  -- so taking a tag off and putting it back does not buzz anyone again.
  if v_alert then
    perform public.file_notification(who, me, 'session-tag', s::text, 'session-tag', case when v_s.kind = 'match' then 'match' else 'practice' end);
  end if;
  return v_t.id;
end $$;

-- Inviting people to your hit (migrations 76, 95), exactly as live but for one
-- thing: unless you follow each other, both of you must be known adults,
-- and when that depends on their age, asking counts towards your day's
-- limit (section 6, as open_to_you); past it, they are skipped like anyone
-- the rule leaves out. At most the first 100 people asked are looked at.
create or replace function public.invite_to_hit(hit uuid, people uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  h public.hit_requests;
  who uuid;
  added uuid[] := '{}';
  have int;
  me_name text;
  words text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.author_id <> me then raise exception 'not_yours'; end if;
  if h.cancelled or h.starts_at < now() - interval '1 hour' then raise exception 'That hit is no longer on.'; end if;
  if h.audience = 'everyone' then return added; end if;
  select count(*) into have from public.hit_invites where hit_id = hit;
  select coalesce(nullif(name, ''), handle, 'Someone') into me_name from public.profiles where id = me;
  -- chr(183) is the middle dot, written so it survives any copy and paste.
  words := public.hit_when(h.starts_at, h.place) || ' ' || chr(183) || ' ' || coalesce(h.place->>'name', 'a court');
  for who in select distinct x from unnest((coalesce(people, '{}'))[1:100]) as x where x is not null loop
    exit when have >= 20;
    continue when who = me;
    continue when not exists (select 1 from public.profiles p where p.id = who and p.suspended_at is null);
    continue when public.is_blocked_between(me, who);
    if not (exists (select 1 from public.follows where follower_id = me and following_id = who)
            and exists (select 1 from public.follows where follower_id = who and following_id = me)) then
      continue when not public.known_adult(me);
      continue when not (who = any (public.age_rule_budget(array[who])));
      continue when not public.known_adult(who);
    end if;
    insert into public.hit_invites (hit_id, user_id) values (hit, who) on conflict do nothing;
    continue when not found;
    have := have + 1;
    added := added || who;
    continue when exists (select 1 from public.user_state s where s.user_id = who
      and (me::text = any (coalesce(s.blocked_ids, '{}')) or me::text = any (coalesce(s.muted_ids, '{}'))));
    perform public.file_notification(who, me, 'hit-invite', hit::text, 'hit-request', words, true);
    begin
      perform public.send_push(who, coalesce(me_name, 'Someone') || ' invited you to hit', upper(left(words, 1)) || substr(words, 2), '/hit-request/' || hit);
    exception when others then
      null;
    end;
  end loop;
  -- Touch the hit, so the live feed tells the people just invited (the row reaches them now).
  if cardinality(added) > 0 then
    perform set_config('courtside.hit_system', 'on', true);
    update public.hit_requests set include_groups = include_groups where id = hit;
    perform set_config('courtside.hit_system', 'off', true);
  end if;
  return added;
end $$;

-- Heart rate on a tracked session's post: adults only (migration 58). No
-- trigger runs this one any more (72 moved posts to post_session_stats,
-- which already asks known_adult); rewritten so nothing reads the old column.
create or replace function public.fill_post_session_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_a public.detected_activities; v_adult boolean; v_src text; v_s jsonb;
begin
  if new.session is null or jsonb_typeof(new.session) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' and old.session is not null and jsonb_typeof(old.session) = 'object'
     and (new.session - 'with') is not distinct from (old.session - 'with') then
    -- Nothing changed but (at most) the list: keep the stats, work the list out again.
    if new.session is distinct from old.session then new.session := public.put_session_with(new.session, new.author_id); end if;
    if new.session ? 'activityId' then new.feature_ok := false; end if;
    return new;
  end if;
  if pg_column_size(new.session) > 4000 then raise exception 'session too large'; end if;
  if not (new.session ? 'activityId') then
    new.session := public.put_session_with(new.session - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  select * into v_a from public.detected_activities where id::text = new.session->>'activityId' and user_id = new.author_id;
  if not found then
    new.session := public.put_session_with(new.session - 'activityId' - 'source' - 'avgHr' - 'maxHr' - 'kcal' - 'strain' - 'startedAt' - 'device' - 'show' - 'with', new.author_id);
    return new;
  end if;
  v_adult := public.known_adult(new.author_id);
  v_src := case v_a.source when 'apple-health' then case when v_a.device ~ '^Watch[0-9]+,[0-9]+$' then 'apple-watch' else 'apple-health' end else v_a.source end;
  v_s := jsonb_build_object('focus', 'Tennis', 'minutes', v_a.minutes, 'drills', '[]'::jsonb, 'activityId', v_a.id, 'source', v_src);
  if v_adult and new.session ? 'maxHr' then v_s := v_s || jsonb_strip_nulls(jsonb_build_object('maxHr', v_a.max_hr, 'avgHr', v_a.avg_hr)); end if;
  if (new.session->>'intensity') in ('1', '2', '3', '4', '5') then v_s := v_s || jsonb_build_object('intensity', (new.session->>'intensity')::int); end if;
  new.session := public.put_session_with(v_s, new.author_id);
  new.feature_ok := false;
  return new;
end $$;

-- "Someone near you joined": only adults hear, only about adults (migration 46).
create or replace function public.notify_joined_nearby()
returns trigger language plpgsql security definer set search_path = public as $$
declare city text;
begin
  if coalesce(old.location, '') <> '' or coalesce(new.location, '') = '' then return new; end if;
  if new.created_at < now() - interval '14 days' then return new; end if;
  if not public.known_adult(new.id) then return new; end if;
  city := lower(trim(split_part(new.location, ',', 1)));
  if char_length(city) < 2 then return new; end if;
  insert into public.notifications (user_id, actor_id, kind, target_id, target_kind, preview)
  select p.id, new.id, 'joined', new.id::text, 'profile', new.location
  from public.profiles p
  where p.id <> new.id
    and public.known_adult(p.id)
    and lower(trim(split_part(p.location, ',', 1))) = city
    and not public.is_blocked_between(p.id, new.id)
  order by p.created_at desc
  limit 50;
  return new;
end $$;

-- Courts (migration 60): what players say about a court counts only from adults,
-- who is on court shows only adults, and only to adults.
create or replace function public.court_facts(ids text[])
returns table (court_id text, players int, lights_yes int, lights_no int, nets_good int, nets_bad int,
  surface_good int, surface_cracked int, surface_wet int, busy jsonb, busy_answers int, busy_never int, notes jsonb,
  access text, access_by text, fee boolean, indoor boolean, book_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  said as (
    select v.* from public.court_reviews v
    where v.court_id in (select id from wanted) and v.updated_at > now() - interval '18 months'
      and (v.lights is not null or v.nets is not null or v.surface is not null or v.busy is not null or v.access is not null or v.notes is not null)
  )
  select c.id,
    coalesce(t.players, 0), coalesce(t.lights_yes, 0), coalesce(t.lights_no, 0), coalesce(t.nets_good, 0), coalesce(t.nets_bad, 0),
    coalesce(t.surface_good, 0), coalesce(t.surface_cracked, 0), coalesce(t.surface_wet, 0),
    coalesce(b.busy, '{}'::jsonb), coalesce(t.busy_answers, 0), coalesce(t.busy_never, 0), coalesce(n.notes, '[]'::jsonb),
    c.access, c.access_by, c.fee, c.indoor, c.book_url, t.last
  from public.courts c
  left join lateral (
    select count(*)::int as players,
      count(*) filter (where s.lights)::int as lights_yes, count(*) filter (where not s.lights)::int as lights_no,
      count(*) filter (where s.nets = 'good')::int as nets_good, count(*) filter (where s.nets = 'bad')::int as nets_bad,
      count(*) filter (where s.surface = 'good')::int as surface_good, count(*) filter (where s.surface = 'cracked')::int as surface_cracked,
      count(*) filter (where s.surface = 'wet-prone')::int as surface_wet,
      count(*) filter (where s.busy is not null)::int as busy_answers,
      count(*) filter (where cardinality(s.busy) = 0)::int as busy_never, max(s.updated_at) as last
    from said s where s.court_id = c.id) t on true
  left join lateral (
    select jsonb_object_agg(part, k) as busy from (
      select part, count(*)::int as k from said s, unnest(s.busy) as part where s.court_id = c.id group by part) x) b on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('text', y.notes, 'on', y.updated_at::date) order by y.updated_at desc) as notes from (
      select s.notes, s.updated_at from said s
      where s.court_id = c.id and s.notes is not null and public.known_adult(s.user_id) order by s.updated_at desc limit 3) y) n on true
  where c.id in (select id from wanted)
$$;

create or replace function public.players_court_access(court text, osm text)
returns text language sql stable security definer set search_path = public as $$
  with said as (
    select v.access, v.updated_at from public.court_reviews v
    where v.court_id = court and v.access is not null and v.updated_at > now() - interval '18 months'
      and public.known_adult(v.user_id)
      and (v.access not in ('members', 'private') or (
        select count(*) from public.court_reviews w
        where w.user_id = v.user_id and w.access in ('members', 'private') and w.updated_at > now() - interval '18 months'
          and (w.updated_at, w.court_id) < (v.updated_at, v.court_id)) < 5)
  ), votes as (
    select access, count(*)::int as n, max(updated_at) as last from said group by access
  ), need as (select case when osm in ('public', 'pay') then 2 else 1 end as close),
  top as (select access, n from votes order by n desc, last desc limit 1),
  -- The players' closed answer, only once enough of them said it to stand.
  closed as (select v.access from votes v, need where v.access in ('members', 'private') and v.n >= need.close order by v.n desc, v.last desc limit 1)
  select case
    when (select access from top) is null then null
    when (select access from top) in ('public', 'pay') and (select n from top) < 2
         and (osm in ('members', 'private') or exists (select 1 from closed))
      then (select access from closed)
    when (select access from top) in ('members', 'private') and (select n from top) < (select close from need) then null
    else (select access from top) end
$$;

-- Migration 63's "right now at these courts" (who can see you on the map
-- applied to the players there), reading the age through the helper.
create or replace function public.court_right_now(ids text[])
returns table (court_id text, status text, status_at timestamptz, playing integer, friend_ids uuid[], you_here boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult),
  wanted as (select distinct x as id from unnest(ids[1:50]) as x where x is not null),
  here as (
    select k.court_id, k.user_id, k.created_at, p.created_at < now() - interval '7 days' as settled,
      public.follow_each_other(me.id, k.user_id) as mutual
    from public.court_checkins k
    join public.profiles p on p.id = k.user_id
    left join public.user_state us on us.user_id = k.user_id
    cross join me
    where k.court_id in (select id from wanted) and k.until > now() and k.user_id <> me.id
      and public.known_adult(k.user_id)
      and coalesce(us.map_visibility, 'nearby') <> 'none'
      and (coalesce(us.map_visibility, 'nearby') = 'nearby' or public.follow_each_other(me.id, k.user_id))
  )
  select w.id, st.status, st.created_at,
    case when me.adult and coalesce(h.settled, 0) >= 2 then h.n else 0 end,
    case when me.adult then coalesce(h.friends, '{}'::uuid[]) else '{}'::uuid[] end,
    exists (select 1 from public.court_checkins k where k.user_id = me.id and k.court_id = w.id and k.until > now())
  from wanted w cross join me
  left join lateral (
    select s.status, s.created_at from public.court_status s
    where s.court_id = w.id and s.created_at > now() - interval '90 minutes'
    order by s.created_at desc limit 1) st on true
  left join lateral (
    select count(*)::int as n, (count(*) filter (where here.settled))::int as settled,
      array_agg(here.user_id order by here.created_at desc) filter (where here.mutual) as friends
    from here where here.court_id = w.id) h on true
  where me.id is not null
$$;

create or replace function public.shows_at_court(viewer uuid, author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select viewer is not null and author is not null and (viewer = author or (
    not public.is_blocked_between(viewer, author)
    and exists (
      select 1 from public.profiles p where p.id = author
        and (not p.is_private or exists (select 1 from public.follows f where f.follower_id = viewer and f.following_id = author))
        and (public.known_adult(author) or public.follow_each_other(viewer, author)))))
$$;

-- Map and court alerts (migrations 53, 60, 63): only from and to adults.
-- "A new player shared their spot near you".
create or replace function public.tell_adults_new_player() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
  r record;
begin
  if not public.known_adult(new.user_id) then return new; end if;
  select created_at into joined from public.profiles where id = new.user_id;
  if joined is null or joined < now() - interval '14 days' then return new; end if;
  if exists (select 1 from public.notifications where actor_id = new.user_id and kind = 'map-new-player') then return new; end if;
  begin
    for r in
      select x.id, x.km from (
        select s.user_id as id, public.km_between(new.lat, new.lng, s.lat, s.lng) as km
        from public.last_seen s
        where s.user_id <> new.user_id and s.seen_at > now() - interval '30 days'
          and public.known_adult(s.user_id)
          and public.km_between(new.lat, new.lng, s.lat, s.lng) <= 50
          and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.actor_id = new.user_id and n.kind = 'joined')
          and public.spot_shown_to(s.user_id, new.user_id)
        order by 2 limit 50) x
      order by x.id
    loop
      perform public.send_map_alert(r.id, new.user_id, 'map-new-player', new.user_id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        'A new player shared their spot near you',
        public.miles_text(r.km) || ' from you. Say hi on the map.',
        '/map?lat=' || new.lat || '&lng=' || new.lng);
    end loop;
  exception when others then
    raise warning 'map alerts for new player %: %', new.user_id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.tell_court_about_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author public.profiles;
  c public.courts;
  what text;
  r record;
  sent boolean := false;
begin
  if new.court_id is null or new.archived or new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.court_id is not distinct from new.court_id then return new; end if;
  if new.created_at < now() - interval '2 days' then return new; end if;
  select * into author from public.profiles where id = new.author_id;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'post:' || new.id) then return new; end if;
  begin
    select * into c from public.courts where id = new.court_id;
    if c.id is null then return new; end if;
    what := case when new.kind = 'clip' or new.video_url is not null then 'clip' else 'post' end;
    for r in
      select f.user_id from public.court_follows f
      where f.court_id = c.id and f.user_id <> new.author_id
        and (not author.is_private or exists (select 1 from public.follows x where x.follower_id = f.user_id and x.following_id = new.author_id))
      order by f.user_id limit 500
    loop
      if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
        'New ' || what || ' at ' || coalesce(c.name, 'your court'),
        'New ' || what || ' at ' || coalesce(c.name, 'a court you follow'),
        'From a court you follow.',
        public.court_link(c.id, c.name, c.lat, c.lng)) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.author_id, 'post:' || new.id); end if;
  exception when others then
    raise warning 'court alerts for post %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- "Dev (you follow) is up for a hit today".
create or replace function public.tell_followers_up_for_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  spot public.last_seen;
  who text;
  r record;
  sent boolean := false;
  src text := 'up:' || current_date;
begin
  if new.open_to_hit_until is null or new.open_to_hit_until <= now() then return new; end if;
  if old.open_to_hit_until is not null and old.open_to_hit_until > now() then return new; end if;
  if not public.known_adult(new.id) then return new; end if;
  select * into spot from public.last_seen where user_id = new.id;
  if spot.user_id is null then return new; end if;
  if not public.fanout_allowed(new.id, src) then return new; end if;
  who := coalesce(nullif(new.name, ''), new.handle);
  begin
    for r in
      select x.id, x.km from (
        select f.follower_id as id, public.km_between(spot.lat, spot.lng, s.lat, s.lng) as km
        from public.follows f
        join public.last_seen s on s.user_id = f.follower_id and s.seen_at > now() - interval '30 days'
        where f.following_id = new.id and public.km_between(spot.lat, spot.lng, s.lat, s.lng) <= 50
          and public.known_adult(f.follower_id)
          and public.spot_shown_to(f.follower_id, new.id)
        order by 2 limit 200) x
      order by x.id
    loop
      if public.send_map_alert(r.id, new.id, 'map-friend-hit', new.id::text, 'profile',
        public.miles_text(r.km) || ' from you',
        who || ' (you follow) is up for a hit today',
        public.miles_text(r.km) || ' from you. See them on the map.',
        '/map?user=' || new.id || '&lat=' || spot.lat || '&lng=' || spot.lng) then sent := true; end if;
    end loop;
    if sent then perform public.note_fanout(new.id, src); end if;
  exception when others then
    raise warning 'map alerts for open-to-hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- No trigger runs this one any more (76 moved hits to tell_hit_matches_open,
-- which already asks known_adult); rewritten so nothing reads the old column.
create or replace function public.tell_hit_matches()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  poster public.profiles;
  lat1 double precision := nullif(new.place->>'lat', '')::double precision;
  lng1 double precision := nullif(new.place->>'lng', '')::double precision;
  sys text;
  words text;
  r record;
  told_poster boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  select * into poster from public.profiles where id = new.author_id;
  if not found or not public.known_adult(new.author_id) then return new; end if;
  sys := poster.profile->>'skillSystem';
  words := public.hit_when(new.starts_at, new.place) || ' · ' || coalesce(new.place->>'name', 'a court');

  -- Others with an open hit of their own, much like this one: closest in time first.
  for r in
    select h.id, h.author_id, h.starts_at, h.place
    from public.hit_requests h
    join public.profiles p on p.id = h.author_id
    where h.id <> new.id and h.author_id <> new.author_id and not h.cancelled
      and h.starts_at > now()
      and abs(extract(epoch from (h.starts_at - new.starts_at))) <= 2 * 3600
      and (h.format = new.format or 'hit' in (h.format, new.format))
      and public.known_adult(h.author_id)
      and not public.is_blocked_between(h.author_id, new.author_id)
      and (
        (lat1 is not null and nullif(h.place->>'lat', '') is not null
          and public.km_between(lat1, lng1, (h.place->>'lat')::double precision, (h.place->>'lng')::double precision) <= 25)
        or lower(btrim(coalesce(h.place->>'name', ''))) = lower(btrim(coalesce(new.place->>'name', '')))
      )
      and (
        h.level_min is null or new.level_min is null
        or coalesce(p.profile->>'skillSystem', '') is distinct from coalesce(sys, '')
        or (h.level_min <= new.level_max and new.level_min <= h.level_max)
      )
    order by abs(extract(epoch from (h.starts_at - new.starts_at)))
    limit 10
  loop
    perform public.file_notification(r.author_id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    if not told_poster then
      perform public.file_notification(new.author_id, r.author_id, 'hit-match', r.id::text, 'hit-request',
        public.hit_when(r.starts_at, r.place) || ' · ' || coalesce(r.place->>'name', 'a court'), true);
      told_poster := true;
    end if;
  end loop;

  -- Ring on today, near the court, at a level the hit asks for.
  if lat1 is not null then
    for r in
      select p.id
      from public.profiles p
      left join public.last_seen s on s.user_id = p.id
      where p.id <> new.author_id
        and p.open_to_hit_until > now()
        and public.known_adult(p.id)
        and coalesce(s.lat, p.city_lat) is not null
        and public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng)) <= 25
        and not public.is_blocked_between(p.id, new.author_id)
        and (
          new.level_min is null
          or (coalesce(p.profile->>'skillSystem', '') = coalesce(sys, '')
              and nullif(p.profile->>'rating', '')::numeric between new.level_min and new.level_max)
        )
        and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'hit-match' and n.target_id = new.id::text)
      order by public.km_between(lat1, lng1, coalesce(s.lat, p.city_lat), coalesce(s.lng, p.city_lng))
      limit 25
    loop
      perform public.file_notification(r.id, new.author_id, 'hit-match', new.id::text, 'hit-request', words, true);
    end loop;
  end if;
  return new;
end $$;

create or replace function public.tell_map_about_hit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lat1 double precision;
  lng1 double precision;
  c public.courts;
  whenx text;
  r record;
  sent boolean := false;
begin
  if new.cancelled or new.starts_at < now() then return new; end if;
  if not public.known_adult(new.author_id) then return new; end if;
  if not public.fanout_allowed(new.author_id, 'hit:' || new.id) then return new; end if;
  begin
    lat1 := nullif(new.place->>'lat', '')::double precision;
    lng1 := nullif(new.place->>'lng', '')::double precision;
    whenx := public.hit_when(new.starts_at, new.place);
    select * into c from public.courts where id = new.place->>'id';
    if c.id is not null then
      for r in
        select f.user_id from public.court_follows f
        where f.court_id = c.id and f.user_id <> new.author_id
          and not exists (select 1 from public.notifications n where n.user_id = f.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
        order by f.user_id limit 500
      loop
        if public.send_map_alert(r.user_id, new.author_id, 'court-activity', c.id, 'court',
          'New hit at ' || coalesce(c.name, 'your court') || ' · ' || whenx,
          'New hit at ' || coalesce(c.name, 'a court you follow'),
          upper(left(whenx, 1)) || substr(whenx, 2),
          public.court_link(c.id, c.name, c.lat, c.lng) || '&hit=' || new.id) then sent := true; end if;
      end loop;
    end if;
    if lat1 is not null and lng1 is not null then
      for r in
        select x.id, x.km from (
          select s.user_id as id, public.km_between(lat1, lng1, s.lat, s.lng) as km
          from public.last_seen s
          where s.user_id <> new.author_id and s.seen_at > now() - interval '30 days'
            and s.lat between lat1 - 0.5 and lat1 + 0.5
            and public.km_between(lat1, lng1, s.lat, s.lng) <= 25
            and public.known_adult(s.user_id)
            and not exists (select 1 from public.notifications n where n.user_id = s.user_id and n.kind = 'hit-match' and n.target_id = new.id::text)
            and (c.id is null or not exists (select 1 from public.court_follows f where f.user_id = s.user_id and f.court_id = c.id))
          order by 2 limit 50) x
        order by x.id
      loop
        if public.send_map_alert(r.id, new.author_id, 'map-new-hit', new.id::text, 'hit-request',
          public.miles_text(r.km) || ' from you · ' || whenx,
          'New open hit ' || public.miles_text(r.km) || ' from you',
          upper(left(whenx, 1)) || substr(whenx, 2) || ' · ' || coalesce(new.place->>'name', 'a court'),
          '/map?hit=' || new.id || '&lat=' || lat1 || '&lng=' || lng1) then sent := true; end if;
      end loop;
    end if;
    if sent then perform public.note_fanout(new.author_id, 'hit:' || new.id); end if;
  exception when others then
    raise warning 'map alerts for hit %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- New on CourtSide (migration 63), the same people, the age read from the
-- settings row: known adults and 16 and 17 year olds (a birthday on file
-- saying so); a known adult sees adults, public 16 and 17 year olds and
-- anyone they follow; anyone else only people they follow.
create or replace function public.new_on_courtside(days integer default 14)
returns table (user_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, public.known_adult(auth.uid()) as adult)
  select p.id, p.created_at
  from public.profiles p cross join me
  left join public.user_state us on us.user_id = p.id
  where me.id is not null and p.id <> me.id
    and p.created_at >= now() - make_interval(days => least(greatest(coalesce(days, 14), 1), 60))
    and p.suspended_at is null
    and not public.is_blocked_between(me.id, p.id)
    and (us.age_group = 'adult' or (us.age_group = 'teen' and us.birth_date is not null and us.birth_date <= (current_date - interval '16 years')::date))
    and (
      exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = p.id)
      or (me.adult and (us.age_group = 'adult' or not p.is_private)))
  order by p.created_at desc, p.id
  limit 100
$$;

-- Following whoever invited you (migration 84): only when you are both
-- adults or both teens. As live, but the two ages read from the settings rows.
create or replace function public.same_age_band(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select sa.age_group is not null and sa.age_group = sb.age_group
                   from public.user_state sa, public.user_state sb where sa.user_id = a and sb.user_id = b), false)
$$;
revoke all on function public.same_age_band(uuid, uuid) from public, anon, authenticated;

-- ------------------------------- 5. helpers the app could call, out of reach
-- Who can read a hit and who is in it (hit_shown_to_you, join_shown_to_you
-- and their two rules) went live in migration 95, word for word as 64 wrote
-- them; who can see a spot (spot_shown_to_you and "who sees a spot") went
-- live in 78 and was kept by 98 and 105. All of them ask known_adult, so
-- they follow the age to its new place. What they decide does not change.
--
-- But each helper could also be called by name from the app, about any id.
-- They move to "private", an area of the database the app's gateway does
-- not open (only public is open to it). The rules on the tables still ask
-- them, word for word as before: a rule runs as the person reading, so
-- signed-in players keep the right to use them there, and only there.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.hit_shown_to_you(hit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_requests h
    where h.id = hit and (
      h.author_id = auth.uid()
      or public.known_adult(h.author_id)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = h.author_id)
      or exists (select 1 from public.hit_joins j where j.hit_id = h.id and j.user_id = auth.uid())))
$$;

create or replace function private.join_shown_to_you(hit uuid, who uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hit_joins j join public.hit_requests h on h.id = j.hit_id
    where j.hit_id = hit and j.user_id = who and (
      who = auth.uid()
      or h.author_id = auth.uid()
      or public.known_adult(who)
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = who)
      or exists (select 1 from public.hit_joins m where m.hit_id = hit and m.user_id = auth.uid())))
$$;

create or replace function private.spot_shown_to_you(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and owner is not null and public.spot_shown_to(auth.uid(), owner)
$$;

revoke all on function private.hit_shown_to_you(uuid) from public, anon;
revoke all on function private.join_shown_to_you(uuid, uuid) from public, anon;
revoke all on function private.spot_shown_to_you(uuid) from public, anon;
grant execute on function private.hit_shown_to_you(uuid) to authenticated;
grant execute on function private.join_shown_to_you(uuid, uuid) to authenticated;
grant execute on function private.spot_shown_to_you(uuid) to authenticated;

-- The same three rules, now asking the private helpers (checked word for
-- word against Oct 5 in section 0).
alter policy "hits are visible" on public.hit_requests
  using ((auth.uid() is not null) and (not public.blocked_with(author_id))
         and ((author_id = auth.uid()) or private.hit_shown_to_you(id)));
alter policy "joins are visible" on public.hit_joins
  using ((exists (select 1 from public.hit_requests h where h.id = hit_joins.hit_id))
         and private.join_shown_to_you(hit_id, user_id));
alter policy "who sees a spot" on public.last_seen
  using ((user_id = auth.uid()) or private.spot_shown_to_you(user_id));

drop function if exists public.hit_shown_to_you(uuid);
drop function if exists public.join_shown_to_you(uuid, uuid);
drop function if exists public.spot_shown_to_you(uuid);

-- Signed out (94, 103): nothing about people at all. Showing signed-out
-- readers adults' profiles and posts only meant that the difference from
-- what any free account sees was exactly the list of teens. Nothing in the
-- app reads profiles or posts signed out; a shared link's page asks
-- share_preview, which these rules do not touch. The two helpers only
-- these rules used (and that anyone could call about any id) are removed.
drop policy if exists "signed out see adults only" on public.profiles;
drop policy if exists "signed out see no profiles" on public.profiles;
create policy "signed out see no profiles" on public.profiles
  as restrictive for select to anon
  using (false);
drop policy if exists "signed out see adults' posts only" on public.posts;
drop policy if exists "signed out see no posts" on public.posts;
create policy "signed out see no posts" on public.posts
  as restrictive for select to anon
  using (false);
drop function if exists public.shown_signed_out(uuid);
drop function if exists public.post_shown_signed_out(uuid, uuid[], jsonb);

-- ----------------------------------------------- 6. how much anyone may ask
-- Each person someone asks the age rules about (open_to_you,
-- shown_at_court, session_tag_refusal, can_join_groups, and the actions in
-- section 4 whose yes or no depends on someone else's age), kept a day.
-- Asking about the same person again is free; 300 different people a day at
-- most. Two questions at the same moment from one player wait for each
-- other, so they cannot both use the same room. Server only.
create table if not exists public.age_rule_asks (
  asker_id uuid not null references public.profiles(id) on delete cascade,
  about_id uuid not null references public.profiles(id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (asker_id, about_id)
);
alter table public.age_rule_asks enable row level security;
revoke all on public.age_rule_asks from public, anon, authenticated;

-- Of these people, the ones you may be answered about now: those asked
-- about in the last day, then new ones while the day's 300 last.
create or replace function public.age_rule_budget(ids uuid[])
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  had uuid[];
  fresh uuid[];
  room int;
begin
  if me is null or ids is null or not exists (select 1 from public.profiles where id = me) then return '{}'; end if;
  perform pg_advisory_xact_lock(hashtextextended('age_rule_budget:' || me::text, 109));
  delete from public.age_rule_asks where asker_id = me and asked_at < now() - interval '1 day';
  select coalesce(array_agg(a.about_id), '{}') into had
    from public.age_rule_asks a where a.asker_id = me and a.about_id = any (ids);
  room := greatest(0, 300 - (select count(*)::int from public.age_rule_asks a where a.asker_id = me));
  select coalesce(array_agg(x.id order by x.n), '{}') into fresh from (
    select u.id, min(u.n) as n from unnest(ids) with ordinality as u(id, n)
    where u.id is not null and u.id <> me and not (u.id = any (had))
      and exists (select 1 from public.profiles p where p.id = u.id)
    group by u.id) x;
  fresh := fresh[1:room];
  insert into public.age_rule_asks (asker_id, about_id)
    select me, f from unnest(fresh) as f on conflict do nothing;
  return had || fresh;
end $$;
revoke all on function public.age_rule_budget(uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------- 7. what the app may ask
-- For each of these people (up to 100), signed in only: whether you may
-- start a one-to-one chat with them, add them to a group, or tag them in a
-- session (they are known to be an adult, or they follow you). Never the
-- age itself. Left out: yourself, someone with no profile, anyone you are
-- blocked with either way (refused on its own), and anyone past the day's
-- limit (the app then lets you try; the action itself then answers
-- 'age_rule_limit' for anyone new, whatever their age, until the day frees up).
drop function if exists public.open_to_you(uuid[]);
create function public.open_to_you(ids uuid[])
returns table (user_id uuid, chat boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  asked uuid[];
begin
  if me is null then return; end if;
  asked := public.age_rule_budget((coalesce(ids, '{}'))[1:100]);
  return query
    select p.id,
      public.known_adult(p.id)
        or exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = me)
    from public.profiles p
    where p.id = any (asked) and not public.is_blocked_between(me, p.id);
end $$;
revoke all on function public.open_to_you(uuid[]) from public, anon;
grant execute on function public.open_to_you(uuid[]) to authenticated;

-- Of these posts (up to 100), the ones that may show on a court's page for
-- you: posts with a court, by you, or by someone whose posts may count at a
-- court for you (never across a block, a private account only for its
-- followers, someone not known to be an adult only for people they follow
-- back). The day's limit counts their authors.
create or replace function public.shown_at_court(post_ids uuid[])
returns setof uuid language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wanted uuid[] := (coalesce(post_ids, '{}'))[1:100];
  asked uuid[];
begin
  if me is null then return; end if;
  asked := public.age_rule_budget(array(
    select distinct p.author_id from public.posts p where p.id = any (wanted) and p.author_id <> me));
  return query
    select p.id from public.posts p
    where p.id = any (wanted)
      and p.court_id is not null and not p.archived and p.removed_at is null
      and (p.author_id = me or p.author_id = any (asked))
      and public.shows_at_court(me, p.author_id);
end $$;
revoke all on function public.shown_at_court(uuid[]) from public, anon;
grant execute on function public.shown_at_court(uuid[]) to authenticated;

-- Whether you may tag someone (migration 62), with the day's limit on the
-- answers that depend on the age: past it, no answer (null), and the tag
-- itself is checked when it is made.
create or replace function public.session_tag_refusal(who uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  r text := public.session_tag_refusal_for(auth.uid(), who);
begin
  if (r is null or r = 'teen_closed') and auth.uid() is not null and who is not null
     and not (who = any (public.age_rule_budget(array[who]))) then
    return null;
  end if;
  return r;
end $$;
revoke all on function public.session_tag_refusal(uuid) from public, anon;
grant execute on function public.session_tag_refusal(uuid) to authenticated;

-- ------------------------------------------------- 8. the old column goes
drop trigger if exists guard_age_group on public.profiles;
drop function if exists public.guard_age_group();
alter table public.profiles drop column if exists age_group;

-- ------------------------------------------------------------- 9. last check
-- Nothing left in the database may still look for an age anywhere but the
-- settings row, the helper stays server-only, and the app's questions are
-- open to signed-in players only. Any of these failing undoes the whole file.
do $$
declare bad text;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'age_group') then
    raise exception 'Migration 109 stopped: profiles still has the age group. Nothing was changed.';
  end if;
  -- guard_new_profile (93) names it only as a field to reset on a new row;
  -- a field the table no longer has is skipped, so it is left as it is.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname not in ('known_adult', 'set_birth_date', 'guard_state_age_group', 'new_on_courtside', 'same_age_band')
      and not (p.proname = 'guard_new_profile' and md5(p.prosrc) = '5b34b898d39fda92ae5de03dca77ef58');
  if bad is not null then
    raise exception 'Migration 109 stopped: these functions still read the age from somewhere else: %. Nothing was changed.', bad;
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'age_group'
      and p.proname <> 'guard_state_age_group'  -- the settings row's own guard: new/old are settings rows
      and p.prosrc ~* '(profiles|\mp|\mpa|\mpb|\mnew|\mold|\mauthor|\mposter)\.age_group';
  if bad is not null then
    raise exception 'Migration 109 stopped: % still read a profile''s age group. Nothing was changed.', bad;
  end if;
  select string_agg(tablename || ' (' || policyname || ')', ', ') into bad
    from pg_policies
    where coalesce(qual, '') || coalesce(with_check, '') ~* 'age_group|known_adult';
  if bad is not null then
    raise exception 'Migration 109 stopped: these rules still read the age: %. Nothing was changed.', bad;
  end if;
  select string_agg(viewname, ', ') into bad from pg_views where schemaname = 'public' and definition ~* 'age_group';
  if bad is not null then
    raise exception 'Migration 109 stopped: these views still read the age: %. Nothing was changed.', bad;
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('known_adult', 'age_rule_budget', 'same_age_band', 'guard_state_age_group')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if bad is not null then
    raise exception 'Migration 109 stopped: the app could call % (server only). Nothing was changed.', bad;
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('open_to_you', 'shown_at_court', 'session_tag_refusal')
      and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'));
  if bad is not null then
    raise exception 'Migration 109 stopped: % should be for signed-in players only. Nothing was changed.', bad;
  end if;
  if has_table_privilege('anon', 'public.age_rule_asks', 'select') or has_table_privilege('authenticated', 'public.age_rule_asks', 'select') then
    raise exception 'Migration 109 stopped: the app could read age_rule_asks. Nothing was changed.';
  end if;
  -- Every helper that answers about someone's age or what may be shown of
  -- them is server only (in public), or gone from public.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('group_fits', 'session_tag_refusal_for', 'shows_at_court', 'map_pair_ok', 'spot_shown_to',
                        'share_open', 'share_open_to_me', 'map_under_16', 'players_court_access', 'minor_shares_spot')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if bad is not null then
    raise exception 'Migration 109 stopped: the app could call % (server only). Nothing was changed.', bad;
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('shown_signed_out', 'post_shown_signed_out', 'hit_shown_to_you', 'join_shown_to_you', 'spot_shown_to_you');
  if bad is not null then
    raise exception 'Migration 109 stopped: % is still in public, where the app can call it. Nothing was changed.', bad;
  end if;
  -- The private helpers: running as the server, usable by signed-in players
  -- (their rules need it), never by signed-out ones, and asked by the rules.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.prosecdef
        and p.proname in ('hit_shown_to_you', 'join_shown_to_you', 'spot_shown_to_you')
        and has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('anon', p.oid, 'execute')) <> 3
     or has_schema_privilege('anon', 'private', 'usage')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hit_requests' and policyname = 'hits are visible' and qual ~ 'private\.hit_shown_to_you\(')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hit_joins' and policyname = 'joins are visible' and qual ~ 'private\.join_shown_to_you\(')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'last_seen' and policyname = 'who sees a spot' and qual ~ 'private\.spot_shown_to_you\(') then
    raise exception 'Migration 109 stopped: the private helpers or the rules asking them are not as this file sets them. Nothing was changed.';
  end if;
  -- Signed out: no profiles, no posts.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'signed out see no profiles'
                 and permissive = 'RESTRICTIVE' and cmd = 'SELECT' and roles = '{anon}' and qual = 'false')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'signed out see no posts'
                 and permissive = 'RESTRICTIVE' and cmd = 'SELECT' and roles = '{anon}' and qual = 'false') then
    raise exception 'Migration 109 stopped: the signed-out rules for profiles and posts are not in place. Nothing was changed.';
  end if;
  -- Asking writes the day's list down, which only a volatile function may do.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~ '(age_rule_budget|group_fits)\(' and p.provolatile <> 'v';
  if bad is not null then
    raise exception 'Migration 109 stopped: % ask the day''s limit but are not volatile. Nothing was changed.', bad;
  end if;
end $$;

-- Tell the app's database gateway about the new questions straight away.
notify pgrst, 'reload schema';

commit;

-- ------------------------------------------------------- 10. checks to run afterwards
-- Read-only: each of these only looks. Paste one at a time into the SQL
-- editor (remove the leading "-- ") after running this file.
--
-- (a) The age is off profiles and on settings rows (expect 0 | 1):
-- select (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'age_group') on_profiles,
--        (select count(*) from information_schema.columns where table_name = 'user_state' and column_name = 'age_group') on_settings;
--
-- (b) Every account that had an age still has it (expect the same two numbers as before: teens, adults):
-- select age_group, count(*) from public.user_state where age_group is not null group by 1;
--
-- (c) Signed out, nothing about people (expect 0 | 0):
-- begin; set local role anon;
--   select (select count(*) from public.profiles) profiles, (select count(*) from public.posts) posts;
-- rollback;
