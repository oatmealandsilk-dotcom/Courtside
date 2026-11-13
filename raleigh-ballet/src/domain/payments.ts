import { and, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/types";
import { bookings, classSessions, classTemplates, guardianships, households, invoices, payments, people, products, refunds, subscriptions, type Payment, type Person } from "@/db/schema";
import { audit } from "@/lib/audit";
import { formatCents } from "@/lib/money";
import { fmtDateShort, fmtMonth, zoned } from "@/lib/time";
import { notify } from "@/lib/messaging/send";
import { appUrl } from "@/lib/env";
import { signToken } from "@/lib/tokens";
import { daysMs } from "@/lib/time";
import { deductCredits, grantCredits } from "./credits";
import { RuleError } from "./policy";
import { bookSession, touchActivity } from "./bookings";

export type ChargeFn = (a: { payment: Payment; payer: Person; description: string }) => Promise<{ ok: true; intentId: string } | { ok: false; error: string; intentId?: string }>;
export type RefundFn = (payment: Payment, amountCents: number) => Promise<{ refundId: string }>;

export async function nextReceiptNumber(db: Tx, now = new Date()): Promise<string> {
  const res = await db.execute(sql`select nextval('receipt_seq')::int as n`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { n: number }[];
  return `R-${zoned(now).year}-${String(rows[0].n).padStart(6, "0")}`;
}

/** Whose card pays for this person: their own, else a guardian's, else the household's main contact. */
export async function payerFor(db: Tx, person: Person): Promise<Person> {
  if (person.stripePaymentMethodId || (!person.isMinor && person.authUserId)) return person;
  const parents = await db.select({ p: people }).from(guardianships).innerJoin(people, eq(people.id, guardianships.parentPersonId)).where(eq(guardianships.childPersonId, person.id));
  const withCard = parents.find((x) => x.p.stripePaymentMethodId);
  if (withCard) return withCard.p;
  if (person.householdId) {
    const [h] = await db.select().from(households).where(eq(households.id, person.householdId));
    if (h?.primaryContactPersonId) {
      const [pc] = await db.select().from(people).where(eq(people.id, h.primaryContactPersonId));
      if (pc) return pc;
    }
  }
  return parents[0]?.p ?? person;
}

export const PURPOSE_LABEL: Record<string, string> = {
  class_card: "Class card",
  drop_in: "Drop-in class",
  tuition: "Tuition",
  no_show_fee: "No-show fee",
  late_cancel_fee: "Late-cancel fee",
  workshop: "Workshop",
  other: "Other",
};

export async function describePayment(db: Tx, p: Payment): Promise<string> {
  if (p.productId) {
    const [prod] = await db.select().from(products).where(eq(products.id, p.productId));
    if (prod) return prod.name;
  }
  if (p.invoiceId) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId));
    if (inv) return `${fmtMonth(inv.periodMonth.slice(0, 7))} tuition`;
  }
  const sessionId = p.sessionId ?? (p.bookingId ? (await db.select().from(bookings).where(eq(bookings.id, p.bookingId)))[0]?.sessionId : null);
  if (sessionId) {
    const [r] = await db.select({ s: classSessions, t: classTemplates }).from(classSessions).innerJoin(classTemplates, eq(classTemplates.id, classSessions.templateId)).where(eq(classSessions.id, sessionId));
    if (r) return `${PURPOSE_LABEL[p.purpose]} — ${r.t.name}, ${fmtDateShort(r.s.startsAt)}`;
  }
  return p.note || PURPOSE_LABEL[p.purpose];
}

/**
 * A payment has definitely been received: record it and hand over what was bought.
 * Called by the Stripe/PayPal webhooks and by desk sales — never from the customer's browser.
 * Safe to call twice for the same payment (the second call does nothing).
 */
export async function fulfillPayment(
  db: Db,
  paymentId: string,
  refs: { stripePaymentIntentId?: string; paypalCaptureId?: string; actor?: string | null; now?: Date } = {},
): Promise<{ payment: Payment; alreadyDone: boolean; problem?: string }> {
  const now = refs.now ?? new Date();
  let problem: string | undefined;
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw new RuleError("Payment not found");
    if (p.fulfilledAt) return { payment: p, alreadyDone: true };
    const [paid] = await tx
      .update(payments)
      .set({
        status: "succeeded",
        receivedAt: p.receivedAt ?? now,
        fulfilledAt: now,
        failureReason: null,
        receiptNumber: p.receiptNumber ?? (await nextReceiptNumber(tx, now)),
        ...(refs.stripePaymentIntentId ? { stripePaymentIntentId: refs.stripePaymentIntentId } : {}),
        ...(refs.paypalCaptureId ? { paypalCaptureId: refs.paypalCaptureId } : {}),
      })
      .where(eq(payments.id, paymentId))
      .returning();

    if (paid.purpose === "class_card" && paid.productId && paid.personId) {
      const [prod] = await tx.select().from(products).where(eq(products.id, paid.productId));
      if (prod?.credits) {
        await grantCredits(tx, { personId: paid.personId, credits: prod.credits, reason: "purchase", productId: prod.id, paymentId: paid.id, validityDays: prod.validityDays, createdBy: refs.actor ?? paid.recordedBy, now });
      }
    }
    if (paid.invoiceId) {
      const [inv] = await tx.update(invoices).set({ status: "paid", paidAt: now, paymentId: paid.id }).where(eq(invoices.id, paid.invoiceId)).returning();
      if (inv?.subscriptionId) await tx.update(subscriptions).set({ status: "active" }).where(and(eq(subscriptions.id, inv.subscriptionId), eq(subscriptions.status, "past_due")));
    }
    if (paid.bookingId) await tx.update(bookings).set({ chargePaymentId: paid.id }).where(eq(bookings.id, paid.bookingId));
    if (paid.personId) await touchActivity(tx, paid.personId, now);
    return { payment: paid, alreadyDone: false };
  });
  if (result.alreadyDone) return result;
  const paid = result.payment;

  // A drop-in bought online books the class once the money is in.
  if ((paid.purpose === "drop_in" || paid.purpose === "workshop") && paid.sessionId && paid.personId && !paid.bookingId) {
    try {
      const b = await bookSession(db, { sessionId: paid.sessionId, personId: paid.personId, source: paid.recordedBy ? "desk" : "online", pay: paid.recordedBy ? "paid_at_desk" : "paid_online", paymentId: paid.id, actorUserId: refs.actor ?? paid.recordedBy, staff: !!paid.recordedBy, now });
      await db.update(payments).set({ bookingId: b.id }).where(eq(payments.id, paid.id));
    } catch (e) {
      problem = `Paid, but the class could not be booked: ${(e as Error).message}`;
      await db.update(payments).set({ note: problem }).where(eq(payments.id, paid.id));
    }
  }
  if (paid.personId && paid.method !== "comp" && paid.amountCents > 0) {
    await notify(db, "payment_receipt", paid.personId, {
      amount: formatCents(paid.amountCents),
      description: await describePayment(db, paid),
      receipt_number: paid.receiptNumber,
      method: paid.method,
      paid_date: fmtDateShort(paid.receivedAt ?? now),
      extra_line: problem ?? "",
    }, { dedupeKey: `receipt:${paid.id}` });
  }
  return { payment: paid, alreadyDone: false, problem };
}

/** A sale taken in person (cash, check, PayPal shown at the desk, the card reader) — recorded and handed over at once. */
export async function recordDeskPayment(
  db: Db,
  a: { personId: string; amountCents: number; method: "cash" | "check" | "paypal" | "card" | "comp"; purpose: Payment["purpose"]; productId?: string; invoiceId?: string; sessionId?: string; bookingId?: string; recordedBy: string; note?: string; now?: Date },
) {
  if (a.amountCents < 0) throw new RuleError("Amount can't be negative");
  const [person] = await db.select().from(people).where(eq(people.id, a.personId));
  if (!person) throw new RuleError("Person not found");
  const [p] = await db
    .insert(payments)
    .values({ householdId: person.householdId, personId: a.personId, amountCents: a.amountCents, method: a.method, status: "pending", purpose: a.purpose, productId: a.productId, invoiceId: a.invoiceId, sessionId: a.sessionId, bookingId: a.bookingId, recordedBy: a.recordedBy, note: a.note, receivedAt: a.now ?? new Date() })
    .returning();
  await audit(db, { actor: a.recordedBy, action: "payment.record", entity: "payment", entityId: p.id, after: { amountCents: a.amountCents, method: a.method, purpose: a.purpose } });
  return fulfillPayment(db, p.id, { actor: a.recordedBy, now: a.now });
}

export function payLink(paymentId: string) {
  return `${appUrl()}/pay/${paymentId}?t=${signToken({ k: "pay", p: paymentId }, daysMs(30))}`;
}

/**
 * Charge the saved card for something tied to a booking or invoice (no-show fee,
 * class charged after the fact, tuition autopay). If the card fails the payment
 * stays on the "Balances owed" list and the person is emailed a pay link.
 */
export async function chargeOnFile(
  db: Db,
  charge: ChargeFn,
  a: { personId: string; amountCents: number; purpose: Payment["purpose"]; bookingId?: string; invoiceId?: string; description: string; actor?: string | null; now?: Date },
): Promise<Payment | null> {
  if (a.amountCents <= 0) return null;
  const [person] = await db.select().from(people).where(eq(people.id, a.personId));
  if (!person) return null;
  const payer = await payerFor(db, person);
  const [p] = await db
    .insert(payments)
    .values({ householdId: person.householdId, personId: person.id, amountCents: a.amountCents, method: "card", status: "pending", purpose: a.purpose, bookingId: a.bookingId, invoiceId: a.invoiceId, note: a.description })
    .returning();
  if (a.bookingId) await db.update(bookings).set({ chargePaymentId: p.id }).where(eq(bookings.id, a.bookingId));
  const res = await charge({ payment: p, payer, description: a.description }).catch((e: Error) => ({ ok: false as const, error: e.message, intentId: undefined }));
  await audit(db, { actor: a.actor, action: res.ok ? "payment.charge" : "payment.charge_failed", entity: "payment", entityId: p.id, after: { amountCents: a.amountCents, purpose: a.purpose, error: res.ok ? undefined : res.error } });
  if (res.ok) return (await fulfillPayment(db, p.id, { stripePaymentIntentId: res.intentId, actor: a.actor, now: a.now })).payment;
  const [failed] = await db.update(payments).set({ status: "failed", failureReason: res.error, ...(res.intentId ? { stripePaymentIntentId: res.intentId } : {}) }).where(eq(payments.id, p.id)).returning();
  await notify(db, "payment_failed", person, { amount: formatCents(a.amountCents), description: a.description, pay_url: payLink(p.id) }, { dedupeKey: `payfail:${p.id}` });
  return failed;
}

/** Refund all or part of a payment. Card/PayPal money goes back through the processor; cash is just recorded. */
export async function refundPayment(
  db: Db,
  refundFns: { card: RefundFn; paypal?: RefundFn },
  a: { paymentId: string; amountCents?: number; reason?: string; actor?: string | null; removeCredits?: boolean; alreadyRefundedAtProvider?: { stripeRefundId?: string } },
) {
  const [p] = await db.select().from(payments).where(eq(payments.id, a.paymentId));
  if (!p) throw new RuleError("Payment not found");
  if (p.status !== "succeeded" && p.status !== "partially_refunded") throw new RuleError("Only a completed payment can be refunded");
  const left = p.amountCents - p.refundedCents;
  const amount = a.amountCents ?? left;
  if (amount <= 0 || amount > left) throw new RuleError(`Refund must be between $0.01 and ${formatCents(left)}`);

  let stripeRefundId: string | undefined = a.alreadyRefundedAtProvider?.stripeRefundId;
  let paypalRefundId: string | undefined;
  if (!a.alreadyRefundedAtProvider) {
    if (p.method === "card" && p.stripePaymentIntentId) stripeRefundId = (await refundFns.card(p, amount)).refundId;
    else if (p.method === "paypal" && p.paypalCaptureId && refundFns.paypal) paypalRefundId = (await refundFns.paypal(p, amount)).refundId;
  }
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(refunds).values({ paymentId: p.id, amountCents: amount, reason: a.reason, processedBy: a.actor ?? null, stripeRefundId, paypalRefundId }).onConflictDoNothing().returning();
    if (!inserted.length) return p; // this processor refund was already recorded
    const refundedCents = p.refundedCents + amount;
    const [updated] = await tx.update(payments).set({ refundedCents, status: refundedCents >= p.amountCents ? "refunded" : "partially_refunded" }).where(eq(payments.id, p.id)).returning();
    if (a.removeCredits && p.purpose === "class_card" && p.personId) {
      const lots = await tx.execute(sql`select coalesce(sum(credits_remaining),0)::int as n from credit_lots where payment_id = ${p.id}`);
      const n = ((Array.isArray(lots) ? lots : (lots as { rows: unknown[] }).rows) as { n: number }[])[0]?.n ?? 0;
      if (n > 0) {
        await tx.execute(sql`update credit_lots set credits_remaining = 0 where payment_id = ${p.id}`);
        await tx.execute(sql`insert into credit_transactions (person_id, lot_id, delta, reason, created_by, note) select person_id, id, ${-1} * ${n}, 'refund', ${a.actor ?? null}::uuid, 'Card refunded' from credit_lots where payment_id = ${p.id} limit 1`);
      }
    }
    if (p.invoiceId && refundedCents >= p.amountCents) await tx.update(invoices).set({ status: "open", paidAt: null, paymentId: null }).where(eq(invoices.id, p.invoiceId));
    await audit(tx, { actor: a.actor, action: "payment.refund", entity: "payment", entityId: p.id, before: { refundedCents: p.refundedCents, status: p.status }, after: { refundedCents, amount, reason: a.reason } });
    return updated;
  });
}
export { deductCredits };
