// CourtSide ← Stripe — a Supabase Edge Function.
//
// Stripe tells this function when a booking is paid for, even if the
// player closed the browser before coming back to the app. Every message
// is checked against Stripe's signature, so nobody else can fake one.
// The signing secret is set up by the admin's "Finish Stripe setup" button
// (stored privately in the database), or as the STRIPE_WEBHOOK_SECRET secret.
//
// Deploy:   npx supabase functions deploy stripe-webhook --no-verify-jwt
import { admin, cryptoProvider, markPaid, stripe } from '../_shared/coaching.ts';

let secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!secret) secret = (await admin.from('server_settings').select('value').eq('key', 'stripe_webhook_secret').maybeSingle()).data?.value ?? '';
  if (!secret) return new Response('not set up', { status: 503 });
  const signature = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret, undefined, cryptoProvider);
  } catch {
    return new Response('bad signature', { status: 400 });
  }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const requestId = session.metadata?.request_id;
      if (requestId && session.payment_status === 'paid') {
        await markPaid(requestId, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null);
      }
    } else if (event.type === 'checkout.session.expired') {
      const requestId = event.data.object.metadata?.request_id;
      // An abandoned checkout leaves nothing behind.
      if (requestId) await admin.from('coaching_requests').delete().eq('id', requestId).is('paid_at', null);
    }
  } catch (err) {
    console.error('[stripe-webhook]', err);
    return new Response('failed', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
});
