// CourtSide coach payments — a Supabase Edge Function, with Stripe Connect.
//
// Players pay through Stripe Checkout; the money goes to the coach's own
// Stripe account, less Stripe's fee and CourtSide's platform fee. The app
// never sees card details or the Stripe key. Jobs, by `mode`:
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
// Deploy:   npx supabase functions deploy coach-payments --no-verify-jwt
// Secrets:  STRIPE_SECRET_KEY (sk_test_… first, sk_live_… when going live),
//           optional PLATFORM_FEE_PERCENT (default 15).
import { admin, FEE_PERCENT, markPaid, STRIPE_KEY, stripe, SUPABASE_URL } from '../_shared/coaching.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const SELF = `${SUPABASE_URL}/functions/v1/coach-payments`;
/** The only places a browser is ever sent back to: the app, Expo Go while developing, or the web app. */
const safeBack = (back: string | null | undefined, fallback: string) =>
  back && /^(courtside:\/\/|exps?:\/\/[a-z0-9-]+\.exp\.direct\/|exps?:\/\/(localhost|\d{1,3}(\.\d{1,3}){3}):\d+\/|https:\/\/app\.courtsidebase\.com\/|http:\/\/localhost:\d+\/)/.test(back) ? back : fallback;
const withQuery = (base: string, q: Record<string, string>) => `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(q)}`;
const KIND: Record<string, string> = { 'video-review': 'Video review', 'written-qa': 'Written answer', 'live-session': 'Live session', plan: 'Training plan' };

async function whoIs(req: Request) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return null;
  const { data } = await admin.auth.getUser(bearer);
  return data.user ?? null;
}
const isAdmin = async (uid: string) => !!(await admin.from('profiles').select('is_admin').eq('id', uid).maybeSingle()).data?.is_admin;

class Plain extends Error { constructor(message: string, public status = 400) { super(message); } }

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
          await markPaid(requestId, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null);
          q.paid = '1';
        }
        if (requestId) q.request = requestId;
      } catch (e) { console.error('[coach-payments] return', e); }
    }
    for (const k of ['stripe', 'cancelled']) { const v = url.searchParams.get(k); if (v) q[k] = v; }
    return Response.redirect(Object.keys(q).length ? withQuery(back, q) : back, 302);
  }

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const mode = String(body.mode ?? '');
    if (mode === 'status') return json({ on: !!STRIPE_KEY, feePercent: FEE_PERCENT });

    const user = await whoIs(req);
    if (!user) return json({ error: 'Sign in first.' }, 401);
    if (!STRIPE_KEY) return json({ error: 'Payments are not switched on yet.', off: true }, 503);
    const back = (fallback: string) => safeBack(typeof body.back === 'string' ? body.back : null, fallback);

    switch (mode) {
      /* ------------------------------------------------------- coach side */
      case 'connect':
      case 'connect-check':
      case 'dashboard': {
        const { data: coach } = await admin.from('coaches').select('id, stripe_account_id').eq('user_id', user.id).maybeSingle();
        if (!coach) throw new Plain('Only approved coaches can set up payouts.', 403);
        let account = coach.stripe_account_id as string | null;
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
          await admin.from('coaches').update({ stripe_account_id: account }).eq('id', coach.id);
        }
        if (!account) return json({ ready: false, started: false });
        const acct = await stripe.accounts.retrieve(account);
        const ready = !!acct.charges_enabled && !!acct.details_submitted;
        // A listed coach stays listed while payouts are unfinished: their page says booking opens soon, and checkout refuses until ready.
        await admin.from('coaches').update({ payouts_ready: ready }).eq('id', coach.id);
        if (mode === 'connect-check') return json({ ready, started: true, due: acct.requirements?.currently_due?.length ?? 0 });
        if (mode === 'dashboard') {
          if (!acct.details_submitted) throw new Plain('Finish payout setup first.');
          const link = await stripe.accounts.createLoginLink(account);
          return json({ url: link.url });
        }
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
        const { data: coach } = await admin.from('coaches').select('id, user_id, listed, payouts_ready, stripe_account_id').eq('id', service.coach_id).maybeSingle();
        if (!coach?.listed || !coach.payouts_ready || !coach.stripe_account_id) throw new Plain('This coach is not taking bookings right now.');
        if (coach.user_id === user.id) throw new Plain('You cannot book yourself.');
        const { data: coachProfile } = await admin.from('profiles').select('name, handle').eq('id', coach.user_id).maybeSingle();
        const price = service.price_cents as number;
        const fee = Math.round((price * FEE_PERCENT) / 100);
        // Old unpaid attempts for the same thing are cleared, so they never
        // pile up. Their pay pages are closed first: one paid in another tab
        // after its booking was cleared would take money for nothing.
        const { data: stale } = await admin.from('coaching_requests').select('id, stripe_session_id').eq('user_id', user.id).eq('service_id', service.id).is('paid_at', null);
        for (const old of stale ?? []) {
          if (old.stripe_session_id) {
            try { await stripe.checkout.sessions.expire(old.stripe_session_id); }
            catch { const s = await stripe.checkout.sessions.retrieve(old.stripe_session_id).catch(() => null); if (s?.payment_status === 'paid') continue; }
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
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: price, product_data: { name: `${service.title} with ${who}`, description: KIND[service.kind] ?? 'Coaching' } } }],
          payment_intent_data: {
            application_fee_amount: fee,
            transfer_data: { destination: coach.stripe_account_id },
            metadata: { request_id: request.id },
            description: `CourtSide · ${service.title} with ${who}`,
          },
          metadata: { request_id: request.id },
          client_reference_id: request.id,
          customer_email: user.email ?? undefined,
          success_url: `${SELF}/return?${new URLSearchParams({ back: done })}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: withQuery(`${SELF}/return`, { back: back(`courtside://coach/${coach.id}`), cancelled: '1' }),
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        });
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
        await markPaid(request.id, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null);
        return json({ paid: true });
      }

      case 'refund': {
        const { data: r } = await admin.from('coaching_requests').select('*').eq('id', String(body.requestId ?? '')).maybeSingle();
        if (!r) throw new Plain('No such booking.', 404);
        if (!r.paid_at || r.refunded_at) throw new Plain('There is nothing to refund on this one.');
        if (r.status === 'answered') throw new Plain('This one has been answered, so it cannot be refunded here. Write to support@courtsidebase.com.');
        const byCoach = r.coach_user_id === user.id;
        const late = !!r.due_at && Date.now() > Date.parse(r.due_at);
        const byPlayer = r.user_id === user.id && late;
        if (!byCoach && !byPlayer && !(await isAdmin(user.id))) {
          throw new Plain(r.user_id === user.id ? 'You can get your money back if the coach has not answered by the deadline.' : 'Not allowed.', 403);
        }
        if (!r.payment_intent_id) throw new Plain('This payment cannot be found with Stripe.');
        await stripe.refunds.create({ payment_intent: r.payment_intent_id, reverse_transfer: true, refund_application_fee: true, metadata: { request_id: r.id } });
        await admin.from('coaching_requests').update({ status: byCoach ? 'declined' : 'refunded', refunded_at: new Date().toISOString() }).eq('id', r.id);
        const words = byCoach ? 'Your coach could not take this one. Your money is on its way back.' : 'Your booking was refunded. The money is on its way back.';
        await admin.from('notifications').insert({ user_id: r.user_id, actor_id: r.user_id, kind: 'refund', target_id: r.id, target_kind: 'coaching-request', preview: words });
        if (!byCoach && r.coach_user_id) {
          await admin.from('notifications').insert({ user_id: r.coach_user_id, actor_id: r.coach_user_id, kind: 'refund', target_id: r.id, target_kind: 'coaching-request', preview: 'A booking was refunded because it was not answered in time.' });
        }
        return json({ refunded: true });
      }

      /* -------------------------------------------------------- admin side */
      case 'admin-status':
      case 'setup-webhook': {
        if (!(await isAdmin(user.id))) throw new Plain('Not allowed.', 403);
        const target = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
        const stored = (await admin.from('server_settings').select('value').eq('key', 'stripe_webhook_secret').maybeSingle()).data?.value;
        const hasWebhook = !!stored || !!Deno.env.get('STRIPE_WEBHOOK_SECRET');
        const live = STRIPE_KEY.startsWith('sk_live_');
        if (mode === 'admin-status') return json({ stripe: true, live, webhook: hasWebhook, feePercent: FEE_PERCENT });
        if (hasWebhook) return json({ webhook: true });
        const endpoint = await stripe.webhookEndpoints.create({
          url: target,
          enabled_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'],
          description: 'CourtSide bookings',
        });
        await admin.from('server_settings').upsert({ key: 'stripe_webhook_secret', value: endpoint.secret!, updated_at: new Date().toISOString() });
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
