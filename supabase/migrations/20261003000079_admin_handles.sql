-- Migration 79 (Oct 3): the owner's two accounts are admins, and those two
-- accounts only may change their handle any time (everyone else, admins
-- included: once every 30 days, as migration 34 says).
-- Re-runnable. Stops without changing anything if change_handle moved since 34.
begin;
do $$
begin
  if md5(pg_get_functiondef('public.change_handle(text)'::regprocedure)) not in ('c18984248bc8177e496deecc703806f6')
     and position('Admins (the owner' in pg_get_functiondef('public.change_handle(text)'::regprocedure)) = 0 then
    raise exception 'change_handle changed since migration 34; update migration 79 first';
  end if;
end $$;

-- 4. The change itself. Returns the new handle, or raises a plain-English reason.
create or replace function public.change_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
  if status = 'invalid' then raise exception 'Use 2 to 24 letters, numbers or underscores.'; end if;
  if status = 'taken' then raise exception '@% is taken.', wanted; end if;
  if status = 'held' then raise exception '@% was just let go by someone, so it is held for a couple of weeks.', wanted; end if;

  insert into public.handle_history (handle, user_id) values (current_handle, me);
  perform set_config('courtside.handle_change', 'on', true);
  update public.profiles set handle = wanted, handle_changed_at = now() where id = me;
  perform set_config('courtside.handle_change', 'off', true);
  return wanted;
end $$;
revoke all on function public.change_handle(text) from public;
grant execute on function public.change_handle(text) to authenticated;
-- Both of the owner's accounts.
update public.profiles set is_admin = true where id in ('a908b335-fe34-4e4f-817b-ede312b446d7', '10003ea6-a862-4860-b4b9-47ab5d427497') and not is_admin;
commit;
