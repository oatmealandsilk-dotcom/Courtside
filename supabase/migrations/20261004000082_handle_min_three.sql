-- New handles are at least 3 characters (Oct 4, owner). Existing short ones
-- (tp, dt) keep working everywhere: mentions, invite codes and links still
-- read 2-letter handles, and the column's own check is left at 2.
CREATE OR REPLACE FUNCTION public.change_handle(p_handle text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  wanted text := lower(trim(coalesce(p_handle, '')));
  current_handle text;
  last_change timestamptz;
  status text;
begin
  if me is null then raise exception 'sign in first'; end if;
  select handle, handle_changed_at into current_handle, last_change from public.profiles where id = me for update;
  if current_handle is null then raise exception 'no profile'; end if;
  if wanted = current_handle then return current_handle; end if;
  -- Admins (the owner's own accounts) may change their handle any time (owner, Oct 3): only these two.
  if last_change is not null and last_change > now() - interval '30 days'
     and me not in ('a908b335-fe34-4e4f-817b-ede312b446d7'::uuid, '10003ea6-a862-4860-b4b9-47ab5d427497'::uuid) then
    raise exception 'You can change your handle again on %.', to_char(last_change + interval '30 days', 'FMMonth FMDD');
  end if;
  status := public.handle_status(wanted);
  if status = 'invalid' then raise exception 'Use 3 to 24 letters, numbers or underscores.'; end if;
  if status = 'taken' then raise exception '@% is taken.', wanted; end if;
  if status = 'held' then raise exception '@% was just let go by someone, so it is held for a couple of weeks.', wanted; end if;

  insert into public.handle_history (handle, user_id) values (current_handle, me);
  perform set_config('courtside.handle_change', 'on', true);
  update public.profiles set handle = wanted, handle_changed_at = now() where id = me;
  perform set_config('courtside.handle_change', 'off', true);
  return wanted;
end $function$;

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
  if wanted !~ '^[a-z0-9_]{3,24}$' then return 'invalid'; end if;
  select id into owner from public.profiles where handle = wanted;
  if owner is not null then
    return case when owner = me then 'yours' else 'taken' end;
  end if;
  if exists (
    select 1 from public.handle_history
    where handle = wanted and released_at > now() - interval '14 days' and user_id is distinct from me
  ) then
    return 'held';
  end if;
  return 'ok';
end $function$;
