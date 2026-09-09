# CourtSide

Social media, discussion, and coaching for tennis players. Strava-style session and
match logging, an Instagram-ish feed, a Reddit/Tennis-Warehouse-style Q&A board, a
coach marketplace where players send footage or questions, and an AI coach that
builds a weekly training plan from your profile, injuries, tournament calendar, and
imported health data.

**This build runs entirely on mock data. There is no database, no auth, no payments,
no uploads.** Every read goes through `src/data/api.ts`, which returns in-memory
fixtures behind a simulated network delay — so a real backend can be dropped in
without touching a single screen.

## Run it

```bash
npm install
npm start        # then press i / a / w, or scan the QR with Expo Go
npm run web      # browser only
npm run typecheck
```

If any dependency version complains, `npx expo install --fix` aligns everything to
the installed Expo SDK.

## Live web build

Every push to `main` runs `.github/workflows/deploy.yml`, which exports the web
build and publishes it to GitHub Pages. See "Turning on GitHub Pages" below — the
workflow cannot enable Pages for you, that is a one-time switch in repo settings.

## What is in here

```
app/                      expo-router file-based routes
  index.tsx               splash + auth/onboarding redirects
  (auth)/sign-in.tsx      handle-only demo sign-in
  (auth)/onboarding.tsx   5-step intake: level, game, body, goals, calendar
  (tabs)/index.tsx        feed
  (tabs)/discuss.tsx      Q&A board with topics, sorting, voting
  (tabs)/train.tsx        AI coach: generated week + chat
  (tabs)/coaches.tsx      coach marketplace + your requests
  (tabs)/profile.tsx      stats, badges, achievements, goals, constraints
  post/[id].tsx           post detail + comments
  question/[id].tsx       thread detail + answers + accepted answer
  coach/[id].tsx          coach profile, services, request flow
  user/[id].tsx           other players' profiles
  compose.tsx             new match / session / note / gear post
  ask.tsx                 new question
  health.tsx              nutrition + wearable integrations

src/
  data/types.ts           the whole domain model
  data/api.ts             fake API seam — replace these bodies with real calls
  data/mock/              seed users, feed, discussions, coaches, health
  store/AppContext.tsx    single app state container + all mutations
  features/aiCoach/       rule-based training plan generator
  lib/badges.ts           NTRP/UTR level badges, achievement evaluation
  lib/integrations.ts     provider setup notes + connect/disconnect stubs
  components/             PostCard, QuestionCard, CoachCard, AchievementGrid…
  components/ui/          Button, Card, Chip, Field, Screen, Meter, StatTile…
  theme/                  colors, spacing, radius, typography tokens
```

## The AI coach

`src/features/aiCoach/planGenerator.ts` is deliberately deterministic and readable.
It takes exactly the inputs a real model would be handed — profile, active
constraints, tournament calendar, recent recovery and nutrition — and returns a
structured `TrainingPlan`. It already:

- periodises against your next tournament (base → sharpening → taper),
- caps serve volume and avoids back-to-back serve days when a shoulder/elbow/arm
  constraint is on your profile,
- swaps impact work out when a lower-body constraint is on your profile,
- drops intensity when three-day recovery averages below 65,
- explains every block ("why this is here") rather than just listing it.

Swap the body of `generatePlan` for a model call and keep the same return shape.

## Turning on GitHub Pages

One time, in the repo on GitHub:

1. **Settings → Pages**
2. **Build and deployment → Source: GitHub Actions**

Then push to `main` (or **Actions → Deploy web build to GitHub Pages → Run
workflow**). The site lands at `https://<user>.github.io/<repo>/`.

The workflow sets `EXPO_BASE_URL=/<repo>` so asset paths resolve under the project
subpath, and copies `index.html` to `404.html` so deep links work on Pages' static
hosting.

## What still needs building

| Area | Status | Next step |
| --- | --- | --- |
| Auth | Handle lookup against mock users | Real provider (Supabase/Clerk), session persistence |
| Database | In-memory fixtures | Postgres schema from `src/data/types.ts`, swap `api.ts` bodies |
| Media | Placeholder court cards | Real image/video upload + storage + transcoding |
| Payments | None | Stripe Connect so coaches get paid per service |
| AI coach | Rule-based generator | Model call with profile/constraints/health as context |
| Nutrition | Mock Cronometer/MFP | OAuth per `src/lib/integrations.ts` `providerSetup` notes |
| Wearables | Mock WHOOP/Apple Health | HealthKit needs a custom dev client, not Expo Go |
| Notifications | None | Expo push for coach replies and answers on your questions |
| Moderation | None | Reporting and review before this is opened up |

## Notes

- No binary assets ship with the repo. Avatars are generated from initials, and
  photo/video posts render as tinted court cards (`MediaPlaceholder`).
- Health, injury, and nutrition content in the app is generic training information,
  not medical advice.
