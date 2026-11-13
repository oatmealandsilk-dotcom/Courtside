import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { creditLots, creditTransactions } from "@/db/schema";
import { daysMs } from "@/lib/time";
import { balanceOf, planDeduction, usableLots } from "./policy";

/** Lots that still have usable credits, soonest-expiring first, and the total. */
export async function getCredits(db: Tx, personId: string, now = new Date()) {
  const lots = await db.select().from(creditLots).where(and(eq(creditLots.personId, personId), gt(creditLots.creditsRemaining, 0)));
  const usable = usableLots(lots, now);
  return { balance: balanceOf(lots, now), lots: usable, nextExpiry: usable.find((l) => l.expiresAt)?.expiresAt ?? null };
}

/** Add a new lot of credits (a purchase, an import, or an admin gift). */
export async function grantCredits(
  db: Tx,
  a: {
    personId: string;
    credits: number;
    reason: "purchase" | "import" | "admin_adjust";
    productId?: string | null;
    paymentId?: string | null;
    validityDays?: number | null;
    expiresAt?: Date | null;
    createdBy?: string | null;
    note?: string | null;
    importBatchId?: string | null;
    now?: Date;
  },
) {
  const now = a.now ?? new Date();
  const expiresAt = a.expiresAt !== undefined ? a.expiresAt : a.validityDays ? new Date(now.getTime() + daysMs(a.validityDays)) : null;
  const [lot] = await db
    .insert(creditLots)
    .values({
      personId: a.personId,
      productId: a.productId ?? null,
      paymentId: a.paymentId ?? null,
      creditsTotal: a.credits,
      creditsRemaining: a.credits,
      purchasedAt: now,
      expiresAt,
      importBatchId: a.importBatchId ?? null,
    })
    .returning();
  await db.insert(creditTransactions).values({ personId: a.personId, lotId: lot.id, delta: a.credits, reason: a.reason, createdBy: a.createdBy ?? null, note: a.note ?? null, createdAt: now });
  return lot;
}

/** Take credits out for a booking (or an admin deduction), soonest-expiring lot first. */
export async function deductCredits(
  db: Tx,
  a: { personId: string; cost: number; reason: "booking_reserve" | "admin_adjust" | "refund"; bookingId?: string | null; createdBy?: string | null; note?: string | null; now?: Date },
) {
  const now = a.now ?? new Date();
  if (a.cost <= 0) return [];
  // Lock this person's lots so two bookings at once can't spend the same credit.
  const lots = await db.select().from(creditLots).where(and(eq(creditLots.personId, a.personId), gt(creditLots.creditsRemaining, 0))).for("update");
  const plan = planDeduction(lots, a.cost, now);
  const txns = [];
  for (const step of plan) {
    await db.update(creditLots).set({ creditsRemaining: sql`${creditLots.creditsRemaining} - ${step.take}` }).where(eq(creditLots.id, step.lotId));
    const [t] = await db
      .insert(creditTransactions)
      .values({ personId: a.personId, lotId: step.lotId, delta: -step.take, reason: a.reason, bookingId: a.bookingId ?? null, createdBy: a.createdBy ?? null, note: a.note ?? null, createdAt: now })
      .returning();
    txns.push(t);
  }
  return txns;
}

/** Credits currently held by a booking, per lot (reserved minus already released). */
async function heldByBooking(db: Tx, bookingId: string) {
  const rows = await db
    .select({ lotId: creditTransactions.lotId, personId: creditTransactions.personId, net: sql<number>`sum(${creditTransactions.delta})::int` })
    .from(creditTransactions)
    .where(and(eq(creditTransactions.bookingId, bookingId), sql`${creditTransactions.reason} in ('booking_reserve','booking_release')`))
    .groupBy(creditTransactions.lotId, creditTransactions.personId);
  return rows.filter((r) => r.net < 0).map((r) => ({ ...r, held: -r.net }));
}
export async function creditsHeld(db: Tx, bookingId: string) {
  return (await heldByBooking(db, bookingId)).reduce((n, r) => n + r.held, 0);
}

/** Give a booking's credits back to the lots they came from. Safe to call twice. */
export async function releaseCredits(db: Tx, bookingId: string, createdBy?: string | null, note?: string, now = new Date()) {
  let released = 0;
  for (const h of await heldByBooking(db, bookingId)) {
    await db.update(creditLots).set({ creditsRemaining: sql`${creditLots.creditsRemaining} + ${h.held}` }).where(eq(creditLots.id, h.lotId));
    await db.insert(creditTransactions).values({ personId: h.personId, lotId: h.lotId, delta: h.held, reason: "booking_release", bookingId, createdBy: createdBy ?? null, note: note ?? null, createdAt: now });
    released += h.held;
  }
  return released;
}

/** Mark a booking's reserved credits as used for good. The credit was already taken at booking, so the amount is 0. Safe to call twice. */
export async function consumeCredits(db: Tx, bookingId: string, createdBy?: string | null, now = new Date()) {
  const already = await db.select({ id: creditTransactions.id }).from(creditTransactions).where(and(eq(creditTransactions.bookingId, bookingId), eq(creditTransactions.reason, "consume"))).limit(1);
  if (already.length) return 0;
  const held = await heldByBooking(db, bookingId);
  for (const h of held) {
    await db.insert(creditTransactions).values({ personId: h.personId, lotId: h.lotId, delta: 0, reason: "consume", bookingId, createdBy: createdBy ?? null, note: `${h.held} credit(s) used`, createdAt: now });
  }
  return held.reduce((n, h) => n + h.held, 0);
}
/** Nightly: zero out lots that have passed their expiry date. Returns how many lots expired. */
export async function expireLots(db: Tx, now = new Date()) {
  const due = await db.select().from(creditLots).where(and(lte(creditLots.expiresAt, now), isNull(creditLots.expiredAt))).orderBy(asc(creditLots.expiresAt));
  for (const lot of due) {
    if (lot.creditsRemaining > 0) {
      await db.insert(creditTransactions).values({ personId: lot.personId, lotId: lot.id, delta: -lot.creditsRemaining, reason: "expire", createdAt: now });
    }
    await db.update(creditLots).set({ creditsRemaining: 0, expiredAt: now }).where(eq(creditLots.id, lot.id));
  }
  return due.length;
}
