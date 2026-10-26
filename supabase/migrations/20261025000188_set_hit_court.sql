-- CourtSide · migration 20261025000188: "Set court" on a flexible hit.
--
-- NOT APPLIED — run it in the Supabase SQL editor as one piece. All-or-nothing:
-- if a check fails, it stops and nothing at all changes. Safe to run more
-- than once. Undo: supabase/rollback/188_undo.sql.
--
-- What it is for (the owner, Oct 25: "Flexible is good add set court
-- button"). A hit posted as "Flexible" (no court yet, migration 187) gets a
-- "Set court" button for the person who posted it. Picking a court turns it
-- into a normal hit at that court: it goes on the map and the court's page
-- like any other.
--
-- One new function, set_hit_court(hit, court). Only the hit's poster can use
-- it, only on their own flexible hit that is still on (not called off, not
-- more than an hour past its start), and only once (after that it has a
-- court and is not flexible any more). It:
--   1. builds the new place from scratch: the court's name (1 to 120
--      characters), its map id and its lat/lng (both or neither, in range);
--      nothing else the app sends is kept. The guard_hit_place trigger (187)
--      then strips any flexible/near/area, as for every non-flexible place;
--   2. when the hit already has a chat still called by its old name
--      ("Hit · Court flexible · near Cary"), renames it "Hit · <court>" and
--      writes the usual line in it ("Robert named the group …"), so who's in
--      sees where. A chat someone renamed by hand keeps its name. If the
--      rename or its line cannot be written (its words refused, a limit), the
--      court is still set.
--
-- Nothing else changes: no table, no policy, no trigger. The poster could
-- already change their hit's place under "change your own hit" (migration
-- 43); this function does it in one step with the chat's name, and refuses
-- anyone else, a hit called off, or one that already has a court.
--
-- ------------------------------------------------------------- HOW TO RUN IT
-- Supabase -> SQL Editor -> New query, paste this whole file, press Run.
-- "Success. No rows returned" means it is in. Anything else: nothing was
-- changed; the message says why.

begin;

-- ------------------------------------------------------------------ 0. checks
do $$
begin
  if to_regclass('public.hit_requests') is null or to_regclass('public.conversations') is null then
    raise exception 'Migration 188 stopped before changing anything: hit_requests (43) and conversations have to be there first.';
  end if;
  if to_regprocedure('public.guard_hit_place()') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.hit_requests'::regclass and tgname = 'guard_hit_place' and not tgisinternal) then
    raise exception 'Migration 188 stopped before changing anything: it needs migration 187 (Flexible hits) first.';
  end if;
  if to_regprocedure('public.is_suspended(uuid)') is null
     or to_regprocedure('public.clean_chat_title(text)') is null
     or to_regprocedure('public.post_group_event(uuid, uuid, text, uuid[], text, boolean)') is null then
    raise exception 'Migration 188 stopped before changing anything: it needs is_suspended (95), clean_chat_title and post_group_event (54).';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_hit_court'
             and position('set_hit_court_188' in p.prosrc) = 0) then
    raise exception 'Migration 188 stopped before changing anything: set_hit_court already exists and is not this file''s.';
  end if;
end $$;

-- ------------------------------------------------------------ 1. set_hit_court
create or replace function public.set_hit_court(hit uuid, court jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  -- set_hit_court_188
  me uuid := auth.uid();
  h public.hit_requests;
  nm text;
  la double precision;
  lg double precision;
  cid text;
  clean jsonb;
  chat_title text;
  new_title text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.is_suspended(me) then raise exception 'suspended'; end if;
  select * into h from public.hit_requests where id = hit for update;
  if not found or h.author_id <> me then raise exception 'not_yours'; end if;
  if h.cancelled or h.starts_at < now() - interval '1 hour' then raise exception 'That hit is no longer on.'; end if;
  if coalesce(h.place->>'flexible', '') <> 'true' then raise exception 'That hit already has a court.'; end if;

  -- The court, from scratch.
  if court is null or jsonb_typeof(court) <> 'object' then raise exception 'bad_court'; end if;
  nm := btrim(left(btrim(regexp_replace(coalesce(court->>'name', ''), '\s+', ' ', 'g')), 120));
  if nm = '' then raise exception 'bad_court'; end if;
  if jsonb_typeof(court->'lat') = 'number' and jsonb_typeof(court->'lng') = 'number' then
    la := (court->>'lat')::double precision;
    lg := (court->>'lng')::double precision;
    if la not between -90 and 90 or lg not between -180 and 180 then raise exception 'bad_court'; end if;
  elsif coalesce(jsonb_typeof(court->'lat'), 'null') <> 'null' or coalesce(jsonb_typeof(court->'lng'), 'null') <> 'null' then
    raise exception 'bad_court';
  end if;
  -- A map court's id (node123, way123, relation123), kept only with its spot.
  if la is not null and jsonb_typeof(court->'id') = 'string' and (court->>'id') ~ '^(node|way|relation)[0-9]{1,15}$' then
    cid := court->>'id';
  end if;
  clean := jsonb_build_object('name', nm)
    || case when cid is not null then jsonb_build_object('id', cid) else '{}'::jsonb end
    || case when la is not null then jsonb_build_object('lat', la, 'lng', lg) else '{}'::jsonb end;
  update public.hit_requests set place = clean where id = hit;

  -- The hit's chat, still called by its old name: called by the court now.
  if h.conversation_id is not null then
    begin
      select c.title into chat_title from public.conversations c where c.id = h.conversation_id and c.is_group for update;
      if found and public.clean_chat_title(chat_title) is not distinct from
           public.clean_chat_title('Hit ' || chr(183) || ' ' || coalesce(h.place->>'name', 'Court')) then
        new_title := public.clean_chat_title('Hit ' || chr(183) || ' ' || nm);
        update public.conversations set title = new_title where id = h.conversation_id;
        begin
          perform public.post_group_event(h.conversation_id, me, 'renamed', '{}', new_title);
        exception when others then
          raise warning 'set_hit_court: no line in chat %: %', h.conversation_id, sqlerrm;
        end;
      end if;
    exception when others then
      raise warning 'set_hit_court: chat % kept its name: %', h.conversation_id, sqlerrm;
    end;
  end if;
end $$;
revoke all on function public.set_hit_court(uuid, jsonb) from public, anon;
grant execute on function public.set_hit_court(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------ 2. after-checks
do $$
begin
  if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_hit_court'
                 and p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public']
                 and position('set_hit_court_188' in p.prosrc) > 0) then
    raise exception 'Migration 188 stopped: set_hit_court is not SECURITY DEFINER with its search_path. Nothing was changed.';
  end if;
  if has_function_privilege('anon', 'public.set_hit_court(uuid, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_hit_court(uuid, jsonb)', 'execute') then
    raise exception 'Migration 188 stopped: set_hit_court has the wrong grants. Nothing was changed.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hit_requests'::regclass) then
    raise exception 'Migration 188 stopped: row level security is off on hit_requests. Nothing was changed.';
  end if;
end $$;

commit;

-- ------------------------------------------------------- 3. checks to run afterwards
-- Read-only. Paste into the SQL editor (remove the leading "-- ").
--
-- (a) It is in (expect true, false, true):
-- select exists (select 1 from pg_proc where proname = 'set_hit_court') as is_in,
--        has_function_privilege('anon', 'public.set_hit_court(uuid, jsonb)', 'execute') as anon_can,
--        has_function_privilege('authenticated', 'public.set_hit_court(uuid, jsonb)', 'execute') as players_can;
