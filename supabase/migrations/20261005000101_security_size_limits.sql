-- CourtSide · migration 101: size limits on the fields that had none, and a
-- brake on crash reports (security review, Oct 5).
--
-- 1. Picture and video addresses, a post's place, and a few others had no
--    length limit. Every app open downloads every profile, so one player
--    could put a 10 MB "photo address" on their profile and every phone would
--    download it on every launch: slow or crashing app opens for everyone,
--    and a bigger Supabase bill for the traffic. The database accepted 9.6 MB
--    in a test. Now each has a generous limit far above anything real (the
--    longest address today is 151 characters; the limit is 2,000).
--
-- 2. Crash reports can be filed without signing in (so a crash on the sign-in
--    screen still reaches us), but three of their fields had no length limit
--    and there was no limit on how many could arrive. A script could fill the
--    database (a single 3 MB report was accepted in a test) and bury real
--    crashes. Now those fields are capped (the longest today is 23
--    characters; the cap is 200) and at most 120 reports a minute are taken
--    from everyone together, 20 a minute from one signed-in player. The
--    busiest real minute so far had 2.
--
-- The limits are checked on everything written from now on; rows already
-- there are not re-checked (none is anywhere near them). Nothing changes for
-- anyone using the app. Safe to run more than once.

-- -------------------------------------------------------------- 1. lengths
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('profiles',  'avatar_url',    'char_length(avatar_url) <= 2000'),
      ('posts',     'image_url',     'char_length(image_url) <= 2000'),
      ('posts',     'video_url',     'char_length(video_url) <= 2000'),
      ('posts',     'thumbnail_url', 'char_length(thumbnail_url) <= 2000'),
      ('posts',     'location',      'char_length(location) <= 300'),
      ('posts',     'media_label',   'char_length(media_label) <= 300'),
      ('posts',     'court_name',    'char_length(court_name) <= 300'),
      ('posts',     'crop',          'pg_column_size(crop) <= 4000'),
      ('posts',     'match',         'pg_column_size(match) <= 20000'),
      ('stories',   'image_url',     'char_length(image_url) <= 2000'),
      ('stories',   'video_url',     'char_length(video_url) <= 2000'),
      ('stories',   'thumbnail_url', 'char_length(thumbnail_url) <= 2000'),
      ('stories',   'media_label',   'char_length(media_label) <= 300'),
      ('comments',  'image_url',     'char_length(image_url) <= 2000'),
      ('answers',   'media_url',     'char_length(media_url) <= 2000'),
      ('answers',   'media_thumb',   'char_length(media_thumb) <= 2000'),
      ('messages',  'audio_url',     'char_length(audio_url) <= 2000'),
      ('app_errors','screen',        'char_length(screen) <= 200'),
      ('app_errors','platform',      'char_length(platform) <= 200'),
      ('app_errors','app_version',   'char_length(app_version) <= 200')
    ) as t(tbl, col, rule)
  loop
    -- Only where the column exists (a few came with later migrations).
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = c.tbl and column_name = c.col) then
      execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.tbl || '_' || c.col || '_size');
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.tbl || '_' || c.col || '_size', c.rule);
    end if;
  end loop;
end $$;

-- --------------------------------------------------------- 2. crash report brake
create or replace function public.limit_crash_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.app_errors where created_at > now() - interval '1 minute') >= 120 then
    raise exception 'slow down' using errcode = '54000';
  end if;
  if auth.uid() is not null and (
    select count(*) from public.app_errors where user_id = auth.uid() and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'slow down' using errcode = '54000';
  end if;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists limit_crash_reports on public.app_errors;
create trigger limit_crash_reports before insert on public.app_errors
  for each row execute function public.limit_crash_reports();

create index if not exists app_errors_created_at on public.app_errors (created_at);

-- Checks after running:
-- (a) the new limits (expect 20 rows, or fewer if some columns are not there yet):
--   select conrelid::regclass, conname from pg_constraint where conname like '%\_size' and connamespace = 'public'::regnamespace;
-- (b) the brake (expect one row):
--   select tgname from pg_trigger where tgrelid = 'public.app_errors'::regclass and tgname = 'limit_crash_reports';
