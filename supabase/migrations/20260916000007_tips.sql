-- Tips from early users: what they would change or add. Each person sees
-- only their own; the team reads them all from the dashboard.
create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.tips enable row level security;
drop policy if exists "send a tip as yourself" on public.tips;
create policy "send a tip as yourself" on public.tips for insert with check (auth.uid() = user_id);
drop policy if exists "your tips are yours" on public.tips;
create policy "your tips are yours" on public.tips for select using (auth.uid() = user_id);
