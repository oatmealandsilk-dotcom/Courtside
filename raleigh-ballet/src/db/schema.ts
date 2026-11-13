/**
 * The whole database, in one file.
 *
 * Each `pgTable` below is one table (think: one spreadsheet tab). Money is
 * always whole cents (integers), never dollars with decimals. Times are stored
 * as absolute instants (timestamptz) and shown in the studio's timezone.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const stamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ───────────────────────── People & accounts ───────────────────────── */

export const households = pgTable("households", {
  id: id(),
  name: text("name").notNull(),
  primaryContactPersonId: uuid("primary_contact_person_id"),
  notes: text("notes"),
  importBatchId: uuid("import_batch_id"),
  ...stamps,
});

export const PROGRAM_TYPES = ["youth", "adult"] as const;
export const PERSON_STATUSES = ["active", "archived"] as const;

export const people = pgTable(
  "people",
  {
    id: id(),
    householdId: uuid("household_id").references(() => households.id),
    /** The Supabase Auth user id. Children usually have none. */
    authUserId: uuid("auth_user_id").unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth"),
    isMinor: boolean("is_minor").notNull().default(false),
    programType: text("program_type", { enum: PROGRAM_TYPES }).notNull().default("adult"),
    status: text("status", { enum: PERSON_STATUSES }).notNull().default("active"),
    archivedAt: ts("archived_at"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    emergencyContact: text("emergency_contact"),
    medicalNotes: text("medical_notes"),
    photoConsent: boolean("photo_consent").notNull().default(false),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    emailOptIn: boolean("email_opt_in").notNull().default(true),
    mailingList: boolean("mailing_list").notNull().default(false),
    qrToken: text("qr_token")
      .notNull()
      .unique()
      .default(sql`encode(gen_random_bytes(16), 'hex')`),
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    waitlistAutoBook: boolean("waitlist_auto_book").notNull().default(false),
    notes: text("notes"),
    source: text("source").notNull().default("signup"),
    importBatchId: uuid("import_batch_id"),
    mergedIntoId: uuid("merged_into_id"),
    ...stamps,
  },
  (t) => [
    index("people_household_idx").on(t.householdId),
    index("people_email_idx").on(sql`lower(${t.email})`),
    index("people_status_idx").on(t.status),
  ],
);

export const ROLES = ["student", "parent", "instructor", "desk", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const guardianships = pgTable(
  "guardianships",
  {
    parentPersonId: uuid("parent_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    childPersonId: uuid("child_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.parentPersonId, t.childPersonId] })],
);

/** Waiver / policy acceptance: which version, when, by whom. */
export const policyAcceptances = pgTable("policy_acceptances", {
  id: id(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  acceptedByUserId: uuid("accepted_by_user_id"),
  policyKey: text("policy_key").notNull().default("waiver"),
  version: text("version").notNull(),
  acceptedAt: ts("accepted_at").notNull().defaultNow(),
});

/** Invitations for staff (instructor / desk / admin) — claimed at first sign-in by email. */
export const staffInvites = pgTable("staff_invites", {
  id: id(),
  email: text("email").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  invitedBy: uuid("invited_by"),
  claimedAt: ts("claimed_at"),
  ...stamps,
});

/* ───────────────────────────── Schedule ───────────────────────────── */

export const AUDIENCES = ["youth", "adult", "all"] as const;
export const BILLING_MODELS = ["tuition", "credits", "drop_in", "workshop_fee"] as const;

export const programs = pgTable("programs", {
  id: id(),
  name: text("name").notNull(),
  audience: text("audience", { enum: AUDIENCES }).notNull(),
  billingModel: text("billing_model", { enum: BILLING_MODELS }).notNull(),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const classTemplates = pgTable("class_templates", {
  id: id(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id),
  name: text("name").notNull(),
  level: text("level"),
  defaultDurationMin: integer("default_duration_min").notNull().default(90),
  defaultCapacity: integer("default_capacity").notNull().default(20),
  defaultInstructorId: uuid("default_instructor_id").references(() => people.id),
  defaultRoom: text("default_room"),
  creditCost: integer("credit_cost").notNull().default(1),
  dropInPriceCents: integer("drop_in_price_cents").notNull().default(0),
  color: text("color").notNull().default("#b5546c"),
  description: text("description"),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const series = pgTable("series", {
  id: id(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => classTemplates.id),
  name: text("name").notNull(),
  /** First day of the month this series covers. */
  month: date("month").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  tuitionPlanId: uuid("tuition_plan_id"),
  enrollmentOpen: boolean("enrollment_open").notNull().default(false),
  withdrawDeadline: date("withdraw_deadline"),
  capacity: integer("capacity").notNull().default(20),
  ...stamps,
});

export const SESSION_STATUSES = ["draft", "scheduled", "cancelled", "completed"] as const;

/** Every class is its own dated row — the schedule changes monthly, so nothing assumes a weekly pattern. */
export const classSessions = pgTable(
  "class_sessions",
  {
    id: id(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => classTemplates.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    instructorId: uuid("instructor_id").references(() => people.id),
    room: text("room"),
    capacity: integer("capacity").notNull(),
    status: text("status", { enum: SESSION_STATUSES }).notNull().default("draft"),
    cancellationReason: text("cancellation_reason"),
    seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
    applyNoShowPolicy: boolean("apply_no_show_policy").notNull().default(true),
    notes: text("notes"),
    reminderSentAt: ts("reminder_sent_at"),
    followupProcessedAt: ts("followup_processed_at"),
    ...stamps,
  },
  (t) => [index("sessions_starts_idx").on(t.startsAt), index("sessions_series_idx").on(t.seriesId)],
);

/* ─────────────────────── Booking & attendance ─────────────────────── */

export const BOOKING_STATUSES = [
  "booked",
  "cancelled",
  "late_cancelled",
  "checked_in",
  "pending_confirmation",
  "attended_confirmed",
  "no_show_excused",
  "no_show_charged",
  "absent", // youth / no-policy sessions: recorded as absent, never charged
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Statuses that hold a spot in the class. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "booked",
  "checked_in",
  "pending_confirmation",
  "attended_confirmed",
  "no_show_excused",
  "no_show_charged",
  "absent",
];
export const BOOKING_SOURCES = ["online", "desk", "admin", "series_enrollment", "import", "waitlist", "makeup"] as const;
export const BOOKING_PAY_METHODS = ["credit", "tuition", "card_on_file", "paid_online", "paid_at_desk", "comp"] as const;
export const CHECKIN_METHODS = ["qr", "tablet_search", "instructor_roster", "admin", "followup_reply"] as const;

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    bookedByUserId: uuid("booked_by_user_id"),
    source: text("source", { enum: BOOKING_SOURCES }).notNull().default("online"),
    status: text("status", { enum: BOOKING_STATUSES }).notNull().default("booked"),
    paymentMethodForBooking: text("payment_method_for_booking", { enum: BOOKING_PAY_METHODS }).notNull(),
    creditCost: integer("credit_cost").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    creditTxnId: uuid("credit_txn_id"),
    cancelledAt: ts("cancelled_at"),
    checkedInAt: ts("checked_in_at"),
    checkedInBy: uuid("checked_in_by"),
    checkinMethod: text("checkin_method", { enum: CHECKIN_METHODS }),
    followupSentAt: ts("followup_sent_at"),
    followupResponse: text("followup_response", { enum: ["attended", "did_not_attend"] }),
    followupRespondedAt: ts("followup_responded_at"),
    chargePaymentId: uuid("charge_payment_id"),
    overrideBy: uuid("override_by"),
    overrideReason: text("override_reason"),
    makeupForBookingId: uuid("makeup_for_booking_id"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("bookings_one_live_per_person")
      .on(t.sessionId, t.personId)
      .where(sql`status not in ('cancelled','late_cancelled')`),
    index("bookings_person_idx").on(t.personId),
    index("bookings_status_idx").on(t.status),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    position: integer("position").notNull(),
    notifiedAt: ts("notified_at"),
    claimExpiresAt: ts("claim_expires_at"),
    status: text("status", { enum: ["waiting", "offered", "claimed", "expired", "removed"] })
      .notNull()
      .default("waiting"),
    ...stamps,
  },
  (t) => [index("waitlist_session_idx").on(t.sessionId)],
);

export const seriesEnrollments = pgTable(
  "series_enrollments",
  {
    id: id(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", { enum: ["active", "withdrawn"] }).notNull().default("active"),
    enrolledAt: ts("enrolled_at").notNull().defaultNow(),
    enrolledBy: uuid("enrolled_by"),
    carriedOverFrom: uuid("carried_over_from"),
    ...stamps,
  },
  (t) => [uniqueIndex("series_enrollment_unique").on(t.seriesId, t.personId)],
);

export const sessionHeadcounts = pgTable("session_headcounts", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => classSessions.id, { onDelete: "cascade" }),
  instructorCount: integer("instructor_count").notNull(),
  enteredBy: uuid("entered_by"),
  enteredAt: ts("entered_at").notNull().defaultNow(),
});

/* ───────────────────────── Products & credits ───────────────────────── */

export const PRODUCT_TYPES = ["class_card", "drop_in", "tuition_plan", "workshop", "merch"] as const;

export const products = pgTable("products", {
  id: id(),
  type: text("type", { enum: PRODUCT_TYPES }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  credits: integer("credits").notNull().default(0),
  /** null = never expires */
  validityDays: integer("validity_days"),
  audience: text("audience", { enum: AUDIENCES }).notNull().default("adult"),
  active: boolean("active").notNull().default(true),
  stripePriceId: text("stripe_price_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...stamps,
});

export const creditLots = pgTable(
  "credit_lots",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    productId: uuid("product_id").references(() => products.id),
    paymentId: uuid("payment_id"),
    creditsTotal: integer("credits_total").notNull(),
    creditsRemaining: integer("credits_remaining").notNull(),
    purchasedAt: ts("purchased_at").notNull().defaultNow(),
    expiresAt: ts("expires_at"),
    expiredAt: ts("expired_at"),
    expiryReminderSentAt: ts("expiry_reminder_sent_at"),
    importBatchId: uuid("import_batch_id"),
    ...stamps,
  },
  (t) => [index("lots_person_idx").on(t.personId)],
);

export const CREDIT_REASONS = [
  "purchase",
  "booking_reserve",
  "booking_release",
  "consume",
  "expire",
  "admin_adjust",
  "import",
  "refund",
] as const;

/** Append-only ledger: rows are never edited or deleted. */
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => creditLots.id),
    delta: integer("delta").notNull(),
    reason: text("reason", { enum: CREDIT_REASONS }).notNull(),
    bookingId: uuid("booking_id"),
    createdBy: uuid("created_by"),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("credit_txn_person_idx").on(t.personId), index("credit_txn_booking_idx").on(t.bookingId)],
);

/* ───────────────────────────── Tuition ───────────────────────────── */

export const tuitionPlans = pgTable("tuition_plans", {
  id: id(),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  billingDay: integer("billing_day").notNull().default(1),
  stripePriceId: text("stripe_price_id"),
  siblingDiscountPct: integer("sibling_discount_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const SUBSCRIPTION_STATUSES = ["active", "past_due", "paused", "cancelled"] as const;
export const SUBSCRIPTION_METHODS = ["card_autopay", "manual_cash", "manual_paypal", "manual_check"] as const;

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => tuitionPlans.id),
    status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull().default("active"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    paymentMethod: text("payment_method", { enum: SUBSCRIPTION_METHODS }).notNull().default("manual_cash"),
    discountPct: integer("discount_pct").notNull().default(0),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    ...stamps,
  },
  (t) => [index("subs_household_idx").on(t.householdId)],
);

export const INVOICE_STATUSES = ["open", "paid", "void", "overdue"] as const;

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    personId: uuid("person_id").references(() => people.id),
    periodMonth: date("period_month").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("open"),
    dueDate: date("due_date").notNull(),
    paidAt: ts("paid_at"),
    paymentId: uuid("payment_id"),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderAt: ts("last_reminder_at"),
    ...stamps,
  },
  (t) => [uniqueIndex("invoice_sub_month").on(t.subscriptionId, t.periodMonth)],
);

/* ───────────────────────────── Payments ───────────────────────────── */

export const receiptSeq = pgSequence("receipt_seq", { startWith: 1001 });

export const PAYMENT_METHODS = ["card", "paypal", "cash", "check", "comp"] as const;
export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded", "partially_refunded"] as const;
export const PAYMENT_PURPOSES = [
  "class_card",
  "drop_in",
  "tuition",
  "no_show_fee",
  "late_cancel_fee",
  "workshop",
  "other",
] as const;

/** One row for every dollar that comes in, however it was paid. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    householdId: uuid("household_id").references(() => households.id),
    personId: uuid("person_id").references(() => people.id),
    amountCents: integer("amount_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("pending"),
    purpose: text("purpose", { enum: PAYMENT_PURPOSES }).notNull(),
    productId: uuid("product_id").references(() => products.id),
    invoiceId: uuid("invoice_id"),
    bookingId: uuid("booking_id"),
    /** For a drop-in bought online: the class it is for (booked when the payment succeeds). */
    sessionId: uuid("session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    paypalOrderId: text("paypal_order_id").unique(),
    paypalCaptureId: text("paypal_capture_id"),
    recordedBy: uuid("recorded_by"),
    receivedAt: ts("received_at"),
    fulfilledAt: ts("fulfilled_at"),
    failureReason: text("failure_reason"),
    note: text("note"),
    receiptNumber: text("receipt_number").unique(),
    ...stamps,
  },
  (t) => [index("payments_person_idx").on(t.personId), index("payments_received_idx").on(t.receivedAt)],
);

export const refunds = pgTable("refunds", {
  id: id(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  processedBy: uuid("processed_by"),
  stripeRefundId: text("stripe_refund_id").unique(),
  paypalRefundId: text("paypal_refund_id").unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const cashDrawerCloses = pgTable("cash_drawer_closes", {
  id: id(),
  date: date("date").notNull().unique(),
  expectedCashCents: integer("expected_cash_cents").notNull(),
  countedCashCents: integer("counted_cash_cents").notNull(),
  differenceCents: integer("difference_cents").notNull(),
  closedBy: uuid("closed_by"),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Webhook events already handled, so a repeat delivery does nothing. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type"),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

/* ───────────────────────────── Messaging ───────────────────────────── */

export const CHANNELS = ["email", "sms", "both"] as const;

export const messageCampaigns = pgTable("message_campaigns", {
  id: id(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  smsBody: text("sms_body"),
  channel: text("channel", { enum: CHANNELS }).notNull().default("email"),
  audienceFilter: jsonb("audience_filter").notNull().$type<Record<string, unknown>>(),
  scheduledFor: ts("scheduled_for"),
  sentAt: ts("sent_at"),
  recipientCount: integer("recipient_count"),
  createdBy: uuid("created_by"),
  status: text("status", { enum: ["draft", "scheduled", "sending", "sent", "cancelled"] })
    .notNull()
    .default("draft"),
  ...stamps,
});

export const messages = pgTable(
  "messages",
  {
    id: id(),
    campaignId: uuid("campaign_id").references(() => messageCampaigns.id),
    personId: uuid("person_id").references(() => people.id),
    channel: text("channel", { enum: ["email", "sms"] }).notNull(),
    templateKey: text("template_key"),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    body: text("body"),
    status: text("status", { enum: ["queued", "sent", "delivered", "bounced", "failed", "skipped"] })
      .notNull()
      .default("queued"),
    providerId: text("provider_id"),
    error: text("error"),
    /** Stops the same automated message going out twice (e.g. one reminder per booking). */
    dedupeKey: text("dedupe_key").unique(),
    sentAt: ts("sent_at"),
    openedAt: ts("opened_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_person_idx").on(t.personId), index("messages_campaign_idx").on(t.campaignId)],
);

/** Admin-edited wording for the automated messages. Missing rows use the built-in default. */
export const messageTemplates = pgTable("message_templates", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  smsBody: text("sms_body"),
  enabled: boolean("enabled").notNull().default(true),
  ...stamps,
});

/* ─────────────────────── Website & settings ─────────────────────── */

export const pages = pgTable("pages", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  heroImageUrl: text("hero_image_url"),
  navSection: text("nav_section"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ...stamps,
});

export const newsPosts = pgTable("news_posts", {
  id: id(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url"),
  publishedAt: ts("published_at"),
  ...stamps,
});

export const instructors = pgTable("instructors", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => people.id, { onDelete: "cascade" }),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  title: text("title"),
  displayOnSite: boolean("display_on_site").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...stamps,
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const contactSubmissions = pgTable("contact_submissions", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message").notNull(),
  handledAt: ts("handled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const importBatches = pgTable("import_batches", {
  id: id(),
  kind: text("kind").notNull(),
  fileName: text("file_name"),
  rowCount: integer("row_count").notNull().default(0),
  createdBy: uuid("created_by"),
  rolledBackAt: ts("rolled_back_at"),
  summary: jsonb("summary"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Person = typeof people.$inferSelect;
export type Household = typeof households.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type ClassTemplate = typeof classTemplates.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Product = typeof products.$inferSelect;
export type CreditLot = typeof creditLots.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Series = typeof series.$inferSelect;
