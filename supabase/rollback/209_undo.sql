-- Undo migration 209: Up to hit off and Location off end your court light again (as before).
begin;
CREATE OR REPLACE FUNCTION public.check_out_of_map()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.exact_spots set lat = null, lng = null, court_id = null, cells = '[]'::jsonb where user_id = auth.uid();
  delete from public.last_seen where user_id = auth.uid();
  delete from public.court_checkins where user_id = auth.uid();
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
  delete from public.court_checkins where user_id = auth.uid();
  delete from public.court_visits where user_id = auth.uid();
  update public.map_anchors set lat = null, lng = null where user_id = auth.uid();
$function$;
revoke all on function public.forget_last_seen() from public, anon;
grant execute on function public.forget_last_seen() to authenticated, service_role;
commit;
notify pgrst, 'reload schema';
