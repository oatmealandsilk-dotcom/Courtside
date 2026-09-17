-- A comment may only go on something the commenter is allowed to see: a
-- private account's post or hit is closed to anyone it has not let follow.
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert
  with check (auth.uid() = author_id and public.can_view((select author_id from public.posts where id = post_id)));
drop policy if exists "comment on hits as yourself" on public.story_comments;
create policy "comment on hits as yourself" on public.story_comments for insert
  with check (auth.uid() = author_id and public.can_view((select author_id from public.stories where id = story_id)));
