-- Approved coaches can be listed before Stripe payouts are set up, so the
-- Coaching tab shows real coaches from day one. Their page says booking
-- opens soon; the payments function still refuses a checkout until the
-- coach can actually be paid.
create or replace function public.guard_coach_columns()
returns trigger language plpgsql as $$
begin
  -- A signed-in person's request (the app). The server's own requests and
  -- Supabase's SQL editor have nobody signed in, and pass.
  if auth.uid() is not null and coalesce(current_setting('courtside.coach_system', true), '') <> 'on' then
    new.user_id := old.user_id;
    new.verified := old.verified;
    new.stripe_account_id := old.stripe_account_id;
    new.payouts_ready := old.payouts_ready;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
