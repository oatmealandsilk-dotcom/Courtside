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

/** What CourtSide keeps from each booking, as a percentage of the price. Change with the PLATFORM_FEE_PERCENT secret. */
export const FEE_PERCENT = Math.min(50, Math.max(0, Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? '15') || 15));

/**
 * A booking has been paid for: the request opens for the coach, its clock
 * starts, and the coach is told. Safe to call twice (the webhook and the
 * return page can both get here); only the first call does anything.
 */
export async function markPaid(requestId: string, paymentIntent: string | null) {
  const { data: request } = await admin.from('coaching_requests')
    .update({ status: 'submitted', paid_at: new Date().toISOString(), payment_intent_id: paymentIntent })
    .eq('id', requestId).is('paid_at', null)
    .select('id, user_id, coach_user_id, service_id, question').maybeSingle();
  if (!request) return false;
  const { data: service } = await admin.from('coach_services').select('turnaround_hours').eq('id', request.service_id).maybeSingle();
  const due = new Date(Date.now() + (service?.turnaround_hours ?? 48) * 3_600_000).toISOString();
  await admin.from('coaching_requests').update({ due_at: due }).eq('id', requestId);
  if (request.coach_user_id) {
    await admin.from('notifications').insert({
      user_id: request.coach_user_id, actor_id: request.user_id, kind: 'booking',
      target_id: request.id, target_kind: 'coaching-request', preview: String(request.question ?? '').slice(0, 80),
    });
  }
  return true;
}
