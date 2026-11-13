# Raleigh School of Ballet — Studio Platform + Website

> **Instructions for Claude Code:** Build the application described in this spec. Work in the phases listed in §14, committing after each phase. Ask before making changes to any decision marked **(confirm with studio)**. Use TypeScript everywhere, keep business rules in server-side code (never trust the client), and store all money as integer cents. All dates/times are in the studio's timezone: `America/New_York`.

---

## 1. Background

The Raleigh School of Ballet (raleighballet.com) currently runs on an old WordPress site (Twenty Thirteen child theme) plus a patchwork of manual processes:

- **SignUpGenius** to see who signs up for classes/programs
- **Paper sign-in sheet** at the studio
- **Manual emails** to anyone who signed up but didn't sign in, asking whether they attended. If they reply "didn't attend" → no fee. If no reply → they get charged.
- **Spreadsheets** to track students, payments, credits, attendance
- **Payments** come in as cash, credit card, and PayPal, tracked by hand
- ~10% of attendees never sign in, so some people take class for free
- Students can't see their own classes, credits, or history
- The schedule changes every month (different dates and times)

**Goal:** one web app on raleighballet.com that is both the public website and the full studio system — signup, booking, check-in, payments, attendance follow-up, messaging, and admin — so almost nothing is manual.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, React Server Components + Server Actions |
| UI | Tailwind CSS + shadcn/ui, mobile-first (front desk uses a tablet, most users on phones) |
| DB / Auth / Storage | Supabase (Postgres, Supabase Auth with email magic link + password, Row Level Security, Storage for images) |
| ORM / queries | Drizzle ORM (or Supabase client with generated types) |
| Card payments | Stripe: Checkout / Payment Element, saved payment methods (SetupIntent), off-session PaymentIntents for no-show charges, Stripe Billing subscriptions for monthly tuition, webhooks |
| PayPal | PayPal REST Orders API + JS SDK buttons (one-time purchases). If the studio's Stripe account supports PayPal as a payment method, prefer that instead **(confirm with studio)** |
| Email | Resend + React Email templates |
| SMS (optional, phase 6) | Twilio |
| Scheduled jobs | Vercel Cron hitting protected API routes (`CRON_SECRET`) |
| QR codes | `qrcode` npm package to generate; tablet scanner via `@zxing/browser` or `html5-qrcode` |
| Hosting | Vercel; point raleighballet.com DNS to Vercel at launch |
| Testing | Vitest for business logic, Playwright for key flows |

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `RESEND_API_KEY`, `TWILIO_*` (optional), `CRON_SECRET`, `APP_URL`.

---

## 3. Roles & permissions

| Role | Can do |
|---|---|
| **Public** (not logged in) | View website, schedule, programs, prices; create account; join mailing list |
| **Student** (adult, 18+) | Manage own profile; buy class cards; book/cancel classes; see credits, upcoming classes, attendance history, payments/receipts; show check-in QR; respond to attendance follow-ups; manage saved card |
| **Parent/Guardian** | Everything a student can do, for each child in their household; enroll children in monthly series; manage tuition autopay. A parent can also be an adult student themselves |
| **Instructor** | See rosters for their classes; mark attendance; add walk-ins; no financial data |
| **Desk** (front-desk tablet login) | Check-in screen for today's classes; scan QR; search people; record cash/PayPal-in-person sales; add walk-ins; no reports or settings |
| **Admin** (owner) | Everything: schedule, people, payments, overrides, refunds, messaging, website content, settings, reports, imports |

Enforce with Supabase RLS policies **and** server-side checks. A user can hold multiple roles (e.g., instructor + parent).

---

## 4. Public website (replaces WordPress)

Rebuild the existing site's content as pages editable by Admin (simple CMS: pages table with title, slug, rich-text/markdown body, hero image, published flag; Admin edits in-app).

Navigation (mirror the current site, cleaned up):

- **Home** — hero, tagline "Professional Training in Classical Ballet for Children and Adults", CTA buttons: *Book an adult class*, *Enroll your child*, upcoming classes preview, news
- **About** — History, Programs, Faculty (instructor profiles with photos), Facility, Directions/Map
- **Children's Program** (under 18) — Academic Year, Summer, Class Schedule (live), Calendar, Dress Code, School Rules, Performance info, Parent Information, *Enroll* CTA
- **Adult Classes** — In-studio classes, Summer classes & workshops, Studio Protocol/Policy (incl. cancellation policy), Class Cards & Pricing (buy online), *Book* CTA
- **Schedule** — live calendar/list pulled from the DB, filterable by program/level/instructor, shows spots left, "Book" buttons
- **News** — admin-posted articles
- **Contact** — phone (919-834-9261), contact form (emails admin + saved in DB), office hours, map, social links (Facebook, Instagram)
- **Mailing list signup** in footer → creates a `contact` record with `mailing_list = true`
- Link to Raleigh Dance Theatre (external)

SEO: proper titles/meta, OpenGraph, sitemap.xml, 301 redirects from old WordPress URLs to new slugs (build a redirect map).

---

## 5. Data model (Postgres)

Use UUID primary keys, `created_at`/`updated_at` on every table. Money = integer cents. Soft-delete via `archived_at` where noted.

### People & accounts
- **households** — id, name, primary_contact_person_id, notes
- **people** — id, household_id, auth_user_id (nullable; children usually have none), first_name, last_name, email, phone, date_of_birth, is_minor (computed from DOB; recompute nightly), program_type (`youth` | `adult`), status (`active` | `archived`), archived_at, last_activity_at, emergency_contact, medical_notes, photo_consent, sms_opt_in, email_opt_in, qr_token (random, unique, rotatable), stripe_customer_id (on the household payer), notes
- **user_roles** — user_id, role (`student` | `parent` | `instructor` | `desk` | `admin`)
- **guardianships** — parent_person_id, child_person_id

### Schedule
- **programs** — id, name (e.g. "Children's Academic Year 2026–27", "Adult Classes"), audience (`youth` | `adult` | `all`), billing_model (`tuition` | `credits` | `drop_in` | `workshop_fee`), active
- **class_templates** — id, program_id, name ("Ballet II", "Adult Beginner"), level, default_duration_min, default_capacity, default_instructor_id, default_room, credit_cost (default 1), drop_in_price_cents, color, description, min_age, max_age
- **class_sessions** — id, template_id, starts_at, ends_at, instructor_id, room, capacity, status (`scheduled` | `cancelled` | `completed`), cancellation_reason, series_id (nullable), apply_no_show_policy (bool, default true for adult, false for youth tuition), notes
  - Every class is an individual dated session — **schedules change monthly**, so never assume a fixed weekly pattern.
- **series** — id, template_id, name ("December Ballet II"), month (date), price_cents (or included in tuition plan), enrollment_open (bool), capacity — groups sessions for monthly youth enrollment

### Booking & attendance
- **bookings** — id, session_id, person_id, booked_by_user_id, source (`online` | `desk` | `admin` | `series_enrollment` | `import`), status (`booked` | `cancelled` | `late_cancelled` | `checked_in` | `pending_confirmation` | `attended_confirmed` | `no_show_excused` | `no_show_charged`), payment_method_for_booking (`credit` | `tuition` | `card_on_file` | `paid_at_desk` | `comp`), credit_txn_id, cancelled_at, checked_in_at, checked_in_by, checkin_method (`qr` | `tablet_search` | `instructor_roster` | `admin` | `followup_reply`), followup_sent_at, followup_response (`attended` | `did_not_attend` | null), followup_responded_at, charge_payment_id, override_by, override_reason
  - Unique (session_id, person_id) where status not cancelled
- **waitlist_entries** — session_id, person_id, position, notified_at, status
- **series_enrollments** — id, series_id, person_id, status (`active` | `withdrawn`), enrolled_at; enrolling creates bookings for every session in the series
- **session_headcounts** — session_id, instructor_count, entered_by, entered_at (for leak detection)

### Credits (adult class cards)
- **products** — id, type (`class_card` | `drop_in` | `tuition_plan` | `workshop` | `merch`), name ("10-Class Card"), price_cents, credits (int, for class cards), validity_days (nullable = never expires), audience, active, stripe_price_id, sort_order
- **credit_lots** — id, person_id (or household_id if credits are shareable — **confirm with studio**), product_id, payment_id, credits_total, credits_remaining, purchased_at, expires_at
- **credit_transactions** (append-only ledger) — id, person_id, lot_id, delta (+/-), reason (`purchase` | `booking_reserve` | `booking_release` | `consume` | `expire` | `admin_adjust` | `import`), booking_id, created_by, note
  - Balance = sum of non-expired lots' `credits_remaining`. Always deduct from the **soonest-expiring** lot first (FIFO by expires_at).

### Tuition (youth monthly)
- **tuition_plans** — id, name ("Ballet II monthly"), amount_cents, billing_day (e.g. 1st), stripe_price_id, sibling_discount_pct
- **subscriptions** — id, household_id, person_id (child), plan_id, status (`active` | `past_due` | `paused` | `cancelled`), stripe_subscription_id, payment_method (`card_autopay` | `manual_cash` | `manual_paypal` | `manual_check`), started_at, ended_at
- **invoices** — id, household_id, subscription_id, period_month, amount_cents, status (`open` | `paid` | `void` | `overdue`), due_date, paid_at, payment_id, stripe_invoice_id
  - Manual payers (cash/PayPal/check) still get an invoice each month; Desk/Admin marks it paid by recording a payment.

### Payments (single ledger for every dollar)
- **payments** — id, household_id, person_id, amount_cents, method (`card` | `paypal` | `cash` | `check` | `comp`), status (`pending` | `succeeded` | `failed` | `refunded` | `partially_refunded`), purpose (`class_card` | `drop_in` | `tuition` | `no_show_fee` | `late_cancel_fee` | `workshop` | `other`), product_id, invoice_id, booking_id, stripe_payment_intent_id, paypal_order_id, recorded_by (user who took cash), received_at, note, receipt_number
- **refunds** — id, payment_id, amount_cents, reason, processed_by, stripe_refund_id
- **cash_drawer_closes** — id, date, expected_cash_cents (from payments), counted_cash_cents, difference_cents, closed_by, note

### Messaging
- **message_campaigns** — id, subject, body (markdown/rich text), channel (`email` | `sms` | `both`), audience_filter (JSON: see §9), scheduled_for, sent_at, created_by, status
- **messages** — id, campaign_id (nullable for automated), person_id, channel, template_key (for automated), to_address, status (`queued` | `sent` | `delivered` | `bounced` | `failed`), provider_id, sent_at, opened_at
- **contacts** (mailing-list-only people without accounts can just be `people` rows with no auth user; use one table)

### Website & settings
- **pages** — id, slug, title, body, hero_image_url, nav_section, sort_order, published, seo_title, seo_description
- **news_posts** — id, title, slug, body, image_url, published_at
- **instructors** — person_id, bio, photo_url, display_on_site
- **settings** (single row / key-value) — see §11
- **audit_log** — id, actor_user_id, action, entity, entity_id, before (json), after (json), created_at — log every override, refund, adjustment, charge, archive/unarchive

---

## 6. Core flows

### 6.1 Account creation
- Sign up with email + password or magic link. Ask: "Who is this account for?" → *Myself (18+)* / *My child(ren)* / *Both*.
- Parents add children (name, DOB, emergency contact, medical notes, photo consent).
- Collect waiver/policy acceptance (checkbox with version + timestamp stored).
- Prompt to save a card (Stripe SetupIntent) — required for adults booking with the no-show policy unless they pay at the desk **(confirm with studio)**.

### 6.2 Adult: buy class card
- Products page → choose card → pay by card (Stripe) or PayPal → on success (webhook-confirmed, never client-confirmed), create `payment`, `credit_lot`, `credit_transaction(+N)`, email receipt.
- At desk: Desk records a cash/PayPal/card-reader sale → same records with `method = cash` etc. and `recorded_by`.

### 6.3 Adult: book a class
1. Student views Schedule → taps class → sees spots left, credit cost, cancellation cutoff time.
2. If credit balance ≥ cost → **reserve** credits (`booking_reserve`, lot.credits_remaining decremented) → booking `booked`.
3. If no credits → offer: buy a card, or pay drop-in now, or (if allowed) "charge my card on file after class".
4. If full → join waitlist; when a spot frees, auto-notify next person and give them X hours to claim (or auto-book if they opted in).
5. Confirmation email with calendar (.ics) attachment and cancel link.

### 6.4 Cancellation window
- Setting: `cancellation_cutoff_hours` (default 12).
- Cancel **before** cutoff → booking `cancelled`, credit `booking_release` (+1 back), or drop-in refunded to card.
- Cancel **after** cutoff → booking `late_cancelled`, credit consumed (no refund). Optional `late_cancel_fee_cents` charged to card on file instead/in addition **(confirm with studio)**.
- Reminder sent `reminder_hours_before` (default 24) before class: "Can't make it? Cancel free until {cutoff time}."
- If the **studio** cancels a session: all bookings released, credits returned, drop-ins refunded, everyone notified automatically.

### 6.5 Check-in (door tablet)
- Desk route `/desk` (stays logged in on the tablet, auto-locks to PIN after inactivity).
- Shows today's sessions; select one → roster with booked people.
- Check in by: scanning the person's QR (from their account / Apple-Google Wallet pass optional later), or tapping their name, or searching.
- On check-in: booking → `checked_in`; reserved credit → `consume`. Screen shows a clear result:
  - Adult: "✓ Jane Doe — 1 credit used, 4 left (expire Mar 3)"
  - Youth: "✓ Emma Smith — Enrolled (December Ballet II)" and a warning badge if tuition is overdue
  - Not booked: "Not booked for this class" → buttons: *Book with credit*, *Sell drop-in (cash/card/PayPal)*, *Comp (admin PIN)*
- Walk-ins: create person quickly (name + email/phone) → sell drop-in → checked in.

### 6.6 Instructor roster + headcount (closes the 10% leak)
- Instructor view `/instructor` lists their sessions; during class they open the roster and tap who's present (marks `checked_in` with method `instructor_roster`).
- After class the instructor enters a **headcount**. If headcount > number checked in → session flagged "⚠ Unaccounted attendees: 2" on admin dashboard.

### 6.7 Post-class attendance follow-up (automates the current manual emails)
Cron runs every 15 min:
1. For sessions that ended ≥ `followup_delay_minutes` (default 60) ago with `apply_no_show_policy = true`: every booking still `booked` (never checked in, not cancelled) → status `pending_confirmation`, send follow-up email/SMS:
   > "We didn't see you check in to **{class} on {date} at {time}**. Did you attend?"
   > **[I attended]** **[I didn't attend]**
   - Buttons are signed one-click links (JWT/HMAC token, no login required, single use, expire after response window).
2. Responses:
   - **I attended** → `attended_confirmed`; credit consumed / drop-in charged normally.
   - **I didn't attend** → `no_show_excused`; credit released, no charge (matches studio's current policy). Track count per person; flag people who use it often (`excused_no_show_flag_threshold`, e.g. 3 in 60 days) for admin review **(confirm with studio whether to cap free excuses)**.
3. No response after `followup_response_hours` (default 48) → `no_show_charged`: credit consumed, or if no credits, charge `no_show_fee_cents` (or the drop-in price) to card on file via off-session PaymentIntent. If the card fails → payment `failed`, add to "Balances owed" list, email the person a pay link.
4. Admin can override any outcome with one tap (logged in audit_log), including refunding.
- Youth tuition sessions: no charge; attendance is recorded as absent. Optional absence notice to parent (setting).

### 6.8 Youth: monthly enrollment & tuition
- Admin creates the month's **series** (e.g. "December Ballet II" = the 6 actual December dates).
- Parent enrolls a child in a series (or admin enrolls them). Re-enrollment for next month: by default auto-carry over active enrollments into the matching next-month series when Admin publishes it; parents get a notice with the new dates and can withdraw before a deadline **(confirm with studio)**.
- Billing: tuition plan per child via Stripe subscription (autopay on `billing_day`), sibling discount supported. Manual payers get an open invoice; Desk/Admin records the cash/PayPal/check payment against it.
- Failed/overdue: Stripe smart retries + reminder emails at +3 and +7 days; status `past_due` shows on the check-in tablet and admin dashboard.
- Make-up classes: if a child misses a class, admin (or parent, if allowed) can book a make-up in another session of the same level within `makeup_window_days`.

### 6.9 Schedule management (changes every month)
- Admin calendar view (month/week) at `/admin/schedule`.
- **Copy last month**: pick a source month → generates draft sessions for the target month shifted to matching weekdays → admin edits (drag to move, click to edit time/instructor/capacity, delete, add one-offs) → **Publish** (drafts are invisible to the public until published).
- Bulk add: "Every Tue & Thu 6–7:30pm in December except Dec 24" generator.
- Editing a published session with bookings → confirm dialog → automatically notify all booked people of the change. Deleting/cancelling → §6.4 studio-cancel rules.
- Holidays/closures list in settings blocks generation on those dates.

### 6.10 Automatic archiving
- Nightly cron: any person with `status = active` whose `last_activity_at` (latest of: booking, check-in, enrollment, payment, login) is older than `archive_after_days` (default 180) → `status = archived`, `archived_at = now`. Active tuition subscribers and people with unexpired credits are **never** auto-archived.
- Archived people: hidden from default lists/rosters/search (toggle to show), excluded from "all active" messaging, but targetable as the **Archived** audience (win-back campaigns).
- Any new booking/purchase/enrollment/login → automatically reactivated.
- Admin can manually archive/unarchive.

### 6.11 Credit expiration
- Nightly cron: lots past `expires_at` with credits remaining → `expire` transaction. Send "your credits expire in 7 days" reminder beforehand (`credit_expiry_reminder_days`).

---

## 7. Student / parent portal (`/account`)

- **Dashboard**: next upcoming class with cancel button; credit balance with expiration breakdown; tuition status ("December paid ✓" / "Due Dec 1"); any action needed (unanswered follow-up, failed payment).
- **My classes**: upcoming (cancel/rebook) and past (attended / excused / no-show charged / late cancel).
- **Credits**: lots, expirations, full transaction history.
- **Payments**: all payments with downloadable receipts (PDF), saved card management, tuition autopay settings.
- **Check-in QR**: large QR code; "Add to Apple/Google Wallet" is a later nice-to-have.
- **Family**: parents switch between children; add a child.
- **Profile & notifications**: contact info, emergency contact, email/SMS preferences.

---

## 8. Admin (`/admin`)

- **Dashboard (today)**: today's classes with booked/checked-in/headcount, flags (unaccounted attendees, pending follow-ups, failed payments, overdue tuition), today's revenue by method.
- **Schedule**: §6.9.
- **People**: searchable/filterable list (active/archived, youth/adult, program, balance, tuition status); person detail page with everything: bookings, attendance, credits, payments, messages, notes, audit history; actions: adjust credits (with reason), comp a class, refund, record payment, merge duplicates, archive.
- **Payments**: unified ledger of all payments (filter by date, method, purpose); refunds; **daily cash drawer close** (expected vs counted).
- **Tuition**: month view of every enrolled child: paid / due / overdue / manual; mark paid; send reminders.
- **Follow-ups**: queue of `pending_confirmation` bookings with countdown, response status, one-tap override.
- **Messaging**: §9.
- **Products & pricing**: class cards, drop-in price, tuition plans, fees.
- **Website**: edit pages, news, faculty, homepage hero, images.
- **Reports** (CSV export on every table/report): revenue by method/purpose/month; attendance by class/instructor; no-show & late-cancel rates; credits outstanding (liability); active vs archived counts; class fill rates; instructor session counts (for payroll).
- **Import**: §10.
- **Settings**: §11.
- **Users & roles**: invite instructors/desk/admins.

---

## 9. Messaging

- Compose email (rich text, merge tags `{first_name}`, `{class_name}`, `{credits_remaining}`...) and/or SMS.
- **Audience builder** (saved as JSON filter): all active; all parents; all adults; specific program/level; everyone booked in a specific session or series; adults with credits expiring in N days; adults with 0 credits; overdue tuition; archived; mailing list only; custom selection. Show recipient count before sending.
- Schedule send or send now; preview + test send to self.
- Respect opt-outs; unsubscribe link in every marketing email (transactional emails always send).
- Log every message per person (visible on their profile).

**Automated messages** (each editable template, toggle on/off in settings):
welcome, booking confirmation (+ .ics), booking cancelled, class reminder (with free-cancel deadline), waitlist spot available, studio cancelled/changed a class, attendance follow-up, no-show charged receipt, payment receipt, payment failed, tuition upcoming/overdue, credits expiring, new month schedule published / series re-enrollment notice, archived win-back (optional).

---

## 10. Spreadsheet import (migration)

- `/admin/import`: upload CSV/XLSX → column-mapping screen (map their headers to fields) → preview with validation errors → import.
- Importable: people/households (with parent-child linking), current credit balances (creates an `import` lot with optional expiry), tuition status, past attendance (optional), mailing list.
- Dedupe by email/phone; show possible duplicates for merge.
- Every imported row tagged `source = import` with batch id; allow rollback of a whole batch.

---

## 11. Settings (all admin-editable, with these defaults)

| Key | Default |
|---|---|
| cancellation_cutoff_hours | 12 |
| late_cancel_fee_cents | 0 (credit consumed only) |
| no_show_fee_cents | drop-in price |
| reminder_hours_before | 24 |
| followup_delay_minutes | 60 |
| followup_response_hours | 48 |
| excused_no_show_flag_threshold | 3 in 60 days |
| archive_after_days | 180 |
| credit_expiry_reminder_days | 7 |
| waitlist_claim_hours | 4 |
| makeup_window_days | 30 |
| require_card_on_file_for_adults | true |
| tuition_billing_day | 1 |
| studio_timezone | America/New_York |
| closures/holidays | list of dates |
| studio info | name, address, phone, email, social links, logo |

---

## 12. Scheduled jobs (Vercel Cron → `/api/cron/*`, protected by `CRON_SECRET`, idempotent)

| Job | Frequency |
|---|---|
| class reminders | every 15 min |
| attendance follow-ups (send + resolve no-response charges) | every 15 min |
| waitlist expiry/advance | every 15 min |
| credit expiration + expiry reminders | nightly |
| auto-archive + recompute is_minor | nightly |
| tuition overdue reminders (manual payers) | daily |
| scheduled campaign sends | every 5 min |

Stripe webhooks (`/api/webhooks/stripe`): payment_intent.succeeded/failed, checkout.session.completed, invoice.paid/payment_failed, customer.subscription.updated/deleted, charge.refunded. PayPal webhooks for order capture/refund. All handlers idempotent (store processed event IDs).

---

## 13. Non-functional requirements

- Mobile-first, accessible (WCAG AA), fast check-in (scan → result < 1s).
- Desk tablet should tolerate brief Wi-Fi drops: queue check-ins locally and sync (nice-to-have; at minimum show clear errors).
- Never store raw card data (Stripe/PayPal handle it).
- All money changes and overrides go through server actions and are written to `audit_log`.
- Minors' data: only guardians, instructors of their classes, and admin can see it; medical notes visible to admin + their instructors only.
- Seed script with realistic fake data (households, kids, adults, a month of sessions, bookings, payments) for development and demos.
- Unit tests for: credit reservation/consumption/expiry FIFO, cancellation window logic, follow-up state machine, archiving rules, tuition invoice status.

---

## 14. Build phases

1. **Foundation** — Next.js + Supabase setup, auth, roles, RLS, data model + migrations, seed data, base layout/design system.
2. **Schedule & public site** — admin schedule (sessions, copy-month, publish), public website pages + CMS, live schedule page, redirects from old URLs.
3. **Adult booking & credits** — products, Stripe + PayPal checkout, credit lots/ledger, booking, cancellation window, waitlist, student portal.
4. **Check-in & attendance** — desk tablet, QR, walk-ins/cash sales, instructor roster + headcount, follow-up automation + no-show charging, admin follow-up queue.
5. **Youth tuition** — households/guardians, series enrollment, Stripe subscriptions, manual invoices, overdue handling, make-ups.
6. **Messaging & automation** — campaigns, audience builder, automated templates, SMS, archiving, credit expiry.
7. **Admin reporting & import** — dashboard, reports, cash drawer close, spreadsheet import, audit log viewer.
8. **Launch** — content migration from WordPress, import real data, staff training mode, DNS cutover.

---

## 15. Open questions for the studio (defaults above are placeholders)

1. Exact cancellation cutoff (hours before class)?
2. No-show: just lose the credit, or also charge a fee? How much? Same for late cancels?
3. Should "I didn't attend" excuses be limited (e.g. 3 per term)?
4. Class card sizes, prices, and expiration rules? Can credits be shared within a family?
5. Youth tuition: price per class level? Sibling discount? Billed monthly on which day? Prorated for mid-month joins?
6. Do kids auto-continue month to month, or must parents re-enroll each month?
7. Are adults required to keep a card on file, or can they pay cash at the door?
8. Is the archive period definitely 6 months? Are archived people ever deleted?
9. Which payment processors/accounts do they already have (Stripe? Square? PayPal Business)?
10. Do instructors need payroll reports (classes taught / headcount)?
11. Workshops/summer intensives: separate one-time fees?
12. Any waivers/forms students must sign?
