# Fitbit, Oura and Polar: setting them up

CourtSide can now pick up tennis sessions from Fitbit, Oura and Polar the way
it already does from WHOOP: you record tennis on your tracker, and it shows up
in CourtSide as "Tennis detected", ready to log in one tap.

Until a tracker has its keys, the app shows it as **Coming soon**. Nothing
breaks. You can set up one, two or all three, in any order.

## Words used here

- **Developer app**: a registration on the tracker company's website that says
  "CourtSide is allowed to ask people for their workouts". Like a shop applying
  for a card machine: you do it once, for the whole app, not per player.
- **Client ID and client secret**: the two codes the tracker gives you when you
  register. The ID is like a username for CourtSide; the secret is like its
  password. Never post the secret anywhere public.
- **Redirect URL** (also called callback URL): the web address the tracker
  sends people back to after they say "yes, let CourtSide see my workouts".
  It has to be pasted exactly, letter for letter.
- **Scopes**: the list of things CourtSide asks to read. We ask for workouts and
  heart rate only.
- **Secrets** (in Supabase): a locked drawer on our server where these codes
  live, so they are never inside the app on anyone's phone.

## What you do, and what Claude does

You: create each developer app (it needs your login and agreeing to their
terms), then paste its two codes into Supabase. Claude: everything else, which
is running the database change (migration 69) and switching on the server
part (the "trackers" function). Claude does those only when you say go.

---

## 1. Fitbit

**Why:** so Fitbit lets CourtSide ask its users for their tennis sessions.

1. Open https://dev.fitbit.com/apps/new and sign in with the Google account you
   want to own CourtSide's Fitbit app. (Fitbit accounts are Google accounts now.)
2. Fill in the form:
   - **Application Name:** CourtSide
   - **Description:** Tennis app. Reads your tennis workouts so you can log them.
   - **Application Website URL:** https://courtsidebase.com
   - **Organization:** CourtSide
   - **Organization Website URL:** https://courtsidebase.com
   - **Terms of Service URL** and **Privacy Policy URL:** CourtSide's own pages
     (the same ones the App Store listing uses).
   - **OAuth 2.0 Application Type:** choose **Server**. (Not "Personal":
     that only works for your own Fitbit.)
   - **Redirect URL:** paste exactly
     `https://auth.courtsidebase.com/functions/v1/trackers/callback/fitbit`
   - **Default Access Type:** Read Only
3. Tick the terms box and press **Register**.
4. The next page shows **OAuth 2.0 Client ID** and **Client Secret**. Keep the
   page open for step 5 below.

Scopes CourtSide asks for (nothing to tick on Fitbit's form; for your
information): `activity` and `heartrate`.

**Supabase secret names:** `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`.

Note: Google is moving Fitbit's developer tools over to a newer "Google Health
API". If the Fitbit page says new apps are closed, stop there and tell Claude.

## 2. Oura

**Why:** so Oura lets CourtSide ask Oura Ring owners for their tennis workouts.

1. Open https://cloud.ouraring.com/oauth/applications and sign in with an Oura
   account (make a free one at https://cloud.ouraring.com if you have no ring).
2. Press **New Application** and fill in:
   - **Display Name:** CourtSide
   - **Description:** Tennis app. Reads your tennis workouts so you can log them.
   - **Contact Email:** your email
   - **Website, Privacy Policy, Terms of Service:** CourtSide's own pages
   - **Redirect URIs:** paste exactly
     `https://auth.courtsidebase.com/functions/v1/trackers/callback/oura`
   - **Scopes** (if it asks): tick **workout** and **heartrate** only.
3. Save. Copy the **Client ID** and **Client Secret** it shows.

Oura may cap a brand-new app at a handful of users until it reviews it. If it
offers a "submit for review" step, that is what lifts the cap.

**Supabase secret names:** `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`.

## 3. Polar

**Why:** so Polar lets CourtSide read Polar watch exercises marked as tennis.

1. If you have no Polar account, make one at https://flow.polar.com (free).
2. Open https://admin.polaraccesslink.com and sign in with that Polar account.
3. Press **Create client** (or "Create new client") and fill in:
   - **Application name:** CourtSide
   - **Website and contact details:** CourtSide's own
   - **Authorization callback domain / Redirect URL:** paste exactly
     `https://auth.courtsidebase.com/functions/v1/trackers/callback/polar`
4. Accept Polar's terms and create it. Copy the **Client ID** and
   **Client Secret** straight away: Polar may show the secret only once.

Scope CourtSide asks for (automatic): `accesslink.read_all`.

**Supabase secret names:** `POLAR_CLIENT_ID` and `POLAR_CLIENT_SECRET`.

## 4. Garmin: nothing to set up

Garmin's own connection needs a business application to Garmin, so it is not
included. On an iPhone, Garmin already works: in the Garmin Connect app, open
**Settings → Connected Apps → Apple Health** and turn on **Workouts**. Garmin
tennis then comes in with Apple Watch's. The app says this on Garmin's row.

---

## 5. Paste the codes into Supabase

**Why:** the server needs the codes to talk to each tracker, and they must
never be inside the app itself.

1. Open https://supabase.com/dashboard and pick the CourtSide project.
2. In the left menu, open **Edge Functions**, then **Secrets**.
3. For each code, press **Add new secret**, type the name exactly as written
   below in the **Key** box, paste the code in the **Value** box, and save:

| Tracker | Key (name)             | Value (paste)            |
|---------|------------------------|--------------------------|
| Fitbit  | `FITBIT_CLIENT_ID`     | Fitbit's Client ID       |
| Fitbit  | `FITBIT_CLIENT_SECRET` | Fitbit's Client Secret   |
| Oura    | `OURA_CLIENT_ID`       | Oura's Client ID         |
| Oura    | `OURA_CLIENT_SECRET`   | Oura's Client Secret     |
| Polar   | `POLAR_CLIENT_ID`      | Polar's Client ID        |
| Polar   | `POLAR_CLIENT_SECRET`  | Polar's Client Secret    |

Leave out any tracker you have not set up: it simply stays "Coming soon".

Then tell Claude "trackers keys are in".

## 6. Who sees it (Claude does this part)

Each tracker has an on/off switch on the server, the same kind WHOOP has:
`flag:tennis-fitbit`, `flag:tennis-oura`, `flag:tennis-polar`. When migration
69 runs, each starts as whatever WHOOP's is at that moment. Today that means
**admins only**, so you can test with your own tracker before anyone else
sees it. When you are happy, Claude turns a tracker on for everyone with:

```sql
update server_settings set value = 'on', updated_at = now() where key = 'flag:tennis-fitbit';
```

## For Claude: switching it on

1. Run `supabase/migrations/20261003000069_trackers.sql` in the SQL editor
   (safe to run more than once), then its read-only checks at the bottom.
2. Deploy the function: `supabase functions deploy trackers --no-verify-jwt`
   (like `whoop`: the trackers' redirects carry no app token; the function
   checks the player's token itself on start, finish, sync and disconnect).
3. Check `https://auth.courtsidebase.com/functions/v1/trackers/status` shows
   `{"on": true}` for each tracker whose keys are in.
4. If the function ever needs a different callback address, set the secret
   `TRACKERS_CALLBACK_BASE` (default
   `https://auth.courtsidebase.com/functions/v1/trackers`) and change the
   redirect URL on each tracker's developer page to match.

How it works, briefly: the app asks the server for the tracker's sign-in page;
the player says yes on the tracker's site; the tracker sends them back to
`/callback/<tracker>`; the server holds the keys for up to ten minutes until the
phone that started it collects them (so a sign-in link forwarded to someone
else can never put their tracker on the wrong account). From then on, each
time the app opens (at most hourly per tracker) and on "Sync now", the server
looks for tennis and files it through `record_activity`, the same path WHOOP
uses, so the same match seen by two trackers files one alert. Disconnecting
removes that tracker's sessions and its stats on posts.
