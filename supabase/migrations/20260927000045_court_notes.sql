-- Court details on the map: what players say about a public court, one
-- report per player per court (saving again replaces your own). A court is
-- known by its OpenStreetMap id ("way123456"), the same one the map uses.
create table if not exists public.court_notes (
  court_id text not null check (court_id ~ '^(node|way|relation)[0-9]{1,15}$'),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  lights boolean,
  surface text check (surface in ('hard', 'clay', 'grass', 'other')),
  nets text check (nets in ('good', 'worn', 'missing')),
  busy text check (busy in ('quiet', 'wait', 'busy')),
  photo_url text check (photo_url is null or (photo_url like 'https://%' and char_length(photo_url) <= 600)),
  note text check (note is null or char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (court_id, user_id)
);
create index if not exists court_notes_court_idx on public.court_notes (court_id, updated_at desc);

alter table public.court_notes enable row level security;
drop policy if exists "court notes are public" on public.court_notes;
create policy "court notes are public" on public.court_notes for select using (not public.blocked_with(user_id));
drop policy if exists "players write their own court notes" on public.court_notes;
create policy "players write their own court notes" on public.court_notes for insert with check (auth.uid() = user_id);
drop policy if exists "players change their own court notes" on public.court_notes;
create policy "players change their own court notes" on public.court_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "players remove their own court notes" on public.court_notes;
create policy "players remove their own court notes" on public.court_notes for delete using (auth.uid() = user_id);

-- The time is the database's, not the phone's.
create or replace function public.stamp_court_note()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists stamp_court_note on public.court_notes;
create trigger stamp_court_note before insert or update on public.court_notes
  for each row execute function public.stamp_court_note();
