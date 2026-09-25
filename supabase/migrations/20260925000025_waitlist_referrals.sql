-- Your place in line, and a link that moves you up it.
--
-- The page can add a row to the waitlist but never read one back (migration
-- 24), which is right for the emails but leaves it unable to answer the two
-- things a person wants to know the moment they join: what number they are,
-- and how to get further up. These two functions answer exactly that and
-- nothing else. They run with the table's owner's rights, so they can count
-- rows the caller cannot see — and they hand back only a number and a code.
--
-- Order in line: most friends brought first, then earliest to join. A code is
-- the first eight characters of the row's id; a friend who signs up through
-- ?r=<code> is stored against it in referred_by. Nobody is credited for a row
-- that already existed, so re-entering your own email through your own link
-- does nothing.
--
-- Needs migration 24. Safe to run more than once.

alter table public.waitlist add column if not exists referred_by text;
alter table public.waitlist drop constraint if exists waitlist_referred_by_shape;
alter table public.waitlist add constraint waitlist_referred_by_shape
  check (referred_by is null or referred_by ~ '^[0-9a-f]{8}$');
create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by) where referred_by is not null;

-- How many are on the list. The page shows this once it is a number worth showing.
create or replace function public.waitlist_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.waitlist;
$$;
revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon, authenticated;

-- Join (or find yourself already there), and learn your place and your code.
-- ("place", not "position": that one is a word Postgres keeps for itself.)
create or replace function public.join_waitlist(p_email text, p_name text default null, p_source text default null, p_referred_by text default null)
returns table (place integer, code text, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_already boolean := false;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'that does not look like an email' using errcode = '22023';
  end if;
  p_name := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  p_source := nullif(left(regexp_replace(lower(coalesce(p_source, '')), '[^a-z0-9_-]', '', 'g'), 40), '');
  p_referred_by := nullif(regexp_replace(lower(coalesce(p_referred_by, '')), '[^0-9a-f]', '', 'g'), '');
  if p_referred_by is not null and char_length(p_referred_by) <> 8 then p_referred_by := null; end if;
  -- Only a code that belongs to someone counts; a made-up one is dropped.
  if p_referred_by is not null and not exists (
    select 1 from public.waitlist w where left(replace(w.id::text, '-', ''), 8) = p_referred_by
  ) then p_referred_by := null; end if;

  -- The flood trigger from migration 24 still guards this insert.
  insert into public.waitlist (email, name, source, referred_by)
  values (v_email, p_name, p_source, p_referred_by)
  on conflict (lower(email)) do nothing
  returning id into v_id;

  if v_id is null then
    select w.id into v_id from public.waitlist w where lower(w.email) = v_email;
    v_already := true;
  end if;

  return query
    with brought as (
      select w.referred_by as ref, count(*) as n
      from public.waitlist w where w.referred_by is not null group by w.referred_by
    ),
    ranked as (
      select w.id,
             row_number() over (order by coalesce(b.n, 0) desc, w.created_at asc, w.id asc) as pos
      from public.waitlist w
      left join brought b on b.ref = left(replace(w.id::text, '-', ''), 8)
    )
    select r.pos::integer, left(replace(v_id::text, '-', ''), 8), v_already
    from ranked r where r.id = v_id;
end $$;
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon, authenticated;
