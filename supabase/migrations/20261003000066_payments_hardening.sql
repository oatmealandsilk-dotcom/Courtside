-- Payments, made safe for the move from Stripe's test mode to real money.
-- Safe to run more than once.
--
-- What changes:
--   * Each coach's Stripe account remembers whether it was made in test mode
--     or live mode, so a test account is never used once real keys are in.
--   * A booking can be marked as disputed (the player asked their bank for the
--     money back). A disputed booking can't be answered until it is settled.
--   * A suspended coach can't be booked, can't list themselves again, and
--     drops out of the Coaching tab for everyone else.
--
-- ONE-TIME STEP when switching STRIPE_SECRET_KEY from sk_test_ to sk_live_
-- (run in Supabase's SQL editor, right at the switch; it is not run here):
--
--   -- coaches set up payouts again, with real Stripe accounts
--   update public.coaches set stripe_account_id = null, payouts_ready = false;
--   -- test bookings are not real money; take them out of everyone's lists
--   delete from public.coaching_requests where stripe_session_id is not null;
--
-- The payments function already ignores test-mode accounts and test-mode
-- webhook secrets under a live key, so this step is tidying, not a must.

-- ------------------------------------------------------------------ coaches
alter table public.coaches add column if not exists stripe_livemode boolean;

-- Is this person suspended? Asked from policies, where the reader may not be
-- allowed to see profiles.suspended_at themselves.
create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and suspended_at is not null);
$$;
revoke all on function public.is_suspended(uuid) from public;
grant execute on function public.is_suspended(uuid) to anon, authenticated;

drop policy if exists "listed coaches are public" on public.coaches;
create policy "listed coaches are public" on public.coaches for select
  using ((listed and not public.is_suspended(user_id)) or user_id = auth.uid() or public.is_admin());

-- The money and trust columns move only on the server, as before (migration
-- 38), now including which Stripe mode the account belongs to. A suspended
-- coach can't switch their listing back on.
create or replace function public.guard_coach_columns()
returns trigger language plpgsql as $$
begin
  -- A signed-in person's request (the app). The server's own requests and
  -- Supabase's SQL editor have nobody signed in, and pass.
  if auth.uid() is not null and coalesce(current_setting('courtside.coach_system', true), '') <> 'on' then
    new.user_id := old.user_id;
    new.verified := old.verified;
    new.stripe_account_id := old.stripe_account_id;
    new.stripe_livemode := old.stripe_livemode;
    new.payouts_ready := old.payouts_ready;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.created_at := old.created_at;
    if new.listed and not old.listed and public.is_suspended(old.user_id) then new.listed := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_coach_columns on public.coaches;
create trigger guard_coach_columns before update on public.coaches
  for each row execute function public.guard_coach_columns();

-- ---------------------------------------------------------------- requests
alter table public.coaching_requests add column if not exists disputed_at timestamptz;
create index if not exists coaching_requests_payment_intent_idx on public.coaching_requests (payment_intent_id) where payment_intent_id is not null;

-- A coach answers a paid request sent to them, as before, but not one that
-- was refunded or is being disputed with the player's bank.
create or replace function public.answer_coaching_request(p_request uuid, p_response text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.coaching_requests;
  words text := btrim(coalesce(p_response, ''));
begin
  select * into r from public.coaching_requests where id = p_request for update;
  if r.id is null or r.coach_user_id is distinct from auth.uid() then raise exception 'not your request'; end if;
  if r.paid_at is null or r.refunded_at is not null or r.disputed_at is not null then raise exception 'This request is not open.'; end if;
  if char_length(words) < 2 then raise exception 'Write an answer first.'; end if;
  if char_length(words) > 8000 then raise exception 'Keep the answer under 8,000 characters.'; end if;
  update public.coaching_requests set response = words, responded_at = now(), status = 'answered' where id = p_request;
  perform public.file_notification(r.user_id, r.coach_user_id, 'coach-answer', r.id::text, 'coaching-request', words, false);
end $$;
revoke all on function public.answer_coaching_request(uuid, text) from public;
grant execute on function public.answer_coaching_request(uuid, text) to authenticated;
