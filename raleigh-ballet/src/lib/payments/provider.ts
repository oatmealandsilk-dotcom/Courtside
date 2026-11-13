import "server-only";
import Stripe from "stripe";
import { appUrl, hasStripe, isDemo } from "@/lib/env";
import { signToken } from "@/lib/tokens";
import { hoursMs } from "@/lib/time";
import type { Payment, Person } from "@/db/schema";

/**
 * The one place that talks to the card processor. With Stripe keys set it uses
 * Stripe; in demo mode every payment "succeeds" on a pretend checkout page, so
 * the whole app can be tried without real money or accounts.
 */
let _stripe: Stripe | undefined;
export function stripe(): Stripe {
  if (!hasStripe()) throw new Error("Stripe is not configured");
  return (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
}

export const usingDemoPayments = () => !hasStripe() && isDemo();

export async function ensureCustomer(person: Person): Promise<string> {
  if (person.stripeCustomerId) return person.stripeCustomerId;
  if (usingDemoPayments()) return `demo_cus_${person.id}`;
  const c = await stripe().customers.create({
    email: person.email ?? undefined,
    name: `${person.firstName} ${person.lastName}`.trim(),
    metadata: { person_id: person.id },
  });
  return c.id;
}

/** Start a hosted checkout for a pending payment. Returns the address to send the customer to. */
export async function createCheckout(args: {
  payment: Payment;
  description: string;
  customerId: string;
  saveCard?: boolean;
  successPath: string;
  cancelPath: string;
}): Promise<{ url: string; checkoutSessionId?: string }> {
  const { payment } = args;
  if (usingDemoPayments()) {
    const t = signToken({ k: "demo-pay", p: payment.id, ok: args.successPath, no: args.cancelPath }, hoursMs(2));
    return { url: `${appUrl()}/demo/pay?t=${t}` };
  }
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: args.customerId,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: payment.amountCents, product_data: { name: args.description } } }],
    payment_intent_data: {
      metadata: { payment_id: payment.id },
      ...(args.saveCard ? { setup_future_usage: "off_session" as const } : {}),
    },
    metadata: { payment_id: payment.id },
    success_url: `${appUrl()}${args.successPath}`,
    cancel_url: `${appUrl()}${args.cancelPath}`,
  });
  return { url: session.url!, checkoutSessionId: session.id };
}

/** Hosted page that only saves a card for later (no charge). */
export async function createSaveCardSession(person: Person, customerId: string, returnPath: string): Promise<string> {
  if (usingDemoPayments()) {
    return `${appUrl()}/demo/card?t=${signToken({ k: "demo-card", p: person.id, back: returnPath }, hoursMs(2))}`;
  }
  const session = await stripe().checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    currency: "usd",
    metadata: { person_id: person.id },
    success_url: `${appUrl()}${returnPath}`,
    cancel_url: `${appUrl()}${returnPath}`,
  });
  return session.url!;
}

export type ChargeResult = { ok: true; intentId: string } | { ok: false; error: string; intentId?: string };

/** Charge a saved card with the customer not present (no-show fees, class charged after the fact, tuition autopay). */
export async function chargeSavedCard(args: { payment: Payment; payer: Person; description: string }): Promise<ChargeResult> {
  const { payer, payment } = args;
  if (!payer.stripePaymentMethodId || !payer.stripeCustomerId) return { ok: false, error: "No card on file" };
  if (usingDemoPayments()) {
    // A demo card ending 0002 always declines, so the "payment failed" path can be shown.
    return payer.cardLast4 === "0002" ? { ok: false, error: "Card declined (demo)" } : { ok: true, intentId: `demo_pi_${payment.id}` };
  }
  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: payment.amountCents,
        currency: "usd",
        customer: payer.stripeCustomerId,
        payment_method: payer.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: args.description,
        metadata: { payment_id: payment.id },
      },
      { idempotencyKey: `charge_${payment.id}` },
    );
    return pi.status === "succeeded" ? { ok: true, intentId: pi.id } : { ok: false, error: `Payment ${pi.status}`, intentId: pi.id };
  } catch (e) {
    const err = e as Stripe.errors.StripeError;
    return { ok: false, error: err.message ?? "Card error", intentId: err.payment_intent?.id };
  }
}

export async function refundCard(payment: Payment, amountCents: number): Promise<{ refundId: string }> {
  if (usingDemoPayments() || payment.stripePaymentIntentId?.startsWith("demo_")) return { refundId: `demo_re_${payment.id}_${Date.now()}` };
  if (!payment.stripePaymentIntentId) throw new Error("This payment has no card charge to refund");
  const r = await stripe().refunds.create({ payment_intent: payment.stripePaymentIntentId, amount: amountCents });
  return { refundId: r.id };
}
