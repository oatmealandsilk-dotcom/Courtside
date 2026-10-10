-- CourtSide · migration 20261010000157: short invite codes for affiliates
-- (Oct 10, owner: "can you make their codes. code blick and code ambrose").
--
-- What it is for: an affiliate's code has been their @handle, typed at
-- "Invited by?" when someone signs up, or carried on their link as
-- courtsidebase.com/?ref=<handle>. Some handles are long to say out loud
-- (@tblickalexander, @ambrosehalexander), so an affiliate can now also have a
-- short code: typing "blick" at "Invited by?", or arriving through
-- courtsidebase.com/?ref=blick or app.courtsidebase.com/join?ref=blick,
-- credits them exactly as their handle would: the same player counted, the
-- same payout, the same row in their own list. Their handle keeps working too.
--
--   1. affiliate_codes: a small private table, one row per short code and the
--      account it belongs to. It starts with the two the owner asked for:
--        blick   -> @tblickalexander
--        ambrose -> @ambrosehalexander
--      The owner changes it in the SQL editor, no new app needed:
--        add a code (one line; change the two words in quotes):
--          insert into public.affiliate_codes (code, user_id) values ('newcode', (select id from public.profiles where handle = 'theirhandle'));
--        see the codes:
--          select c.code, p.handle from public.affiliate_codes c join public.profiles p on p.id = c.user_id order by 1;
--        remove one:
--          delete from public.affiliate_codes where code = 'newcode';
--      A code is written down in lower case without spaces or @ ("Blick ",
--      "@blick" and "blick" are the same code). It is refused, with a plain
--      message and nothing saved, when no account has that handle, when it is
--      not 3 to 24 letters, numbers or underscores, when it is one of our own
--      campaign labels (instagram, qr...), or when it is, or was, someone
--      else's handle (it would take their credit). The code follows the
--      account, not the handle: it keeps working if they change their handle.
--      Adding a code does not make anyone an affiliate (that is still the
--      'affiliates' list, migration 147).
--   2. affiliate_code_owner(code): the one place the server turns a short
--      code into a person. Any case, spaces and @ ignored. A real handle
--      always wins: a code never credits anyone in place of the account that
--      has that handle.
--   3. invite_handle_from (migration 116's, plus one step): a short code comes
--      back as its account's @handle. Everything typed or carried on a link
--      already reads through it ("Invited by?" = claim_invite_code, a link
--      opened on the phone = claim_referral, a link that rode along with the
--      sign-up = credit_waitlist_referral), so all of them credit a code
--      exactly as the handle. It now reads a table, so it is no longer
--      callable from the app or the website (neither ever called it; the
--      server's own functions still do).
--   4. waitlist_label_owner (116's, plus one step): someone who left their
--      email on courtsidebase.com/?ref=blick and later signs up with it gets
--      the code's account filled in at "Invited by?" (it counts once they
--      press Continue, migration 124), as a handle label already does.
--   5. handle_status (117's) and handle_new_user (116's), one line each: a
--      code counts as taken, so nobody can sign up as @blick or change to it
--      later (only the code's own account may make it its handle). This is
--      also how the website knows ?ref=blick is real: it
--      shows "type blick" and carries it untouched into the web app's /join
--      link, as it does for a handle (the app's sign-in page, asking the
--      same, says "Invited by @blick").
--   6. my_affiliate_stats (147's, plus one field): an affiliate with a code
--      also gets "code": "blick", so their Invites page shows the short code
--      and the short link courtsidebase.com/?ref=blick.
--
-- Nothing here changes who is credited for anyone already joined, pays
-- anyone, or touches the payout records. Needs migrations 116, 117 and 147
-- (all live). Stops before changing anything if a real @blick or @ambrose
-- exists (or existed), if either affiliate has no account, or if a function
-- it replaces has changed since it was written (Oct 10). Safe to run more
-- than once: codes already there are kept as they are.

begin;

-- ------------------------------------------------------------------ 0. check
do $$
declare
  -- md5 of each replaced function's body as it is live (Oct 10).
  want constant jsonb := '{
    "invite_handle_from": "ec0d382c48089c9642212bd2b3bb8e5d",
    "waitlist_label_owner": "0abe7debb1ca91e4d4bcdcb50bd3bdef",
    "handle_status": "708c488d09e8ee39d6e5596677a664ca",
    "handle_new_user": "5006fdfb55dc8fb2e31820ca59334562",
    "my_affiliate_stats": "d70686fca7179d37c201dafb2662517b"}';
  r record;
  seen int := 0;
  s record;
  saved boolean;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.handle_history') is null
     or to_regclass('public.waitlist') is null or to_regclass('public.server_settings') is null
     or to_regprocedure('public.campaign_label(text)') is null
     or to_regprocedure('public.words_in_name(text)') is null
     or to_regprocedure('public.is_affiliate(uuid)') is null
     or to_regprocedure('public.invite_settle(uuid)') is null
     or to_regprocedure('public.invite_counts(uuid)') is null
     or to_regprocedure('public.invite_rate_cents()') is null then
    raise exception 'Migration 157 stopped before changing anything: migrations 116, 117 and 147 have to run first.';
  end if;
  for r in select p.proname, md5(p.prosrc) as m, p.prosrc as src from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in (select jsonb_object_keys(want)) loop
    seen := seen + 1;
    if r.m <> want->>r.proname and position('affiliate_codes_157' in r.src) = 0 then
      raise exception 'Migration 157 stopped before changing anything: public.% has changed since Oct 10 (md5 %). Bring this file up to date with that change first.', r.proname, r.m;
    end if;
  end loop;
  if seen <> 5 then
    raise exception 'Migration 157 stopped before changing anything: one of the functions it replaces is missing (migrations 116, 117 and 147 have to run first).';
  end if;
  for r in select p.proname, p.prosrc as src from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('affiliate_code_owner', 'affiliate_codes_check') loop
    if position('affiliate_codes_157' in r.src) = 0 then
      raise exception 'Migration 157 stopped before changing anything: public.% already exists and is not this file''s. Compare before replacing it.', r.proname;
    end if;
  end loop;
  if to_regclass('public.affiliate_codes') is not null and (
       not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'affiliate_codes' and column_name = 'code')
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'affiliate_codes' and column_name = 'user_id')) then
    raise exception 'Migration 157 stopped before changing anything: public.affiliate_codes already exists and is not this file''s.';
  end if;
  -- The two codes: each must not be (or have been) anyone else's handle, and
  -- each affiliate must have an account. Skipped for a code already saved.
  for s in select * from (values ('blick', 'tblickalexander'), ('ambrose', 'ambrosehalexander')) as v (code, handle) loop
    saved := false;
    if to_regclass('public.affiliate_codes') is not null then
      -- (Asked this way so the check also runs before the table exists.)
      execute 'select exists (select 1 from public.affiliate_codes where code = $1)' into saved using s.code;
    end if;
    if saved then continue; end if;
    if not exists (select 1 from public.profiles where handle = s.handle) then
      raise exception 'Migration 157 stopped before changing anything: no account has the handle @%, so the code % has nobody to credit.', s.handle, s.code;
    end if;
    if exists (select 1 from public.profiles where handle = s.code) then
      raise exception 'Migration 157 stopped before changing anything: a real @% exists, so % cannot be a code (it would take their credit).', s.code, s.code;
    end if;
    if exists (select 1 from public.handle_history h
               where h.handle = s.code and h.user_id is distinct from (select id from public.profiles where handle = s.handle)) then
      raise exception 'Migration 157 stopped before changing anything: @% was someone''s handle before, so % cannot be a code (their old links would credit someone else).', s.code, s.code;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------- 1. the codes
create table if not exists public.affiliate_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_codes_user_idx on public.affiliate_codes (user_id);
alter table public.affiliate_codes enable row level security;
-- Private: no rule lets anyone read or write it from the app or the website.
revoke all on table public.affiliate_codes from public, anon, authenticated;

-- Every code written down the same way, and refused with a plain message
-- when it would credit the wrong person.
create or replace function public.affiliate_codes_check()
returns trigger language plpgsql set search_path = public as $$
begin
  -- affiliate_codes_157
  new.code := lower(regexp_replace(coalesce(new.code, ''), '[\s@]', '', 'g'));
  if new.code !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'A code is 3 to 24 letters, numbers or underscores ("%" is not).', new.code;
  end if;
  if new.user_id is null then
    raise exception 'No account has that handle, so the code % was not added. Check the spelling of the handle.', new.code;
  end if;
  if public.campaign_label(new.code) then
    raise exception '% is one of our own campaign labels (instagram, qr...), which never credit anyone. Pick another code.', new.code;
  end if;
  if exists (select 1 from public.profiles where handle = new.code and id <> new.user_id) then
    raise exception '@% is someone else''s handle, so it cannot be a code (it would take their credit).', new.code;
  end if;
  if exists (select 1 from public.handle_history where handle = new.code and user_id is distinct from new.user_id) then
    raise exception '@% was someone else''s handle before, so it cannot be a code (their old links would credit the wrong person).', new.code;
  end if;
  return new;
end $$;
revoke all on function public.affiliate_codes_check() from public, anon, authenticated;

drop trigger if exists affiliate_codes_check on public.affiliate_codes;
create trigger affiliate_codes_check before insert or update on public.affiliate_codes
  for each row execute function public.affiliate_codes_check();

-- The two codes of Oct 10. A code already there is never changed.
insert into public.affiliate_codes (code, user_id)
select v.code, p.id
  from (values ('blick', 'tblickalexander'), ('ambrose', 'ambrosehalexander')) as v (code, handle)
  join public.profiles p on p.handle = v.handle
on conflict (code) do nothing;

-- ------------------------------------------- 2. a code becomes a person
-- The one place. Server only: the app and the website never ask it.
create or replace function public.affiliate_code_owner(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  -- affiliate_codes_157
  select a.user_id
    from public.affiliate_codes a
   where a.code = lower(regexp_replace(coalesce(p_code, ''), '[\s@]', '', 'g'))
     -- A real handle always wins: a code never credits anyone in place of
     -- the account that has that handle.
     and not exists (select 1 from public.profiles p where p.handle = a.code and p.id <> a.user_id)
$$;
revoke all on function public.affiliate_code_owner(text) from public, anon, authenticated;

-- ------------------------------- 3. "Invited by?", links and the sign-up
-- Migration 116's, word for word, plus the last step: a short code comes
-- back as its account's @handle. Stable now (it reads a table) and server
-- only: claim_invite_code, claim_referral and credit_waitlist_referral call it.
CREATE OR REPLACE FUNCTION public.invite_handle_from(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  t text := lower(btrim(coalesce(p_text, '')));
  code_owner uuid;
begin
  -- affiliate_codes_157
  if t ~ 'ref=' then
    -- …/join?ref=om, courtsidebase.com/?ref=om (an @ may be written as %40)
    t := coalesce(substring(t from 'ref=(?:@|%40)*([a-z0-9_]+)'), t);
  elsif t ~ '(^|[?&])r=[0-9a-f]{8}([^0-9a-f]|$)' then
    -- courtsidebase.com/?r=1a2b3c4d: a friend's waitlist link
    return 'r=' || substring(t from '(?:^|[?&])r=([0-9a-f]{8})(?:[^0-9a-f]|$)');
  elsif t ~ '^(https?://|www\.)' or t ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+/' then
    -- any other link: its last part (app.courtsidebase.com/u/om, instagram.com/om/)
    t := regexp_replace(t, '[?#].*$', '');
    t := regexp_replace(t, '/+$', '');
    t := regexp_replace(t, '^.*/', '');
  end if;
  t := regexp_replace(t, '\s', '', 'g');
  t := ltrim(t, '@');
  -- A short code (blick): its account's handle, so it credits exactly as the handle does.
  code_owner := public.affiliate_code_owner(t);
  if code_owner is not null then
    t := coalesce((select p.handle from public.profiles p where p.id = code_owner), t);
  end if;
  return t;
end $function$;
revoke all on function public.invite_handle_from(text) from public, anon, authenticated;

-- ------------------------------------------- 4. the website's ?ref= label
-- Migration 116's, word for word, plus the last step: a label that is a
-- short code names its account, when no account held that handle then and
-- the code's account was already there when the link was used. (Since
-- migration 124 the waitlist only fills in "Invited by?" with it.)
CREATE OR REPLACE FUNCTION public.waitlist_label_owner(p_src text, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  src text := lower(btrim(coalesce(p_src, '')));
  who uuid;
begin
  -- affiliate_codes_157
  if p_at is null or src !~ '^[a-z0-9_]{2,24}$' or public.campaign_label(src) then return null; end if;
  select p.id into who from public.profiles p
   where p.handle = src and p.created_at <= p_at
     and (p.handle_changed_at is null or p.handle_changed_at <= p_at);
  if who is null then
    -- They changed handle since: the account that let it go after the link
    -- was used, and only when it is the first handle that account let go
    -- after then (the one it really held). Taking a label later and letting
    -- it go collects nothing.
    select h.user_id into who
      from public.handle_history h join public.profiles p on p.id = h.user_id
     where h.handle = src and h.released_at > p_at and p.created_at <= p_at
       and not exists (select 1 from public.handle_history h2
                        where h2.user_id = h.user_id and h2.released_at > p_at and h2.released_at < h.released_at)
     order by h.released_at asc limit 1;
  end if;
  if who is null then
    -- A short code (?ref=blick): the account it belongs to.
    select p.id into who from public.profiles p
     where p.id = public.affiliate_code_owner(src) and p.created_at <= p_at;
  end if;
  return who;
end $function$;

-- ------------------------------------- 5. nobody can take a code as a handle
-- Migration 117's, word for word, plus one line: a code says 'taken' (to
-- everyone but its own account). The sign-up form, Change handle, the
-- sign-in page and the website all ask this.
CREATE OR REPLACE FUNCTION public.handle_status(p_handle text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  wanted text := lower(trim(coalesce(p_handle, '')));
  me uuid := auth.uid();
  owner uuid;
begin
  -- affiliate_codes_157
  if wanted !~ '^[a-z0-9_]{2,24}$' then return 'invalid'; end if;
  select id into owner from public.profiles where handle = wanted;
  if owner is not null then
    return case when owner = me then 'yours' else 'taken' end;
  end if;
  if char_length(wanted) < 3 then return 'invalid'; end if;
  if public.campaign_label(wanted) then return 'taken'; end if;
  -- A short code is taken, except by the account it belongs to.
  if exists (select 1 from public.affiliate_codes where code = wanted and user_id is distinct from me) then return 'taken'; end if;
  if public.words_in_name(wanted) then return 'words'; end if;
  if exists (
    select 1 from public.handle_history
    where handle = wanted and released_at > now() - interval '14 days' and user_id is distinct from me
  ) then
    return 'held';
  end if;
  return 'ok';
end $function$;

-- Migration 116's, word for word, plus one line: a sign-up asking for a code
-- (or whose email starts with one) gets a number added, as a taken handle does.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  final  text := regexp_replace(wanted, '[^a-z0-9_]', '', 'g');
begin
  -- affiliate_codes_157
  if char_length(final) < 2 then final := 'player'; end if;
  final := left(final, 20);
  -- Keep the handle unique without failing the sign-up.
  while exists (select 1 from public.profiles where handle = final)
     or exists (select 1 from public.handle_history where handle = final and released_at > now() - interval '14 days')
     or exists (select 1 from public.affiliate_codes where code = final)
     or public.campaign_label(final) loop
    final := left(final, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
  end loop;
  insert into public.profiles (id, handle, name)
  values (new.id, final, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(replace(final, '_', ' '))));
  return new;
end $function$;

-- ------------------------------------------------ 6. the affiliate's page
-- Migration 147's, plus one field: their short code, when they have one that
-- credits them (the oldest, if they have several).
CREATE OR REPLACE FUNCTION public.my_affiliate_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  c jsonb;
begin
  -- affiliate_codes_157
  if me is null then raise exception 'sign in first'; end if;
  if not public.is_affiliate(me) then return jsonb_build_object('affiliate', false); end if;
  perform public.invite_settle(me);
  c := public.invite_counts(me);
  return jsonb_strip_nulls(c || jsonb_build_object(
    'affiliate', true,
    'rateCents', public.invite_rate_cents(),
    'earnedCents', coalesce((c->>'paidCents')::int, 0) + coalesce((c->>'owedCents')::int, 0),
    'code', (select a.code from public.affiliate_codes a
              where a.user_id = me and public.affiliate_code_owner(a.code) = me
              order by a.created_at, a.code limit 1)));
end $function$;
revoke all on function public.my_affiliate_stats() from public, anon;
grant execute on function public.my_affiliate_stats() to authenticated;

-- --------------------------------------------------------- 7. it worked
do $$
begin
  if public.invite_handle_from(' Blick ') <> 'tblickalexander' or public.invite_handle_from('courtsidebase.com/?ref=Ambrose') <> 'ambrosehalexander' then
    raise exception 'migration 157: the codes do not reach their accounts';
  end if;
  if public.handle_status('blick') <> 'taken' or public.handle_status('ambrose') <> 'taken' then
    raise exception 'migration 157: the codes are not kept from being taken as handles';
  end if;
end $$;

commit;

-- ------------------------------------------------------------- DRY RUN
-- To try this file without keeping anything: run it with its "commit;" line
-- (just above) replaced by the lines below, each without its leading "-- ".
-- It shows where each code leads inside the transaction, then undoes it all.
--
-- do $$ begin
--   raise notice 'dry run: blick -> @%, AMBROSE -> @%, ?ref=blick -> @%, tp -> @%, nobody_xyz -> %',
--     public.invite_handle_from('blick'), public.invite_handle_from('AMBROSE'),
--     public.invite_handle_from('https://courtsidebase.com/?ref=blick'), public.invite_handle_from('tp'),
--     public.invite_handle_from('nobody_xyz');
--   raise notice 'dry run: handle_status blick=%, ambrose=%', public.handle_status('blick'), public.handle_status('ambrose');
-- end $$;
-- rollback;

-- ------------------------------------------------- 8. checks to run afterwards
-- Read-only. Paste one at a time into the SQL editor (remove the leading "-- ").
--
-- (a) The codes and whose they are (expect ambrose -> ambrosehalexander, blick -> tblickalexander):
-- select c.code, p.handle from public.affiliate_codes c join public.profiles p on p.id = c.user_id order by 1;
--
-- (b) What "Invited by?" reads them as (expect tblickalexander, tblickalexander, ambrosehalexander, nobody_xyz):
-- select public.invite_handle_from('blick'), public.invite_handle_from(' @Blick '),
--        public.invite_handle_from('app.courtsidebase.com/join?ref=ambrose'), public.invite_handle_from('nobody_xyz');
--
-- (c) Nobody can take them as handles (expect taken, taken):
-- select public.handle_status('blick'), public.handle_status('ambrose');
--
-- (d) Only the server can use the codes; the app can still ask for its own
--     page (expect false, false, false, true):
-- select has_table_privilege('authenticated', 'public.affiliate_codes', 'select'),
--        has_function_privilege('authenticated', 'public.affiliate_code_owner(text)', 'execute'),
--        has_function_privilege('anon', 'public.invite_handle_from(text)', 'execute'),
--        has_function_privilege('authenticated', 'public.my_affiliate_stats()', 'execute');
