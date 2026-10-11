# Fitbit, Oura and Polar: setting them up

CourtSide can now pick up tennis sessions from Fitbit, Oura and Polar the way
it already does from WHOOP: you record tennis on your tracker, and it shows up
in CourtSide as "Tennis detected", ready to log in one tap.

Until a tracker has its keys and its switch is on, the app does not list it
at all (since Oct 4, so Apple's review sees nothing half-built). Nothing
breaks. You can set up one, two or all three, in any order.

## Words used here

- **Developer app**: a registration on the tracker company's website that says
  "CourtSide is allowed to ask people for their workouts". Like a shop applying
  for a card machine: you do it once, for the whole app, not per player.
  (For Fitbit, this is a project in Google's Cloud Console: see section 1.)
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

## 1. Fitbit (through Google)

**Why:** Fitbit belongs to Google now. Fitbit's own developer site stopped
taking new apps, and its old connection switches off for good on
**Oct 30, 2026**. The replacement is Google's **Google Health API**. (An
**API** is a door one program uses to ask another for data: this one is how
CourtSide's server asks Google for a player's Fitbit workouts.) Players sign
in with the Google account their Fitbit is on, and CourtSide only ever reads.

**Read this first: the one big unknown.** Google's own pages say it is "not
onboarding new projects at this time", with no waiting list to join. Nobody
can tell in advance whether a brand-new CourtSide project is let in. Step 4
below (switching the API on) is the test: if it works, carry on; if Google
refuses, stop there and tell Claude. Nothing in these steps should cost money:
if Google asks for a card or a billing account at any point, stop and tell
Claude.

### Words for this section

- **Google Cloud Console**: Google's website for developers, where an app is
  registered to use Google's services. Like the back office of a shop.
- **Project**: a folder in the Console that holds one app's settings and keys.
- **Google Auth Platform**: the part of the Console that sets up the "Sign in
  with Google" page players see: "CourtSide wants to see your workouts. Allow?"
  (Older screens call it the **OAuth consent screen**. **OAuth** is the
  standard way one app asks for another app's data without ever seeing the
  player's password.)
- **OAuth client**: CourtSide's username and password with Google: a **Client
  ID** (the username) and a **Client secret** (the password).
- **Scope**: one line in the list of what CourtSide asks to read.
- **Test users**: while CourtSide's Google setup is "in Testing", only these
  Google accounts can connect.

### Steps

1. **On your phone first** (why: Google only shares Fitbit data for a Google
   account that has a Google Health profile). Install the **Google Health**
   app from the App Store, open it, tap **Sign in with Google**, and pick the
   Google account your Fitbit is on. If it offers to move your Fitbit account
   to Google, do that. Check your Fitbit workouts show up in it. Every player
   does this once; if someone hasn't, CourtSide tells them what to do when
   they press Connect.
2. Open https://console.cloud.google.com and sign in with the Google account
   that should own CourtSide's Google setup. Accept Google Cloud's terms if it
   asks.
3. **Create the project.** Click the project picker at the top left (next to
   the Google Cloud logo; it may say **Select a project**) → **New project** →
   Project name: `CourtSide` → leave Location as it is → **Create**. When the
   bell at the top right says it's done, open the project picker again and
   click **CourtSide**, so every step below happens inside it.
4. **Switch on the Google Health API** (why: Google refuses every request from
   a project until its API is switched on). Click **☰** (top left) →
   **APIs & Services** → **Library** → type `Google Health API` in the search
   box → click the **Google Health API** result → **Enable**.
   - If it isn't found, the button is grey, or you see an error or a "request
     access" message: **stop here** and send Claude a screenshot. That is
     Google's "not onboarding new projects" block.
5. **Start the sign-in page.** **☰** → **APIs & Services** → **OAuth consent
   screen**. This opens **Google Auth Platform**. If it says "Google Auth
   Platform not configured yet", click **Get started**, then:
   - **App information:** App name `CourtSide`; User support email: your
     email → **Next**
   - **Audience:** **External** → **Next**
   - **Contact information:** your email → **Next**
   - **Finish:** tick "I agree to the Google API Services: User Data Policy" →
     **Continue** → **Create**
6. **Branding** (left menu → **Branding**): Application home page
   `https://courtsidebase.com`; Application privacy policy link and Application
   terms of service link: CourtSide's own pages (the same ones the App Store
   listing uses). Under **Authorized domains** click **+ Add domain** →
   `courtsidebase.com` → **Save**. Leave the logo empty for now: adding one
   starts a Google review.
7. **Who may connect** (left menu → **Audience**): check that Publishing
   status says **Testing** and User type says **External**. Under
   **Test users** click **+ Add users**, type the Google email of every admin
   who will test Fitbit (yours first) → **Save**. Do **not** press
   **Publish app** (see "Limits" below).
8. **What CourtSide may read** (left menu → **Data Access**) → **Add or remove
   scopes** → type `Google Health API` in the filter box → tick exactly these
   two rows:
   - `.../auth/googlehealth.activity_and_fitness.readonly`: workouts, with
     their calories, average heart rate and time in each heart-rate zone
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`: heart
     rate, for a session's highest beat

   → **Update** → **Save**. Both end in "readonly": CourtSide can never change
   anyone's Fitbit data.
9. **CourtSide's key pair** (left menu → **Clients**) → **+ Create client** →
   Application type: **Web application** → Name: `CourtSide server` → leave
   "Authorized JavaScript origins" empty → under **Authorized redirect URIs**
   click **+ Add URI** and paste exactly
   `https://auth.courtsidebase.com/functions/v1/trackers/callback/fitbit`
   (no spaces, no slash at the end) → **Create**.
10. A box shows the **Client ID** (it ends in `.apps.googleusercontent.com`)
    and the **Client secret** (it usually starts with `GOCSPX-`). **Google
    shows the secret only once**: click **Download JSON** straight away and
    keep that file private, or keep the box open for "5. Paste the codes into
    Supabase" below. Never paste either one into chat.

**Supabase secret names:** `FITBIT_CLIENT_ID` (the Client ID) and
`FITBIT_CLIENT_SECRET` (the Client secret). The names still say Fitbit, so
the app's Fitbit button keeps working; the codes inside are Google's.

**After that:** tell Claude "Google keys are in". Then connect Fitbit in
CourtSide as an admin, record one real **Tennis** workout on the Fitbit (or
Pixel Watch), let it sync in the Google Health app, and tell Claude, who checks
it arrives as tennis (Google has not written down how a Fitbit "Tennis"
workout is labelled, so one real session settles it).

### Limits until Google has checked CourtSide (read before opening Fitbit to everyone)

- **100 people, ever.** A Google setup that Google hasn't verified can be used
  by at most 100 Google accounts in total.
- **Testing** (where these steps leave you): only the test users from step 7
  can connect, and Google makes them connect again every 7 days. When that
  happens, the app turns Fitbit tennis off and offers to connect again.
- **The warning screen.** Testers see "Google hasn't verified this app". Tap
  **Advanced** → **Go to CourtSide (unsafe)**. That is Google's standard
  warning for any app it has not reviewed yet, not a sign anything is wrong.
  On the next page, leave both boxes ticked and tap **Continue**.
- **In production** (Audience → **Publish app**) ends the weekly reconnect,
  but the 100-person cap and the warning screen stay, and Google's rules say a
  public app should not use these health permissions unverified. Claude asks
  before this is ever pressed.
- **More than 100 people** needs **Google's verification**: Google's team
  checks CourtSide's privacy policy, a short demo video and a reason for each
  permission (free, takes several weeks), plus a yearly security check called
  **CASA** (Cloud Application Security Assessment), done by an outside company
  Google approves. **CASA costs money: about US$500–4,500 every year**, and
  takes 2–6 weeks. Nothing here starts without your yes.
- Fitbit's kids' watches (Fitbit Ace) do not work through Google Health.

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
| Fitbit  | `FITBIT_CLIENT_ID`     | Google's Client ID (section 1, step 10)     |
| Fitbit  | `FITBIT_CLIENT_SECRET` | Google's Client secret (section 1, step 10) |
| Oura    | `OURA_CLIENT_ID`       | Oura's Client ID         |
| Oura    | `OURA_CLIENT_SECRET`   | Oura's Client Secret     |
| Polar   | `POLAR_CLIENT_ID`      | Polar's Client ID        |
| Polar   | `POLAR_CLIENT_SECRET`  | Polar's Client Secret    |

Leave out any tracker you have not set up: it simply stays hidden.

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
   redirect URL on each tracker's developer page to match (Fitbit's lives in
   Google Auth Platform → **Clients** → **CourtSide server**).
5. Fitbit only: the function's logs say why a Google sign-in failed.
   `[trackers] fitbit identity 403 API_PRIVATE_PREVIEW_ACCESS_DENIED` means
   Google has not let the project in yet; `ACCOUNT_NOT_LINKED` means that
   player's Google account has no Google Health profile (the app tells them).

How it works, briefly: the app asks the server for the tracker's sign-in page;
the player says yes on the tracker's site; the tracker sends them back to
`/callback/<tracker>`; the server holds the keys for up to ten minutes until the
phone that started it collects them (so a sign-in link forwarded to someone
else can never put their tracker on the wrong account). From then on, each
time the app opens (at most hourly per tracker) and on "Sync now", the server
looks for tennis and files it through `record_activity`, the same path WHOOP
uses, so the same match seen by two trackers files one alert. Disconnecting
removes that tracker's sessions and its stats on posts.
