-- Coach applications, saved. Until now an application only lived on the
-- applicant's phone. Now it is filed here, with the résumé in private
-- storage, for the team to review.
--   Applicants can file their own and see its status; nothing else.
--   Nobody can read anyone else's application from the app.
--   Review them in Supabase: Table Editor → coach_applications, and the
--   résumés under Storage → coach-applications.

create table if not exists public.coach_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  utr text,
  ntrp text,
  years_coaching int not null default 0,
  certifications text not null default '',
  resume_path text,
  resume_name text,
  current_clients text not null default '',
  specialties text[] not null default '{}',
  reference_contacts text not null default '',
  about text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'in-review', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coach_applications_user_idx on public.coach_applications (user_id, created_at desc);
alter table public.coach_applications enable row level security;
drop policy if exists "apply as yourself" on public.coach_applications;
create policy "apply as yourself" on public.coach_applications for insert
  with check (auth.uid() = user_id and status = 'submitted' and review_note is null and reviewed_at is null);
drop policy if exists "see your own application" on public.coach_applications;
create policy "see your own application" on public.coach_applications for select using (auth.uid() = user_id);

-- Résumés: a private shelf. Each applicant can put files in, and read, only
-- their own folder; the files are never public.
insert into storage.buckets (id, name, public, file_size_limit)
values ('coach-applications', 'coach-applications', false, 10485760)
on conflict (id) do nothing;
drop policy if exists "upload your own résumé" on storage.objects;
create policy "upload your own résumé" on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-applications' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read your own résumé" on storage.objects;
create policy "read your own résumé" on storage.objects for select to authenticated
  using (bucket_id = 'coach-applications' and (storage.foldername(name))[1] = auth.uid()::text);
