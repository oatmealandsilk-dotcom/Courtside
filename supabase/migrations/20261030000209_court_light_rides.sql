-- CourtSide · migration 20261030000209: Up to hit off, or Location off, leaves your court light on.
--
-- Owner, Oct 30: "Turing up to hit off should not, it should let whatever you put
-- previously ride until it's gone" and "Turning off location turns the court light off
-- when it should not". check_out_of_map (Up to hit off, migration 191) and
-- forget_last_seen (Location off) also deleted your "I'm playing here" check-in, so the
-- court you lit went dark. Now both take you off the map as before (your spot, your pin;
-- Location off still forgets your places too) and leave the court check-in to run out at
-- the time you chose. "I'm done" on the court still ends it (check_out_of_court), and so
-- does signing out (the app calls check_out_of_court there itself).
--
-- What changes, and nothing else: neither function deletes from court_checkins.
-- Same signatures, same grants.
--
-- All-or-nothing; safe to run twice. Undo: supabase/rollback/209_undo.sql.

begin;

do $$
begin
  -- As migration 191 / the live ones left them (or as this file makes them: a re-run).
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.check_out_of_map()')
                 and (md5(p.prosrc) = 'a04ca088654da224f481252d6a1b28c7'
                      or p.prosrc = E'\n  update public.exact_spots set lat = null, lng = null, court_id = null, cells = ''[]''::jsonb where user_id = auth.uid();\n  delete from public.last_seen where user_id = auth.uid();\n')) then
    raise exception 'Migration 209 stopped before changing anything: check_out_of_map changed since 191. Ask Claude to look.';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.forget_last_seen()')
                 and (md5(p.prosrc) = 'a8db275c685eb5db66f8bcc3b0361973' or p.prosrc not like '%court_checkins%')) then
    raise exception 'Migration 209 stopped before changing anything: forget_last_seen changed. Ask Claude to look.';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.check_out_of_map()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.exact_spots set lat = null, lng = null, court_id = null, cells = '[]'::jsonb where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
$function$;
revoke all on function public.check_out_of_map() from public, anon;
grant execute on function public.check_out_of_map() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.forget_last_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.exact_spots where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_visits where user_id = auth.uid();
  update public.map_anchors set lat = null, lng = null where user_id = auth.uid();
$function$;
revoke all on function public.forget_last_seen() from public, anon;
grant execute on function public.forget_last_seen() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_proc p where p.oid in (to_regprocedure('public.check_out_of_map()'), to_regprocedure('public.forget_last_seen()')) and p.prosrc like '%court_checkins%')
     or not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.forget_last_seen()') and p.prosrc like '%court_visits%' and p.prosrc like '%exact_spots%' and p.prosrc like '%map_anchors%')
     or not has_function_privilege('authenticated', 'public.check_out_of_map()', 'execute')
     or has_function_privilege('anon', 'public.check_out_of_map()', 'execute')
     or not has_function_privilege('authenticated', 'public.forget_last_seen()', 'execute')
     or has_function_privilege('anon', 'public.forget_last_seen()', 'execute') then
    raise exception 'Migration 209 did not come out as written. Nothing changed.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
