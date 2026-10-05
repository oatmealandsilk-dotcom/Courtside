-- CourtSide · migration 87: you can delete your own thread reply (Oct 4, owner).
-- Hold a reply you wrote, then Delete. Replies under it stay and move up a
-- level. If it was the thread's accepted answer, the thread goes back to
-- having none. Safe to run more than once.

drop policy if exists "delete your own answer" on public.answers;
create policy "delete your own answer" on public.answers for delete using (auth.uid() = author_id);
grant delete on public.answers to authenticated;

create or replace function public.clear_accepted_answer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.questions set accepted_answer_id = null where accepted_answer_id = old.id;
  return old;
end $$;
revoke all on function public.clear_accepted_answer() from public, anon, authenticated;
drop trigger if exists clear_accepted_answer on public.answers;
create trigger clear_accepted_answer after delete on public.answers
  for each row execute function public.clear_accepted_answer();
