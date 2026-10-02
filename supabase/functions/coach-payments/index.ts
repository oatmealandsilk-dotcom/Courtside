// CourtSide coach payments — a Supabase Edge Function, with Stripe Connect.
//
// Players pay through Stripe Checkout; the money goes to the coach's own
// Stripe account, less CourtSide's platform fee (which is where Stripe's own
// card fee comes out). The app never sees card details or the Stripe key.
// Jobs, by `mode`:
//   status        — is Stripe set up? (no sign-in needed; free)
//   connect       — (coach) start or finish payout setup; returns Stripe's page
//   connect-check — (coach) ask Stripe whether payouts are ready, and save it
//   dashboard     — (coach) a link to their own Stripe dashboard
//   checkout      — (player) price a request and return Stripe's pay page
//   confirm       — (player) check a request's payment with Stripe directly
//   refund        — coach declines, player past the deadline, or admin
//   admin-status  — (admin) what is set up
//   setup-webhook — (admin) point Stripe's notifications at `stripe-webhook`
// And GET /return: where Stripe sends the browser after paying or onboarding.
//
// While the key is a test key (sk_test_…), only admins can use payments, so
// real coaches and players never get caught in Stripe's pretend money.
//
// Deploy:   npx supabase functions deploy coach-payments --no-verify-jwt
// Secrets:  STRIPE_SECRET_KEY (sk_test_… first, sk_live_… when going live),
//           optional PLATFORM_FEE_PERCENT (default 15; 0 means no fee),
//           optional ALLOW_DEV_RETURN=1 while testing in Expo Go (remove before going live).
import {
  accountReady, admin, FEE_PERCENT, isMissing, LIVE, markPaid, STRIPE_KEY, stripe, SUPABASE_URL, WEBHOOK_SLOT, webhookSecret,
} from '../_shared/coaching.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const SELF = `${SUPABASE_URL}/functions/v1/coach-payments`;
/** The only places a browser is ever sent back to: the app or the web app. Expo Go and localhost only while ALLOW_DEV_RETURN is set. */
const DEV_RETURN = Deno.env.get('ALLOW_DEV_RETURN') === '1';
const safeBack = (back: string | null | undefined, fallback: string) => {
  if (!back) return fallback;
  if (/^(courtside:\/\/|https:\/\/app\.courtsidebase\.com\/)/.test(back)) return back;
  if (DEV_RETURN && /^(exps?:\/\/[a-z0-9-]+\.exp\.direct\/|exps?:\/\/(localhost|\d{1,3}(\.\d{1,3}){3}):\d+\/|http:\/\/localhost:\d+\/)/.test(back)) return back;
  return fallback;
};
const withQuery = (base: string, q: Record<string, string>) => `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(q)}`;
const KIND: Record<string, string> = { 'video-review': 'Video review', 'written-qa': 'Written answer', 'live-session': 'Live session', plan: 'Training plan' };
const intentOf = (s: { payment_intent?: string | { id: string } | null }) => (typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null);
/** Shown on Stripe's pay page, next to the Pay button, so the refund rules are seen before paying. */
const PAY_NOTE = 'Once your coach answers, the booking is complete. If they miss the deadline you can have your money back in the app. Questions or problems: support@courtsidebase.com. CourtSide Terms of Use apply.';

async function whoIs(req: Request) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return null;
  const { data } = await admin.auth.getUser(bearer);
  return data.user ?? null;
}
const isAdmin = async (uid: string) => !!(await admin.from('profiles').select('is_admin').eq('id', uid).maybeSingle()).data?.is_admin;
/** A coach's Stripe account that Stripe doesn't know under this key (a test account after going live): forget it, so they set up again. */
const forgetAccount = (coachId: string) =>
  admin.from('coaches').update({ stripe_account_id: null, stripe_livemode: null, payouts_ready: false }).eq('id', coachId);

class Plain extends Error { constructor(message: string, public status = 400) { super(message); } }
const CLOSED = 'This coach is not taking bookings right now.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  // Stripe sends the browser here after a payment or after payout setup.
  if (req.method === 'GET' && url.pathname.endsWith('/return')) {
    const back = safeBack(url.searchParams.get('back'), 'courtside://coaches');
    const sessionId = url.searchParams.get('session_id');
    const q: Record<string, string> = {};
    if (sessionId && STRIPE_KEY) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const requestId = session.metadata?.request_id ?? '';
        if (session.payment_status === 'paid' && requestId) {
          if ((await markPaid(requestId, intentOf(session))) !== 'missing') q.paid = '1';
        }
        if (requestId) q.request = requestId;
      } catch (e) { console.error('[coach-payments] return', e); }
    }
    // The booking's id also rides along on its own, so the app knows which
    // booking to check even when the Stripe lookup above failed.
    for (const k of ['stripe', 'cancelled', 'request']) { const v = url.searchParams.get(k); if (v && !q[k]) q[k] = v; }
    return Response.redirect(Object.keys(q).length ? withQuery(back, q) : back, 302);
  }

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const mode = String(body.mode ?? '');
    if (mode === 'status') {
      if (!STRIPE_KEY) return json({ on: false, feePercent: FEE_PERCENT });
      if (LIVE) return json({ on: true, test: false, feePercent: FEE_PERCENT });
      // A test key: payments are on for admins only, who are trying it out.
      const who = await whoIs(req);
      return json({ on: !!who && (await isAdmin(who.id)), test: true, feePercent: FEE_PERCENT });
    }

    const user = await whoIs(req);
    if (!user) return json({ error: 'Sign in first.' }, 401);
    if (!STRIPE_KEY) return json({ error: 'Payments are not switched on yet.', off: true }, 503);
    if (!LIVE && mode !== 'admin-status' && mode !== 'setup-webhook' && !(await isAdmin(user.id))) {
      throw new Plain('Payments are being tested. Booking opens soon.', 503);
    }
    const back = (fallback: string) => safeBack(typeof body.back === 'string' ? body.back : null, fallback);

    switch (mode) {
      /* ------------------------------------------------------- coach side */
      case 'connect':
      case 'connect-check':
      case 'dashboard': {
        const { data: coach } = await admin.from('coaches').select('id, stripe_account_id, stripe_livemode').eq('user_id', user.id).maybeSingle();
        if (!coach) throw new Plain('Only approved coaches can set up payouts.', 403);
        let account = coach.stripe_account_id as string | null;
        let acct: Awaited<ReturnType<typeof stripe.accounts.retrieve>> | null = null;
        // An account made in the other Stripe mode (test, before going live)
        // is unknown under this key: forget it and start again.
        if (account && coach.stripe_livemode != null && coach.stripe_livemode !== LIVE) { await forgetAccount(coach.id); account = null; }
        if (account) {
          try { acct = await stripe.accounts.retrieve(account); }
          catch (e) { if (!isMissing(e)) throw e; await forgetAccount(coach.id); account = null; }
        }
        if (mode === 'connect' && !account) {
          const created = await stripe.accounts.create({
            type: 'express',
            country: 'US',
            email: user.email ?? undefined,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            business_type: 'individual',
            business_profile: { product_description: 'Tennis coaching sold on CourtSide', url: `https://app.courtsidebase.com/coach/${coach.id}` },
            metadata: { coach_id: coach.id, user_id: user.id },
          });
          account = created.id;
          acct = created;
          await admin.from('coaches').update({ stripe_account_id: account, stripe_livemode: created.livemode, payouts_ready: false }).eq('id', coach.id);
        }
        if (!account || !acct) return json({ ready: false, started: false });
        const ready = accountReady(acct);
        // A listed coach stays listed while payouts are unfinished: their page says booking opens soon, and checkout refuses until ready.
        await admin.from('coaches').update({ payouts_ready: ready }).eq('id', coach.id);
        if (mode === 'connect-check') return json({ ready, started: true, due: acct.requirements?.currently_due?.length ?? 0 });
        if (mode === 'dashboard') {
          if (!acct.details_submitted) throw new Plain('Finish payout setup first.');
          const link = await stripe.accounts.createLoginLink(account);
          return json({ url: link.url });
        }
        // Already done: nothing to send the coach back to Stripe for.
        if (ready) return json({ ready: true });
        const done = back('courtside://coach-studio');
        const link = await stripe.accountLinks.create({
          account,
          type: 'account_onboarding',
          refresh_url: withQuery(`${SELF}/return`, { back: done, stripe: 'retry' }),
          return_url: withQuery(`${SELF}/return`, { back: done, stripe: 'done' }),
        });
        return json({ url: link.url, ready });
      }

      /* ------------------------------------------------------ player side */
      case 'checkout': {
        const serviceId = String(body.serviceId ?? '');
        const question = String(body.question ?? '').trim().slice(0, 4000);
        const videoUrl = typeof body.videoUrl === 'string' && /^https:\/\//.test(body.videoUrl) ? body.videoUrl.slice(0, 1000) : null;
        if (question.length < 2) throw new Plain('Say what you want looked at first.');
        const { data: service } = await admin.from('coach_services').select('id, coach_id, title, price_cents, kind, active').eq('id', serviceId).maybeSingle();
        if (!service || !service.active) throw new Plain('That service is no longer offered.');
        const { data: coach } = await admin.from('coaches').select('id, user_id, listed, payouts_ready, stripe_account_id, stripe_livemode').eq('id', service.coach_id).maybeSingle();
        if (!coach?.listed || !coach.payouts_ready || !coach.stripe_account_id) throw new Plain(CLOSED);
        if (coach.user_id === user.id) throw new Plain('You cannot book yourself.');
        const { data: coachProfile } = await admin.from('profiles').select('name, handle, suspended_at').eq('id', coach.user_id).maybeSingle();
        // A coach suspended by the admins takes no more money.
        if (!coachProfile || coachProfile.suspended_at) throw new Plain(CLOSED);
        // Stripe has the last word on whether the coach can be paid right now,
        // so no booking is filed that Stripe would then refuse.
        if (coach.stripe_livemode != null && coach.stripe_livemode !== LIVE) { await forgetAccount(coach.id); throw new Plain(CLOSED); }
        try {
          const acct = await stripe.accounts.retrieve(coach.stripe_account_id);
          if (!accountReady(acct)) { await admin.from('coaches').update({ payouts_ready: false }).eq('id', coach.id); throw new Plain(CLOSED); }
        } catch (e) {
          if (e instanceof Plain) throw e;
          if (isMissing(e)) { await forgetAccount(coach.id); throw new Plain(CLOSED); }
          throw e;
        }
        const price = service.price_cents as number;
        const fee = Math.round((price * FEE_PERCENT) / 100);
        // Old unpaid attempts for the same thing are cleared, so they never
        // pile up. Their pay pages are closed first, and a booking is only
        // cleared once Stripe confirms its pay page is closed: one paid in
        // another tab, or still being paid, keeps its booking.
        const { data: stale } = await admin.from('coaching_requests').select('id, stripe_session_id, created_at').eq('user_id', user.id).eq('service_id', service.id).is('paid_at', null);
        for (const old of stale ?? []) {
          if (!old.stripe_session_id) {
            // Another checkout may be setting this one up this very moment.
            if (Date.now() - Date.parse(old.created_at) < 2 * 60_000) continue;
          } else {
            let closed = false;
            try { await stripe.checkout.sessions.expire(old.stripe_session_id); closed = true; }
            catch {
              const s = await stripe.checkout.sessions.retrieve(old.stripe_session_id).catch(() => null);
              if (s?.payment_status === 'paid') { await markPaid(old.id, intentOf(s)); continue; }
              closed = s?.status === 'expired';
            }
            if (!closed) continue;
          }
          await admin.from('coaching_requests').delete().eq('id', old.id).is('paid_at', null);
        }
        const { data: request, error } = await admin.from('coaching_requests').insert({
          coach_id: coach.id, coach_user_id: coach.user_id, user_id: user.id, service_id: service.id,
          question, video_url: videoUrl, video_label: videoUrl ? 'Video attached' : null,
          status: 'awaiting-payment', price_cents: price, fee_cents: fee,
        }).select('id').single();
        if (error || !request) throw new Error(error?.message ?? 'could not file the request');
        const done = back('courtside://booking-done');
        const who = coachProfile?.name || coachProfile?.handle || 'your coach';
        let session;
        try {
          session = await stripe.checkout.sessions.create({
            mode: 'payment',
            // Cards only (Apple Pay and Google Pay count as cards): a bank
            // payment that takes days to clear would leave a booking in limbo.
            payment_method_types: ['card'],
            line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: price, product_data: { name: `${service.title} with ${who}`, description: KIND[service.kind] ?? 'Coaching' } } }],
            payment_intent_data: {
              ...(fee > 0 ? { application_fee_amount: fee } : {}),
              transfer_data: { destination: coach.stripe_account_id },
              metadata: { request_id: request.id },
              description: `CourtSide · ${service.title} with ${who}`,
              // Stripe emails the receipt here.
              receipt_email: user.email ?? undefined,
            },
            metadata: { request_id: request.id },
            client_reference_id: request.id,
            customer_email: user.email ?? undefined,
            custom_text: { submit: { message: PAY_NOTE } },
            success_url: `${SELF}/return?${new URLSearchParams({ back: done, request: request.id })}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: withQuery(`${SELF}/return`, { back: back(`courtside://coach/${coach.id}`), cancelled: '1' }),
            expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
          });
        } catch (e) {
          // No pay page, so no booking: nothing is left behind.
          await admin.from('coaching_requests').delete().eq('id', request.id).is('paid_at', null);
          if (isMissing(e)) { await forgetAccount(coach.id); throw new Plain(CLOSED); }
          throw e;
        }
        await admin.from('coaching_requests').update({ stripe_session_id: session.id }).eq('id', request.id);
        return json({ url: session.url, requestId: request.id });
      }

      case 'confirm': {
        const { data: request } = await admin.from('coaching_requests').select('id, user_id, paid_at, stripe_session_id').eq('id', String(body.requestId ?? '')).maybeSingle();
        if (!request || request.user_id !== user.id) throw new Plain('No such booking.', 404);
        if (request.paid_at) return json({ paid: true });
        if (!request.stripe_session_id) return json({ paid: false });
        const session = await stripe.checkout.sessions.retrieve(request.stripe_session_id);
        if (session.payment_status !== 'paid') return json({ paid: false });
        await markPaid(request.id, intentOf(session));
        return json({ paid: true });
      }

      case 'refund': {
        const { data: r } = await admin.from('coaching_requests').select('*').eq('id', String(body.requestId ?? '')).maybeSingle();
        if (!r) throw new Plain('No such booking.', 404);
        if (!r.paid_at || r.refunded_at) throw new Plain('There is nothing to refund on this one.');
        if (r.disputed_at) throw new Plain('The player has asked their bank about this payment, so it is settled with Stripe, not here.');
        const byCoach = r.coach_user_id === user.id;
        const late = !!r.due_at && Date.now() > Date.parse(r.due_at);
        const byPlayer = r.user_id === user.id && late;
        const asAdmin = await isAdmin(user.id);
        if (!byCoach && !byPlayer && !asAdmin) {
          throw new Plain(r.user_id === user.id ? 'You can get your money back if the coach has not answered by the deadline.' : 'Not allowed.', 403);
        }
        // Once answered, only an admin (handling a support request) can refund.
        if (r.status === 'answered' && !asAdmin) throw new Plain('This one has been answered, so it cannot be refunded here. Write to support@courtsidebase.com.');
        if (!r.payment_intent_id) throw new Plain('This payment cannot be found with Stripe.');
        // Claim the booking first, so an answer landing at the same moment
        // can't slip in: the coach's answer is refused once refunded_at is set,
        // and this claim matches nothing if the answer got there first.
        const claimedAt = new Date().toISOString();
        let claim = admin.from('coaching_requests')
          .update({ status: byCoach ? 'declined' : 'refunded', refunded_at: claimedAt })
          .eq('id', r.id).not('paid_at', 'is', null).is('refunded_at', null).is('disputed_at', null);
        if (!asAdmin) claim = claim.neq('status', 'answered');
        const { data: claimed, error: claimError } = await claim.select('id').maybeSingle();
        if (claimError) throw new Error(claimError.message);
        if (!claimed) throw new Plain('This one has already been answered or refunded.');
        try {
          await stripe.refunds.create(
            { payment_intent: r.payment_intent_id, reverse_transfer: true, refund_application_fee: true, metadata: { request_id: r.id } },
            { idempotencyKey: `refund-${r.id}-${claimedAt}` },
          );
        } catch (e) {
          const err = e as { type?: string; code?: string; raw?: { code?: string } };
          const code = err.code ?? err.raw?.code;
          // Refunded already (say, from Stripe's dashboard): the claim is right as it stands.
          if (code !== 'charge_already_refunded') {
            // Stripe clearly said no: the booking goes back as it was. If
            // Stripe never answered (a timeout), the claim stays; the refund
            // may well have gone through, and Stripe can't refund twice.
            if (['StripeInvalidRequestError', 'StripeCardError', 'StripePermissionError', 'StripeAuthenticationError', 'StripeRateLimitError'].includes(err.type ?? '')) {
              await admin.from('coaching_requests').update({ status: r.status, refunded_at: null }).eq('id', r.id).eq('refunded_at', claimedAt);
            }
            throw e;
          }
        }
        const words = byCoach ? 'Your coach could not take this one. Your money is on its way back.' : 'Your booking was refunded. The money is on its way back.';
        await admin.from('notifications').insert({ user_id: r.user_id, actor_id: r.user_id, kind: 'refund', target_id: r.id, target_kind: 'coaching-request', preview: words });
        if (!byCoach && r.coach_user_id) {
          const coachWords = byPlayer ? 'A booking was refunded because it was not answered in time.' : 'CourtSide support refunded one of your bookings.';
          await admin.from('notifications').insert({ user_id: r.coach_user_id, actor_id: r.coach_user_id, kind: 'refund', target_id: r.id, target_kind: 'coaching-request', preview: coachWords });
        }
        return json({ refunded: true });
      }

      /* -------------------------------------------------------- admin side */
      case 'admin-status':
      case 'setup-webhook': {
        if (!(await isAdmin(user.id))) throw new Plain('Not allowed.', 403);
        const target = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
        // One secret per Stripe mode: after switching to a live key, the test
        // secrets don't count, so this shows unfinished until Finish is pressed again.
        const [bookings, accounts] = await Promise.all([webhookSecret('bookings'), webhookSecret('accounts')]);
        if (mode === 'admin-status') return json({ stripe: true, live: LIVE, webhook: !!bookings && !!accounts, feePercent: FEE_PERCENT });
        if (!bookings) {
          const endpoint = await stripe.webhookEndpoints.create({
            url: target,
            enabled_events: [
              'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired',
              'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed',
            ],
            description: 'CourtSide bookings',
          });
          await admin.from('server_settings').upsert({ key: WEBHOOK_SLOT.bookings, value: endpoint.secret!, updated_at: new Date().toISOString() });
        }
        if (!accounts) {
          // Coaches' own Stripe accounts: hears when Stripe turns their payouts on or off.
          const endpoint = await stripe.webhookEndpoints.create({
            url: target,
            connect: true,
            enabled_events: ['account.updated'],
            description: 'CourtSide coach accounts',
          });
          await admin.from('server_settings').upsert({ key: WEBHOOK_SLOT.accounts, value: endpoint.secret!, updated_at: new Date().toISOString() });
        }
        return json({ webhook: true });
      }
    }
    return json({ error: 'Unknown request.' }, 400);
  } catch (err) {
    if (err instanceof Plain) return json({ error: err.message }, err.status);
    console.error('[coach-payments]', err);
    const message = (err as { raw?: { message?: string } })?.raw?.message;
    return json({ error: message ? `Stripe said: ${message}` : 'Payments are unavailable right now. Try again in a minute.' }, 500);
  }
});
