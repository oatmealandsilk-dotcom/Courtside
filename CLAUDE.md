# CourtSide — working notes for Claude

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
coaching, direct messages.

- Expo + React Native + TypeScript, file-based routing via expo-router.
- Ships as a static web build to GitHub Pages through GitHub Actions on push
  to `main`. Live at https://oatmealandsilk-dotcom.github.io/Courtside/
- Data is currently mock and in-memory (`src/data/mock/*`), read through
  `src/data/api.ts`. A Supabase backend is being added behind that same file.
- `src/store/AppContext.tsx` holds all state and every write action.
