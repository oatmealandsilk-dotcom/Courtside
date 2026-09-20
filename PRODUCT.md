# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

Two surfaces ship and both are real: the iPhone app, and the public web build at
https://oatmealandsilk-dotcom.github.io/Courtside/. An Android package exists in the config but is
not a priority. One design language covers both surfaces; the `.web.tsx` splits exist for behaviour
that genuinely differs in a browser (video playback, gestures, media picking, sharing), not for a
different look.

## Users

Anyone who plays tennis, beginners through tour level — deliberately broad, and the app is built for
it: three rating systems (NTRP, UTR, ITF) with bands from "Learning to rally" to "Tour level", and a
profile that covers play style, handedness, backhand, surface and fitness level.

Accounts are 13 or older; the signup asks for a birth date once, neutrally, and blocks under-13.
Today the real users are the owner and friends testing.

## Product Purpose

A place for tennis that holds a player's whole game rather than just their highlights: a vertical
feed of clips and "hits" (one photo taken right after a session, which expires), community threads
by topic, coaching, and direct messages. The current goal is to hold up for about 1,000 users.

## Positioning

Three things at once, all confirmed by the owner:

1. **Everything carries tennis context.** A clip is attached to a level, a match, a tournament, so
   other players can read it properly instead of just watching it.
2. **Coaching you can actually get.** Reaching real coaches — video reviews, written answers,
   sessions — with the feed as the reason people are there between lessons.
3. **Players at your level, near you.** Finding and talking to people who match your game and your
   area, which tennis has no good home for.

## Operating Context

- Posting happens from the phone, usually right after playing. A "hit" is same-session by design and
  expires; clips come from the camera roll and the phone converts them before upload.
- Community threads mix real ones with threads carried in from outside (Reddit, Talk Tennis), always
  behind a source badge that names where they came from.
- Coaches apply through the app and are approved by the owner; nobody is a coach by self-declaration.
- Reports reach an admin — currently the owner — who can remove a post, suspend an account, or
  dismiss the report, and undo the first two.

## Capabilities and Constraints

- Expo / React Native / TypeScript with file-based routing; Supabase for data, auth, storage and
  server functions. `npm run typecheck` is the only automated check — no tests, no linter.
- The database, not the app, enforces the things that matter: blocking works both ways and hides
  posts; private profiles hide injury notes; follower counts are kept server-side; removed posts and
  suspended accounts are refused at the source; notifications can only be written by the database.
- The feed loads a page at a time and is dealt in a shuffled order on every open.
- Deleting an account erases that person's photos, videos and coach résumé from storage, not just
  their rows.
- **The AI coach is switched off** at `src/features/aiCoach/switch.ts`. Nothing can reach the paid
  service while it is off.
- Paid coaching is modelled in code (prices, video review, written Q&A, live session, plan) but the
  Coaching tab shows "coming soon". **Undecided: whether paid coaching is the business or a feature.**
- Push alerts are built on both sides but need an Expo project id and a real build — Expo Go cannot
  receive them at all.
- Health, injury and nutrition content stays generic training information. Never medical advice.
- **Sample data is still mixed in with real accounts** — made-up players, posts and threads visible
  to real users. Must go before strangers join.

## Brand Commitments

- The name is CourtSide. The wordmark sits centred at the top of the feed. The tagline is
  "Growing the game".
- Six themes ship: light, dark, and four Grand Slam palettes — Australian Open, Roland Garros,
  Wimbledon, US Open. Every palette must supply every colour key, and components take colour from
  the theme, never a hardcoded hex, or the slam themes break silently.
- No binary image assets ship with the app. Avatars are generated from initials; photo and video
  placeholders render as tinted court cards.

## Evidence on Hand

- Real posts and accounts from the owner and a small group of friends (17 posts at the time of
  writing), plus imported community threads that are always labelled as imported.
- **No testimonials, customers, press, pricing, benchmarks or user numbers exist.** Future work must
  not fabricate any of them, and must not present the sample players as real people.

## Product Principles

1. **Tennis context travels with the content.** Level, match and tournament are part of a post, not
   decoration around it.
2. **Safety is enforced by the database, not the screen.** If hiding something only works on one
   phone, it does not work.
3. **Nothing made-up is presented as real** — not players, not coaches, not proof.
4. **Health talk stays generic training information**, whatever is asked.
5. **The phone is the capture device.** Posting belongs to the session that just happened.

## Accessibility & Inclusion

Accessibility labels and roles are used throughout, including live regions for status messages, and
the age gate is 13+. No specific standard (WCAG level, App Store accessibility commitment) has been
established yet — an open decision, not a recorded requirement.
