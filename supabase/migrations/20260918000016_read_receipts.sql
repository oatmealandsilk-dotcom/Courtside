-- Read receipts that work between people.
--   The "Read receipts" switch is kept with the account (it used to live
--   only on your own phone), so everyone's app respects it: with it off,
--   nobody sees "Read" under the messages they send you.
--   "Read" now appears live: when someone opens a chat, the other person's
--   phone hears about it straight away instead of on the next refresh.

alter table public.profiles add column if not exists read_receipts boolean not null default true;

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;
