# Handoff — Raleigh School of Ballet studio platform

Read this first, then `SPEC.md` (the full product spec). This file says what
exists, what was decided, what's missing and what to do next.

---

## 0. Who you're working with — read before replying

- The person is the **product owner, not an engineer**. Assume no coding
  background. Define every technical term the first time (repo, commit, branch,
  push, database, migration, environment variable, deploy…) with a plain
  comparison ("a table is a spreadsheet tab").
- **Keep replies short and simple.** They have said, more than once, that long
  answers feel like "jamming info in my face". Lead with the answer, keep it to
  a few lines, no walls of options.
- **Claude does the work**; they only do what Claude can't: create accounts,
  type passwords/keys, approve anything public or that costs money. Flag
  anything public, billable or irreversible *before* doing it.
- Several people share the Claude account (brothers working together). Don't
  ask who's talking unless it truly matters.
- First useful thing to do in the new repo: create a `CLAUDE.md` with the
  points above plus the project commands, so every future session knows.

---

## 1. Where things are

| What | Where |
|---|---|
| The real home for this project | GitHub `WilliamChenn/raleighballet` (private; was empty at handoff) |
| Local clone | `~/Desktop/raleighballet` on William's Mac |
| The code written so far | `raleigh-ballet.zip` (sent in chat) — unzip into the repo root |
| Temporary parking copy | `oatmealandsilk-dotcom/Courtside`, branch `claude/raleigh-ballet-platform-mbq0nw`, folder `raleigh-ballet/`. **Unrelated project** — it was only parked there because the first chat ran in a cloud session tied to CourtSide. Delete that branch once the code is safely in `raleighballet` (ask first). |
| The studio's spreadsheet | Google Sheet "Adult Attendance" (the user has the link). Real customer data — **never commit it, never put names/emails in code, seed data or tests.** |

### First steps in the new session
1. Unzip `~/Downloads/raleigh-ballet.zip` into `~/Desktop/raleighballet`
   (copy hidden files too: `cp -R ~/Downloads/raleigh-ballet/. ~/Desktop/raleighballet/`).
2. `npm install`
3. Get a Postgres database (see §5).
4. `cp .env.example .env.local`, set `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET`, keep `DEMO_MODE=true`.
5. Commit + push to `main` of `raleighballet` (private repo, no deploy hooked up yet, so pushing is safe — still say so).

---

## 2. Status by spec phase (SPEC.md §14)

**Phase 1 — Foundation: ~40% done.**

Done:
- `src/db/schema.ts` — every table in SPEC §5 plus a few extras (see §4).
- Core libraries: settings, time zone, money, audit log, signed tokens, env flags, legacy redirects, `.ics` files.
- Auth + roles + permission checks (`src/lib/auth.ts`), Supabase cookie refresh (`src/proxy.ts`).
- Messaging: all automated templates, email layout, send + log pipeline.
- Payments: card-processor wrapper (Stripe or demo), fulfil/charge/refund/desk-sale logic.
- Credits ledger (FIFO by soonest expiry) and the pure rule functions.

**Not done (phase 1):**
- `src/domain/bookings.ts` — **does not exist yet, and `src/domain/payments.ts`
  imports from it, so `npm run typecheck` currently fails.** Write this first (§6).
- Database migrations (`npm run db:generate` → SQL in `drizzle/`), plus a hand-written
  SQL migration for Row Level Security policies and `create extension pgcrypto`
  (schema uses `gen_random_bytes`).
- `scripts/migrate.ts`, `scripts/seed.ts` (package.json already points at them).
- Base layout / design system (Tailwind v4 + shadcn/ui), `src/app/**` pages — **no pages exist yet**.
- Unit tests (Vitest config exists, `tests/` empty apart from a stub).

Phases 2–8: not started (only the domain logic some of them need is written).

---

## 3. Tech stack actually installed (versions matter)

| Package | Version | Notes |
|---|---|---|
| next | 16.4.6 | **Middleware is renamed "proxy"**: the file is `src/proxy.ts` exporting `proxy()`. Docs ship inside `node_modules/next/dist/docs/` — read them, APIs changed. |
| react / react-dom | 19.3.1 | |
| typescript | 7.0.2 | |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | postgres-js driver |
| postgres | 4.1.1 | `prepare: false` (Supabase pooler compatible) |
| @electric-sql/pglite | 0.5.16 | intended for in-memory Postgres in unit tests |
| tailwindcss + @tailwindcss/postcss | 4.3.5 | v4 config style (CSS-first) |
| stripe | 23.1.0 | |
| @supabase/ssr / supabase-js | 0.12.7 / 2.119.0 | |
| resend, @react-email/components, @react-email/render | 6.38 / 1.0.12 / 2.3.1 | |
| zod | 4.6.7 | |
| vitest | 5.1.0 | config: `vitest.config.ts`, tests in `tests/**/*.test.ts` |
| qrcode, html5-qrcode, marked, papaparse, xlsx, clsx, tailwind-merge | | |
| @playwright/test | 1.65.0 | |

Not installed yet: shadcn/ui components (add with its CLI when building UI).

---

## 4. Design decisions already made (keep them unless there's a reason)

**Data**
- UUID keys, `created_at`/`updated_at` everywhere, money = integer cents, times = `timestamptz`.
- All "what day is it" logic uses `America/New_York` via `src/lib/time.ts`
  (`studioTime()`, `dateKey()`, `monthRange()` etc.). Never use the server's local time.
- Extras beyond the spec's §5: `policy_acceptances` (waiver version + timestamp),
  `staff_invites` (claimed by email at first sign-in), `webhook_events` (idempotency),
  `message_templates` (admin overrides of automated wording), `contact_submissions`,
  `import_batches` (rollback), `receipt_seq` sequence (receipt numbers `R-2026-001001`).
- Session status adds **`draft`** (unpublished schedule). Booking status adds **`absent`**
  (youth / no-policy sessions: recorded, never charged). Booking `source` adds
  `waitlist` and `makeup`; `payment_method_for_booking` adds `paid_online`.
- Bookings: one live booking per (session, person) — partial unique index that
  ignores `cancelled`/`late_cancelled`.
- `messages.dedupe_key` (unique) makes every cron job safe to re-run: same key = no second email.
- Mailing-list-only contacts are `people` rows with `mailing_list = true` and no auth user.

**Credits** (`src/domain/credits.ts`, `src/domain/policy.ts`)
- Booking **reserves**: lot `credits_remaining` goes down immediately, ledger row `booking_reserve` (−N).
- Check-in / "I attended" / no-reply **consumes**: ledger row `consume` with delta **0**
  (the credit already left the lot at reserve time; the row just marks it final).
- Cancel in time / "I didn't attend" / studio cancels **releases**: `booking_release` (+N) back to the same lot(s).
- Deduct from soonest-expiring lot first; never-expiring lots last; ties by purchase date.
- Lots are row-locked (`FOR UPDATE`) during deduction so two bookings can't spend one credit.
- Nightly expiry writes an `expire` row and zeroes the lot.

**Payments** (`src/domain/payments.ts`, `src/lib/payments/provider.ts`)
- A purchase is only fulfilled (credits granted, invoice marked paid, drop-in booked)
  by `fulfillPayment()`, called from webhooks or desk sales — **never from the browser**. Idempotent.
- Off-session charges (`chargeOnFile`) use a Stripe idempotency key per payment; on failure the
  payment stays `failed` (= "Balances owed" list) and the person is emailed a signed pay link.
- `payerFor()` picks whose card pays: own card → guardian's → household main contact.
- **Demo mode** (`DEMO_MODE=true`, no Stripe key): checkout goes to `/demo/pay`
  (page not built yet), saved-card charges succeed except a demo card ending `0002`, which declines.

**Auth**
- Supabase Auth when its keys are set; otherwise, in demo mode, a signed cookie
  (`rsb_demo`) lets you sign in as any seeded person (login page not built yet).
- On first sign-in, an existing `people` row with the same email is linked (so imported
  spreadsheet people just log in), and pending `staff_invites` grant roles.
- Server code connects with full rights; **every server action must call
  `requireRole` / `assertCanActFor` first.** RLS policies are a second layer, still to write.

**Messaging**
- Templates in `src/lib/messaging/templates.ts` (markdown + `{merge_tags}`);
  a link alone on a line renders as a button. `notify()` never throws (a mail failure must not undo a booking).
- Children have no email: messages go to guardians (`contactsFor()`).
- No Resend/Twilio keys → messages are logged as sent but not delivered.

---

## 5. Local database

The first session used a plain Postgres 16 on the cloud machine
(`postgres://postgres:postgres@localhost:5432/rsb`). On a Mac, pick one:
- **Postgres.app** (simplest, free, local) → create database `rsb`, or
- a free **Supabase** project (needs an account — the user creates it) → use its
  "Transaction pooler" connection string as `DATABASE_URL`.

Supabase is the production target either way (SPEC §2).

---

## 6. Next steps, in order

1. **`src/domain/bookings.ts`** — `payments.ts` already expects:
   - `bookSession(db, { sessionId, personId, source, pay, paymentId?, actorUserId?, staff?, now? })`
     → creates the booking; when `pay === "credit"` reserves credits via `deductCredits`;
     enforces capacity (staff may override), session not cancelled/draft, not already booked,
     card-on-file rule for adults if `require_card_on_file_for_adults`; reactivates archived people;
     sends `booking_confirmation` with an `.ics` attachment (`src/lib/ics.ts`).
   - `touchActivity(tx, personId, now)` → sets `last_activity_at`, un-archives.
   - Also: cancel (cutoff via `isFreeCancel`, release vs. late-cancel, optional
     `late_cancel_fee_cents`), check-in (consume), studio-cancel session (release all,
     refund drop-ins, notify), waitlist join/offer/claim/expire.
2. `src/domain/followups.ts` — the §6.7 cron using `followupTransition()` from `policy.ts`.
3. Migrations + RLS SQL + `scripts/migrate.ts` + `scripts/seed.ts` (fake data only — §7).
4. Unit tests for the five areas SPEC §13 lists, against PGlite.
5. Then phase 2 onward (pages).

`npm run typecheck` must pass before each commit. Commit after each phase.

---

## 7. What the studio's spreadsheet showed ("Adult Attendance" Google Sheet)

Use this to shape defaults and the import screen (SPEC §10). **Aggregate facts only — no names here on purpose.**

**"Cards" tab** (current class cards, ~527 rows, ~507 people). Columns:
`Last Name | First Name | AoR | Card Purchased | Date Bought | Purchased Date | Expiration Date | Owes/Bought | Notes | Classes Left | Class 1 … Class 20`
- Card sizes sold: **1** (136), **6** (111), **5** (78), **12** (70), **10** (50, mostly pointe), **20** (37), **2** (12), 8 (1).
- Expiry is almost always **5 months after purchase** (~350 rows); **45 say "no expiration"**; a few odd ones.
- "POINTE" / "PRE POINTE" appended to the first name = a **separate card for pointe class** (~32 rows, 20 people have two rows).
  → probably a second product line ("Pointe card") or a class with its own credit type — **ask the studio**.
- "AoR" column: `GF` = signed up via Google Form (46 rows).
- Notes: **"gave back 7/20, 8/3"** (~150 rows) = the studio's current "I didn't attend → no charge" practice (matches SPEC §6.7).
- "Owes/Bought": ~35 rows like "owe 8/4" = **balances owed** (import as unpaid amounts), plus "On Hold" (card paused), "overpaid by $5", "use [another person]'s card" (credit sharing happens occasionally).
- Class 1…20 cells are dates used, sometimes with a suffix: `p` = pointe, `J`/`Jazz`, `k`, `r`, `Maint`.
- `size − dates used = classes left` holds for 477 rows; 18 differ (gave-backs / manual edits). One `#VALUE!`.
- Dates mix `M/D/YYYY`, `M/D/YY` and `M/D` (no year). Names have stray spaces.
- **No prices anywhere in the sheet.**

**Term attendance tabs** ("Sep-Dec 26", "Jun-Aug 26", "Jan-May 26", … back to 2020): one column per class;
row 1 = day + date ("Tuesday 9/8"), row 2 = class + time ("L3 7:15", "Pointe 8:45", "L2/3 10:00", "No Class"),
row 3 = instructor initials (AH, SG, DC, HY, VB, RL, LD), then attendee names (first + last, inconsistent spacing).
Weekly blocks are stacked down the sheet. Current adult schedule ≈ Tue L3 + Pointe evening, Wed L4 morning + L2 evening,
Thu L2/3 morning + L2/3 + L1 evening, Sat L5 + Pointe morning; Mondays sometimes. Older tabs have a "Code" legend
(gave class back / told us / couldn't come / RSB student).

**"Prospect" tab** (~960 rows): `Last Name | First | Email | Class | Inquired | Responded | Added to MC | Added to Signup Genius | Filled out GF | Notes`
→ import as mailing-list contacts (MC = Mailchimp).

**"Expired", "Owes Money", "Expired before April", "BC Cards", "ABC Cards"** — older card formats; same idea, slightly different columns.

Cell colours carried meaning (legend row: bought class / expired / owes money / start date / different expiration / card on hold) — colours are lost in CSV export, so the import can't rely on them.

---

## 8. Still needed from the studio (placeholders in use until answered)

1. **Prices** of each card size (1/2/5/6/10/12/20), pointe cards, drop-in.
2. Instructor names for initials AH, SG, DC, HY, VB, RL, LD.
3. Cancellation cutoff (default 12 h).
4. No-show / late-cancel: lose the class only, or also a fee?
5. Cap on "I didn't attend" excuses?
6. Card on file required for adults, or cash at the door OK?
7. Can credits be shared within a family / between people?
8. Kids' program: price per level, sibling discount, billing day, auto-continue month to month? (The sheet is adults only — ask for the kids' sheet.)
9. Which payment accounts exist (Stripe / PayPal Business / Square)?
10. Waiver wording.
11. Archive after 6 months — right?
12. Old website text — the cloud session couldn't reach raleighballet.com; a local session can, or the user pastes it.

---

## 9. Gotchas hit so far

- Cloud sessions can't reach raleighballet.com or docs.google.com directly (network allow-list). A local session on the Mac has no such limit.
- The Google Drive connector's "read" only shows each tab's first row; exporting as `.xlsx` gives the whole workbook.
- `xlsx` (SheetJS) is installed and reads the workbook fine (`XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })`).
