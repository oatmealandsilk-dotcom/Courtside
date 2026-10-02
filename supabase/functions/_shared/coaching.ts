// Shared by `coach-payments` and `stripe-webhook`: the Stripe client, the
// database client with the server's own key, and what happens when a
// booking is paid for.
import Stripe from 'npm:stripe@22.6.2';
import { createClient } from 'npm:@supabase/supabase-js@2';

export const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
export const stripe = new Stripe(STRIPE_KEY || 'sk_missing', { httpClient: Stripe.createFetchHttpClient() });
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Real money (a live key) or Stripe's test mode. Test and live are two separate worlds at Stripe. */
export const LIVE = /^(sk|rk)_live_/.test(STRIPE_KEY);

/**
 * Where each webhook signing secret is kept, one per Stripe mode, so a test
 * secret never stands in for a live one after the switch to real keys.
 * `bookings` hears about payments and refunds; `accounts` hears when Stripe
 * changes what a coach's own account can do.
 */
export const WEBHOOK_SLOT = {
  bookings: LIVE ? 'stripe_webhook_secret_live' : 'stripe_webhook_secret_test',
  accounts: LIVE ? 'stripe_connect_webhook_secret_live' : 'stripe_connect_webhook_secret_test',
};
/** A secret typed into Supabase's secrets by hand counts only for its own mode. */
export const envWebhookSecret = (which: keyof typeof WEBHOOK_SLOT) =>
  Deno.env.get(`STRIPE_${which === 'accounts' ? 'CONNECT_' : ''}WEBHOOK_SECRET_${LIVE ? 'LIVE' : 'TEST'}`) ?? '';
/** Reads the stored signing secret for this mode (fresh every time, so a newly set one counts at once). */
export async function webhookSecret(which: keyof typeof WEBHOOK_SLOT) {
  const fromEnv = envWebhookSecret(which);
  if (fromEnv) return fromEnv;
  return (await admin.from('server_settings').select('value').eq('key', WEBHOOK_SLOT[which]).maybeSingle()).data?.value ?? '';
}

/**
 * What CourtSide keeps from each booking, as a percentage of the price.
 * Change with the PLATFORM_FEE_PERCENT secret; 0 really means no fee, and
 * a blank or unreadable value means the usual 15.
 */
const rawFee = (Deno.env.get('PLATFORM_FEE_PERCENT') ?? '').trim();
const parsedFee = rawFee === '' ? 15 : Number(rawFee);
export const FEE_PERCENT = Number.isFinite(parsedFee) ? Math.min(50, Math.max(0, parsedFee)) : 15;

/**
 * Can this coach's Stripe account take bookings? It must take cards, have
 * its details in, and be allowed to receive the coach's share.
 */
export const accountReady = (acct: Stripe.Account) =>
  !!acct.charges_enabled && !!acct.details_submitted && acct.capabilities?.transfers === 'active';

/**
 * A booking has been paid for: the request opens for the coach, its clock
 * starts, and the coach is told. Safe to call twice (the webhook and the
 * return page can both get here); only the first call does anything.
 * Answers 'paid' (this call opened it), 'already' (it was open before), or
 * 'missing' (no such booking at all). A database failure throws, so the
 * webhook answers with an error and Stripe tries again later.
 */
export async function markPaid(requestId: string, paymentIntent: string | null): Promise<'paid' | 'already' | 'missing'> {
  const { data: found, error: findError } = await admin.from('coaching_requests').select('id, paid_at, service_id').eq('id', requestId).maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!found) return 'missing';
  if (found.paid_at) return 'already';
  const { data: service } = await admin.from('coach_services').select('turnaround_hours').eq('id', found.service_id).maybeSingle();
  const now = Date.now();
  // Paid and its deadline land together, so a booking is never paid with no deadline.
  const { data: request, error } = await admin.from('coaching_requests')
    .update({
      status: 'submitted', paid_at: new Date(now).toISOString(), payment_intent_id: paymentIntent,
      due_at: new Date(now + (service?.turnaround_hours ?? 48) * 3_600_000).toISOString(),
    })
    .eq('id', requestId).is('paid_at', null)
    .select('id, user_id, coach_user_id, question').maybeSingle();
  if (error) throw new Error(error.message);
  if (!request) return 'already';
  if (request.coach_user_id) {
    await admin.from('notifications').insert({
      user_id: request.coach_user_id, actor_id: request.user_id, kind: 'booking',
      target_id: request.id, target_kind: 'coaching-request', preview: String(request.question ?? '').slice(0, 80),
    });
  }
  return 'paid';
}

/** Is this Stripe error "Stripe has never heard of that" (wrong mode, or deleted)? */
export const isMissing = (err: unknown) => {
  const e = err as { code?: string; raw?: { code?: string; message?: string }; message?: string };
  const code = e?.code ?? e?.raw?.code;
  const message = e?.raw?.message ?? e?.message ?? '';
  return code === 'resource_missing' || code === 'account_invalid' || /test mode|live mode|does not have access to account|no such (account|destination)/i.test(message);
};
