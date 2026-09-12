# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Who you are talking to

The person working on this project has **no coding or computer-science
background**. Assume zero familiarity with programming, databases, servers,
or developer tooling. They are the product owner, not an engineer.

## How to explain things

- **Define every technical term the first time it comes up**, in plain English,
  including ones that feel too basic to bother with: API, SQL, schema, RLS,
  repo, commit, branch, push, environment variable, key, endpoint, migration,
  dependency, package, build, deploy, cache, state.
- **A concrete comparison beats a precise definition.** "A table is a
  spreadsheet tab" lands; "a relation with typed columns" does not.
- **Say what a step is for before saying how to do it.** They should understand
  why they are clicking something.
- **Give exact clicks and exact paste targets.** "Open Settings → API and copy
  the Project URL" beats "grab your credentials".
- **Do not hand over a snippet and assume it lands correctly.** Either make the
  edit yourself, or give the whole file and say exactly where it goes.
- **Flag anything irreversible, public, or billable before it happens.**
- Brevity is fine. Brevity by omitting the explanation is not.

## Division of labour

Claude writes the code and makes the edits. The user does only what Claude
cannot: creating accounts, typing passwords and keys, and approving anything
that publishes publicly or costs money.

## The project

CourtSide — a tennis social app: reels-style feed, community Q&A, human and AI
coaching, direct messages. Expo + React Native + TypeScript, file-based routing
via expo-router.

## Commands

```bash
npm start            # Expo dev server; press i / a / w for iOS / Android / web
npm run web          # dev server, browser only
npm run typecheck    # tsc --noEmit — the only automated check; run before committing
npm run build:web    # static web export to dist/
```

There are no tests and no linter. `npm run typecheck` is the whole safety net,
so keep TypeScript strict-clean. If dependency versions complain after an
upgrade, `npx expo install --fix` aligns them to the installed Expo SDK.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which exports the web
build and publishes it to GitHub Pages at
https://oatmealandsilk-dotcom.github.io/Courtside/. **Pushing to `main` is a
public deploy** — flag it to the user first. The workflow sets
`EXPO_BASE_URL=/Courtside` so assets resolve under the repo subpath, and copies
`index.html` to `404.html` so deep links survive static hosting.

## Architecture

Data flows one way, and every layer exists so a real backend can be dropped in
later without touching screens:

1. **`src/data/mock/*`** — in-memory seed fixtures (users, feed, discussions,
   coaches, messages, health).
2. **`src/data/api.ts`** — the fake API seam. Every read goes through here,
   behind an artificial delay so loading states are real, and returns clones so
   screens never mutate seeds. A Supabase backend is being added by replacing
   these function bodies; the signatures and return shapes must stay stable.
3. **`src/store/AppContext.tsx`** — the single state container. It loads one
   `fetchBootstrap()` payload at sign-in and holds **all** state and **every**
   write action (likes, posts, answers, messages, coach requests…). Screens
   never own domain state; they call actions from this context. Notifications
   are filed inside the same setState updaters via `withNotification`, so any
   new user-visible action should compose with it.
4. **`app/*`** — expo-router file-based routes. `(auth)/` is sign-in +
   onboarding, `(tabs)/` is the four main tabs (feed, discuss, coaches,
   profile); everything else (`messages/`, `ai-coach`, `compose`, `post/[id]`,
   …) is pushed on top.

`src/data/types.ts` is the whole domain model in one file — start there when
adding anything new, since it doubles as the future database schema.

### Platform splits

Anything with a `.web.tsx` / `.web.ts` sibling (ReelPlayback, SwipeSurface,
VerticalPager, RouteTransition, MediaPicker, shareOutside, messaging
preferences…) has genuinely different native and browser implementations.
Metro picks the `.web` file on web automatically. **A behaviour change to one
almost always needs the same change in its sibling** — check both before
calling anything done.

### Theming

`src/theme/index.ts` defines the token vocabulary (colors, spacing, radius,
typography); `src/theme/ThemeProvider.tsx` defines the palettes — light, dark,
and the four Grand Slam themes (Australian Open, Roland Garros, Wimbledon,
US Open). Every palette must supply every key of `lightColors`. Components take
colors from the theme context, never hardcoded hex values, or the slam themes
break silently.

### Other seams worth knowing

- `@/*` is a path alias for `src/*` (see tsconfig.json).
- `src/features/aiCoach/planGenerator.ts` is a deliberately deterministic,
  readable training-plan generator. It takes exactly the inputs a model would
  (profile, constraints, tournament calendar, recovery) and returns a
  structured `TrainingPlan` — swap its body for a model call, keep the shape.
  The chat side has the same seam in `askAiCoach` in `api.ts`.
- No binary assets ship with the repo: avatars are generated from initials and
  photo/video posts render as tinted court cards (`MediaPlaceholder`).
- Health/injury/nutrition content must stay generic training information, not
  medical advice.
