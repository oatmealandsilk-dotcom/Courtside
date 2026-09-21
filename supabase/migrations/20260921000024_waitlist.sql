-- The waitlist and the build log's feedback box.
--
-- The public page at /waitlist.html lets anyone leave their email for early
-- access to the iPhone app, and anyone send a note about the build. Both are
-- write-only for the public: a visitor can add a row but never read one back,
-- so the list cannot be scraped through the page's own key. Only admins (see
-- migration 23) can read or remove rows, from the Waitlist screen in the app.
--
-- Needs migration 23 (is_admin). Safe to run more than once.

-- ------------------------------------------------------------ waitlist
create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  -- Where they came from (?ref=reddit on the link), so it is clear which posts work.
  source     text,
  created_at timestamptz not null default now(),
  constraint waitlist_email_shape check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_name_length check (name is null or char_length(name) <= 80),
  constraint waitlist_source_length check (source is null or char_length(source) <= 40)
);
-- One place on the list per address, whatever its capitals.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;
drop policy if exists "anyone can join the waitlist" on public.waitlist;
create policy "anyone can join the waitlist" on public.waitlist for insert to anon, authenticated with check (true);
drop policy if exists "admins read the waitlist" on public.waitlist;
create policy "admins read the waitlist" on public.waitlist for select using (public.is_admin());
drop policy if exists "admins remove from the waitlist" on public.waitlist;
create policy "admins remove from the waitlist" on public.waitlist for delete using (public.is_admin());

-- ------------------------------------------------------------ feedback
create table if not exists public.site_feedback (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  email      text,
  created_at timestamptz not null default now(),
  constraint site_feedback_message_length check (char_length(btrim(message)) between 3 and 4000),
  constraint site_feedback_email_shape check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
);
create index if not exists site_feedback_created_idx on public.site_feedback (created_at desc);

alter table public.site_feedback enable row level security;
drop policy if exists "anyone can send feedback" on public.site_feedback;
create policy "anyone can send feedback" on public.site_feedback for insert to anon, authenticated with check (true);
drop policy if exists "admins read feedback" on public.site_feedback;
create policy "admins read feedback" on public.site_feedback for select using (public.is_admin());
drop policy if exists "admins remove feedback" on public.site_feedback;
create policy "admins remove feedback" on public.site_feedback for delete using (public.is_admin());

-- ------------------------------------------------------------ flood guard
-- A public form is a door anyone can lean on. Past a burst no real launch
-- produces, new rows are refused for a minute rather than filling the table.
create or replace function public.refuse_signup_flood()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recent int;
begin
  execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name) into recent;
  if recent >= 60 then
    raise exception 'too many signups, try again in a minute' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists refuse_signup_flood on public.waitlist;
create trigger refuse_signup_flood before insert on public.waitlist for each row execute function public.refuse_signup_flood();
drop trigger if exists refuse_signup_flood on public.site_feedback;
create trigger refuse_signup_flood before insert on public.site_feedback for each row execute function public.refuse_signup_flood();
