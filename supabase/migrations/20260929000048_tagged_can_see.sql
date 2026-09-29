-- Someone tagged in a post can see that post, even when the author's account
-- is private and they don't follow it: being tagged is the author inviting
-- them to look. Everything else about who sees a post stays the same
-- (blocking still hides it both ways; removed posts stay hidden).
-- Safe to run more than once.
drop policy if exists "read live posts" on public.posts;
create policy "read live posts" on public.posts for select
  using ((not archived or auth.uid() = author_id)
    and (public.can_view(author_id) or auth.uid() = any(tagged_user_ids))
    and not public.blocked_with(author_id)
    and (removed_at is null or public.is_admin()));
