-- What the coach works around stays yours.
--
-- The setup quiz asks what a coach should work around: an injury, a busy
-- schedule, gear. Those notes used to sit on the public profile, where
-- anyone (even someone signed out) could read them. From here on they live
-- in your private settings row, which only you can read; the public profile
-- keeps your level, play style, surface, fitness and goals as before.
--
-- The app keeps saving the whole quiz to the profile as it always has; the
-- database takes the notes out on the way in and files them privately, so
-- no version of the app, old or new, can put them back in public.
-- Needs migration 08 (user_state). Safe to run more than once.

alter table public.user_state add column if not exists private_profile jsonb not null default '{}'::jsonb;

create or replace function public.keep_constraints_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile ? 'constraints' then
    -- A new profile row has nothing to move yet (and no settings row can
    -- point at it until it exists); an edit files the notes privately.
    if tg_op = 'UPDATE' then
      insert into public.user_state (user_id, private_profile)
        values (new.id, jsonb_build_object('constraints', coalesce(new.profile -> 'constraints', '[]'::jsonb)))
        on conflict (user_id) do update set private_profile = public.user_state.private_profile || excluded.private_profile;
    end if;
    new.profile := new.profile - 'constraints';
  end if;
  return new;
end $$;
drop trigger if exists keep_constraints_private on public.profiles;
create trigger keep_constraints_private before insert or update on public.profiles
  for each row execute function public.keep_constraints_private();

-- Move the notes already on public profiles into their owners' private rows.
update public.profiles set profile = profile where profile ? 'constraints';
