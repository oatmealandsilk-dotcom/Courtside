-- View counts were never landing: bump_post_views runs with the caller's
-- request role, so the counter guard on posts rejected its own update
-- ("counters are not editable"). The function now raises a flag for the
-- length of its own transaction, and the guard lets a flagged update through.
create or replace function public.guard_post_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce(current_setting('courtside.counter_ok', true), '') <> 'on' then
    if new.views <> old.views or new.shares <> old.shares then
      raise exception 'counters are not editable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is fixed';
    end if;
  end if;
  return new;
end $$;

create or replace function public.bump_post_views(post uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.post_views (post_id, user_id) values (post, auth.uid())
    on conflict do nothing;
  if found then
    perform set_config('courtside.counter_ok', 'on', true);
    update public.posts set views = views + 1 where id = post;
    perform set_config('courtside.counter_ok', 'off', true);
  end if;
end $$;
