-- An account can create its own profile row if the sign-up trigger did not,
-- and any account already missing one gets it now.

create policy "create your own profile" on public.profiles
  for insert with check (auth.uid() = id);

do $$
declare
  u record;
  wanted text;
  final text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    wanted := lower(coalesce(u.raw_user_meta_data ->> 'handle', split_part(coalesce(u.email, 'player'), '@', 1)));
    final := regexp_replace(wanted, '[^a-z0-9_]', '', 'g');
    if char_length(final) < 2 then final := 'player'; end if;
    final := left(final, 20);
    while exists (select 1 from public.profiles where handle = final) loop
      final := left(final, 18) || lpad((floor(random() * 100))::int::text, 2, '0');
    end loop;
    insert into public.profiles (id, handle, name)
    values (u.id, final, coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), initcap(replace(final, '_', ' '))));
  end loop;
end $$;
