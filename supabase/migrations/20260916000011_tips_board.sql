-- Tips become a board: everyone signed in can read them and vote them up or
-- down, so the most wanted ideas rise to the top.
alter table public.tips add column if not exists votes int not null default 0;
alter table public.tips add column if not exists voted_by jsonb not null default '{}'::jsonb;
drop policy if exists "your tips are yours" on public.tips;
drop policy if exists "tips are readable by players" on public.tips;
create policy "tips are readable by players" on public.tips for select using (auth.uid() is not null);

create or replace function public.vote_tip(t uuid, dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or dir not in (1, -1) then return; end if;
  select public.apply_vote(votes, voted_by, auth.uid(), dir) into r from public.tips where id = t;
  if r is null then return; end if;
  update public.tips set votes = (r ->> 'votes')::int, voted_by = r -> 'voted_by' where id = t;
end $$;
grant execute on function public.vote_tip(uuid, int) to authenticated;
