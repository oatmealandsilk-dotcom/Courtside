// CourtSide ← Stripe — a Supabase Edge Function.
//
// Stripe tells this function when a booking is paid for, even if the
// player closed the browser before coming back to the app; when money goes
// back (a refund made in Stripe's dashboard, or a player asking their bank);
// and when Stripe turns a coach's payouts on or off. Every message is checked
// against Stripe's signature, so nobody else can fake one.
// The signing secrets are set up by the admin's "Finish Stripe setup" button
// (stored privately in the database, one set for test mode and one for live),
// or as STRIPE_WEBHOOK_SECRET_TEST / _LIVE and STRIPE_CONNECT_WEBHOOK_SECRET_TEST / _LIVE.
//
// Deploy:   npx supabase functions deploy stripe-webhook --no-verify-jwt
import { accountReady, admin, cryptoProvider, LIVE, markPaid, stripe, webhookSecret } from '../_shared/coaching.ts';

type Event = Awaited<ReturnType<typeof stripe.webhooks.constructEventAsync>>;
const intentOf = (o: { payment_intent?: string | { id: string } | null }) => (typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id ?? null);

/** The booking a charge paid for: by the id Stripe carries for us, or by its payment. */
async function bookingFor(charge: { metadata?: Record<string, string> | null; payment_intent?: string | { id: string } | null }) {
  const id = charge.metadata?.request_id;
  const pi = intentOf(charge);
  let q = admin.from('coaching_requests').select('id, user_id, coach_user_id, status, refunded_at, disputed_at');
  if (id) q = q.eq('id', id); else if (pi) q = q.eq('payment_intent_id', pi); else return null;
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const tell = (userId: string, requestId: string, preview: string) =>
  admin.from('notifications').insert({ user_id: userId, actor_id: userId, kind: 'refund', target_id: requestId, target_kind: 'coaching-request', preview });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  // Read fresh each time (not kept between calls), so a newly set secret counts at once.
  const secrets = (await Promise.all([webhookSecret('bookings'), webhookSecret('accounts')])).filter(Boolean);
  if (!secrets.length) return new Response('not set up', { status: 503 });
  const signature = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();
  let event: Event | null = null;
  for (const secret of secrets) {
    try { event = await stripe.webhooks.constructEventAsync(raw, signature, secret, undefined, cryptoProvider); break; } catch { /* try the other one */ }
  }
  if (!event) return new Response('bad signature', { status: 400 });
  // A test-mode message never touches live bookings, and the other way round.
  if (event.livemode !== LIVE) return new Response(JSON.stringify({ received: true, ignored: 'other mode' }), { headers: { 'content-type': 'application/json' } });
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const requestId = session.metadata?.request_id;
      if (requestId && session.payment_status === 'paid') {
        const result = await markPaid(requestId, intentOf(session));
        // Paid, but its booking is gone: the money goes straight back, so
        // nobody is charged for a booking that doesn't exist.
        const pi = intentOf(session);
        if (result === 'missing' && pi) {
          await stripe.refunds.create(
            { payment_intent: pi, reverse_transfer: true, refund_application_fee: true, metadata: { request_id: requestId, reason: 'booking missing' } },
            { idempotencyKey: `orphan-${session.id}` },
          );
        }
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const requestId = event.data.object.metadata?.request_id;
      // An abandoned or failed checkout leaves nothing behind.
      if (requestId) await admin.from('coaching_requests').delete().eq('id', requestId).is('paid_at', null);
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      // Only a full refund closes the booking; a partial one is a goodwill gesture.
      if (charge.refunded) {
        const r = await bookingFor(charge);
        if (r && !r.refunded_at) {
          // A refund made in the app already set refunded_at, so this does
          // nothing for those. An answered booking keeps its answer.
          const { data: changed, error } = await admin.from('coaching_requests')
            .update({ refunded_at: new Date().toISOString(), ...(r.status === 'answered' ? {} : { status: 'refunded' }) })
            .eq('id', r.id).is('refunded_at', null).select('id').maybeSingle();
          if (error) throw new Error(error.message);
          if (changed) {
            await tell(r.user_id, r.id, 'Your booking was refunded. The money is on its way back.');
            if (r.coach_user_id) await tell(r.coach_user_id, r.id, 'CourtSide support refunded one of your bookings.');
          }
        }
        // If the refund didn't take the coach's share back, take it back now,
        // so CourtSide isn't paying the whole refund itself.
        const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer?.id;
        // If the coach's balance can't cover it, Stripe says no; that is
        // logged for the admins rather than retried forever.
        if (transferId) {
          try {
            const transfer = await stripe.transfers.retrieve(transferId);
            const left = transfer.amount - transfer.amount_reversed;
            if (left > 0) await stripe.transfers.createReversal(transferId, { amount: left }, { idempotencyKey: `reverse-${charge.id}` });
          } catch (e) { console.error('[stripe-webhook] could not take back the coach share', transferId, e); }
        }
      }
    } else if (event.type === 'charge.dispute.created') {
      // The player asked their bank for the money back. The booking is put
      // on hold (the coach can't answer it) and the admins are told.
      const dispute = event.data.object;
      const r = await bookingFor({ payment_intent: dispute.payment_intent, metadata: null });
      if (r && !r.disputed_at) {
        const { error } = await admin.from('coaching_requests').update({ disputed_at: new Date().toISOString() }).eq('id', r.id);
        if (error) throw new Error(error.message);
        const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true);
        for (const a of admins ?? []) await tell(a.id, r.id, 'A player disputed a booking payment with their bank. Answer it in Stripe → Disputes.');
      }
    } else if (event.type === 'charge.dispute.closed') {
      // Won: the booking is back on. Lost: the money went back to the player.
      const dispute = event.data.object;
      const r = await bookingFor({ payment_intent: dispute.payment_intent, metadata: null });
      if (r) {
        const won = dispute.status === 'won';
        const { error } = await admin.from('coaching_requests')
          .update(won ? { disputed_at: null } : { refunded_at: r.refunded_at ?? new Date().toISOString(), ...(r.status === 'answered' ? {} : { status: 'refunded' }) })
          .eq('id', r.id);
        if (error) throw new Error(error.message);
      }
    } else if (event.type === 'account.updated') {
      // Stripe turned a coach's payouts on or off (finished checks, or new details due).
      const acct = event.data.object;
      const { error } = await admin.from('coaches').update({ payouts_ready: accountReady(acct) }).eq('stripe_account_id', acct.id);
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error('[stripe-webhook]', err);
    return new Response('failed', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
});
