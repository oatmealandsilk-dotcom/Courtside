-- What you have reported, so a reported post or hit stays hidden for you on
-- every device (Oct 3). Only your own report targets; nothing else about them.
create or replace function public.my_reported_targets()
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct target from public.reports
  where reporter_id = auth.uid() and target ~ '^(post|hit):';
$$;
revoke all on function public.my_reported_targets() from public, anon;
grant execute on function public.my_reported_targets() to authenticated;
