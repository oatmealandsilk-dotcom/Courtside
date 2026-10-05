# CourtSide on Android: setting it up

The app's code is ready for Android (Oct 5: keyboard, Back button, sign-in,
photos and videos, Instagram Stories, alerts, the logo and launch screen; the
list is at the end). What is left is a handful of accounts and files that only
you can make, because they need your Google login. This page lists them in
order, click by click. Nothing here costs money, and nothing here makes
anything public, except where a step says so in bold.

No Android build has been made yet. The first one is started only when you
say go.

## Words used here

- **Build**: one packaged copy of the app, made on Expo's build service (the
  same place the iPhone builds are made). For Google Play it is an **.aab**
  file ("Android App Bundle"): Google turns it into the right download for
  each phone. A **preview** build is an **.apk** instead: a file that can be
  put straight onto an Android phone, for trying the app before Google sees it.
- **Firebase**: Google's service that delivers push alerts (the lock-screen
  notifications for likes, replies and messages) to Android phones. Apple does
  this for iPhones; on Android it has to be Firebase. Free.
- **google-services.json**: a small file Firebase gives you that tells the app
  which Firebase project it belongs to. Like the address label on a parcel.
- **FCM V1 key** (also called a **service account key**): a second file from
  Firebase, a private one, that lets Expo's push service hand alerts to
  Firebase. Treat it like a password: never post it, never email it.
- **EAS / expo.dev**: Expo's website and build service, where CourtSide's
  builds and push settings already live (the robertzchen account).
- **Environment variable** (on Expo, a **file variable**): a setting kept on
  Expo's website instead of in the code, handed to each build as it is made.
  Expo keeps separate sets for **preview** builds and **production** builds.
- **Package name**: the Android app's permanent ID, `co.courtside.app`, the
  same as the iPhone app's. It can never change once a build is on Google Play.
- **SHA-1 fingerprint**: a short code (pairs of letters and numbers separated
  by colons) that identifies the key an Android app is signed with. Like the
  serial number on a wax seal.
- **Closed testing**: a private release on Google Play that only the people
  you invite can install.
- **Migration**: a small, saved change to the database's set-up (here, how
  push alerts are worded for Android phones). It does nothing until it is run
  in Supabase's SQL editor.
- **Main**: the version of the code the live website and the instant updates
  come from. **Merging** this Android work into main puts it there.

## What you do, and what Claude does

You: steps 1, 2 and 5 below (they need your Google and Expo logins), and the
go-ahead for anything marked **Flag**.

Claude: everything else, each only after you say go: merging this work into
main, uploading the Firebase file to Expo, running the push migration, and
drafting the Google Play forms.

## The order matters

1. **Merge this Android work into main first, and make every Android build
   from main.** The iPhone and Android builds take the same instant updates
   (they share version 1.0.0). An Android build made from anywhere else would
   have its Android fixes taken away by the next `npm run update` from main.
   **Flag: pushing main also publishes the website.** The privacy page's new
   "delete your account without the app" line goes live then (step 5b needs it).
2. Step 1 (Firebase file) and step 2 (the FCM V1 key) **before** the first
   build. A build made with the Firebase file but before the key is on Expo
   saves Android push addresses that can never receive anything, and nobody
   would notice: alerts are sent and forgotten.
3. **Claude runs migration 106 in Supabase before the first Android build,
   with no exceptions.** It makes alerts to Android phones arrive at once, not
   minutes late, and land in the right group. It must be live before any
   Android phone (yours or a tester's) can get a single alert: an alert sent
   without it lands in an extra group called "Miscellaneous", which then
   stays in that phone's notification settings for good and cannot be
   removed. Nothing changes for iPhones.
4. The first build (step 4), then Google Play (step 5).

---

## 1. Create the Firebase project and download google-services.json

**Why:** without it, the Android app works but gets no push alerts.

1. Open https://console.firebase.google.com and sign in with the Google
   account you want to own CourtSide's Android push (the same one as your
   Google Play developer account is simplest).
2. Click **Create a project** (on a first visit it may say **Get started with
   a Firebase project**).
3. **Project name:** type `CourtSide`. Tick the terms box if asked, then
   click **Continue**.
4. If it offers **Gemini in Firebase**, switch it off and click **Continue**.
5. On the **Google Analytics** page, switch **Enable Google Analytics for this
   project** to **off**. CourtSide does not use it, and leaving it off keeps
   Google Play's data-safety form shorter. Click **Create project**.
6. Wait for "Your Firebase project is ready", then click **Continue**.
7. On the project's home page, under "Get started by adding Firebase to your
   app", click the **Android** icon (the little robot). If you do not see it,
   click **+ Add app** and choose **Android**.
8. Fill in:
   - **Android package name:** `co.courtside.app` (exactly this, all lower case)
   - **App nickname:** `CourtSide Android`
   - **Debug signing certificate SHA-1:** leave empty
9. Click **Register app**.
10. Click **Download google-services.json**. It lands in your Downloads folder.
    If your Mac named it `google-services (1).json`, rename it to exactly
    `google-services.json`.
11. Click **Next**, then **Next** again (those pages are for programmers;
    Claude's setup already covers them), then **Continue to console**.
12. Open Finder, go to **Downloads**, and drag `google-services.json` into the
    **Courtside** folder on your Desktop.
13. Tell Claude: "google-services.json is in the folder". Claude uploads it to
    Expo as a private file setting called `GOOGLE_SERVICES_JSON`, in **both**
    the **preview** and the **production** environments (a preview .apk reads
    the preview set; with the file only in production, the test .apk would be
    made without push). The file is never put on GitHub.

## 2. Give Expo the FCM V1 key (so alerts reach Android phones)

**Why:** Expo's push service sends CourtSide's alerts. For Android it needs
permission from your Firebase project, and this key is that permission.
**Do this before the first Android build** (see "The order matters").

1. In the Firebase console (same project), click the **gear icon** next to
   **Project Overview** in the top left, then **Project settings**.
2. Click the **Service accounts** tab.
3. Click **Generate new private key**, then **Generate key**. A file with a
   long name ending in `firebase-adminsdk-....json` downloads. This is the
   private one.
4. Open https://expo.dev and sign in to the account that holds CourtSide
   (robertzchen).
5. Click **Projects**, then **courtside**.
6. In the left menu, click **Credentials**.
7. Under **Android**, click **co.courtside.app**. If it is not listed yet,
   click **Add Application Identifier** (or **+**), type `co.courtside.app`,
   and save; then click it.
8. Find **Service Credentials** → **FCM V1 service account key** and click
   **Add a service account key**.
9. Choose **Upload new key**, pick the `firebase-adminsdk` file from Downloads,
   and click **Save**.
10. Move that file from Downloads to the Bin. Expo keeps its own copy, and a
    new one can always be made in step 3.

The database side is migration 106 (in the code, not run yet): alerts to
Android phones are sent as "high priority", so a phone left idle on a table
still shows a message straight away, and each alert names its group
("Messages", or "Likes, replies and follows") so people can switch one off
and keep the other. Claude runs it in Supabase's SQL editor once you say go,
and it has to be done before the first Android build: an alert that reaches
an Android phone before it runs creates a permanent extra "Miscellaneous"
group on that phone (see "The order matters").

## 3. Google sign-in on Android: nothing to do

The Android app returns from Google to the same address the iPhone app
already uses (`courtside://auth`), which Supabase already allows, so there is
no setting to add. It also uses the safer "PKCE" way on Android: what comes
back from Google is a one-time code that only this phone can use, not the
login itself.

Apple sign-in has no Android button (Apple does not offer one there). Someone
who made their account with Apple on an iPhone sees a line on Android's
sign-in page telling them to set a password on the iPhone first (Settings →
Account center → Set a password) and then sign in with that email.

### Only if Claude later switches to Google's own Android sign-in button

Skip this for now. A built-in Android Google button (the "one tap" sheet)
would need Google to know the app's SHA-1 fingerprints. If that day comes:

1. **Two fingerprints to collect** (they exist only after the first Android
   build and the first upload to Google Play):
   - **Expo's (upload key):** expo.dev → **Projects** → **courtside** →
     **Credentials** → **Android** → **co.courtside.app** → under **Build
     Credentials**, copy the **SHA-1 Fingerprint**.
   - **Google Play's (app signing key):** Play Console → CourtSide → **Test
     and release** → **App integrity** → **App signing** → under **App
     signing key certificate**, copy the **SHA-1 certificate fingerprint**.
     Phones that install from Google Play carry this one, not Expo's.
2. Open https://console.cloud.google.com and pick the Google Cloud project
   that holds CourtSide's Google sign-in (the one whose client ID is pasted
   in Supabase under **Authentication** → **Sign In / Providers** → **Google**).
3. Go to **Google Auth Platform** → **Clients** (older screens call it **APIs
   & Services** → **Credentials**), click **+ Create client** (or **+ Create
   credentials** → **OAuth client ID**).
4. **Application type:** Android. **Name:** `CourtSide Android (Play)`.
   **Package name:** `co.courtside.app`. **SHA-1 certificate fingerprint:**
   paste Google Play's one. Click **Create**.
5. Repeat step 4 with the name `CourtSide Android (Expo)` and Expo's SHA-1, so
   test builds can sign in too.

## 4. The first build (when you say go)

**Flag: Expo builds count towards your Expo plan's monthly builds, the same
as iPhone builds.** Nothing is started without your go-ahead.

- **Preview (.apk):** for trying on an Android phone straight away, before
  Google is involved. Expo gives a link; open it on the phone, download, and
  allow the install when Android asks. Remember which phones have it: before
  CourtSide can be installed from Google Play on one of them, the test .apk
  has to be uninstalled first (see 5g, step 2).
- **Production (.aab):** for Google Play. Expo gives you the expo.dev page
  where the **.aab** file can be downloaded, for step 5.

Expo creates the app's signing key on the first build and keeps it safe. Say
yes if it asks to "generate a new Android Keystore".

**One setting for the test .apk to get instant updates:** the .apk listens
for updates on Expo's "preview" channel, and `npm run update` publishes to
"production". With your OK, Claude points the preview channel at the
production updates once (`eas channel:edit preview --branch production`,
which changes a setting on Expo's website, nothing else). Without it the .apk
stays on the code it was built with.

## 5. Google Play: closed testing with 12 testers for 14 days

**Why:** Google requires new personal developer accounts to run a closed test
with **at least 12 testers who stay opted in for 14 days in a row** before the
app can go public. Your identity checks must be finished first.

### 5a. Create the app

1. Open https://play.google.com/console and click **Create app**.
2. **App name:** `CourtSide`. **Default language:** your choice (for example
   English (United Kingdom)). **App or game:** App. **Free or paid:** Free
   (**this cannot be changed to paid later**).
3. Tick both declarations (Developer Program Policies and US export laws),
   then click **Create app**.

### 5b. The "Set up your app" forms

On the app's **Dashboard**, Google lists forms to fill in: privacy policy,
app access, ads, content rating, target audience, data safety and a few
more. Useful answers:

- **Privacy policy:** `https://app.courtsidebase.com/privacy.html`
- **Delete account URL** (asked in the **Data safety** form, because people
  can make accounts): `https://app.courtsidebase.com/privacy.html#delete-account`
  That spot on the privacy page says how to delete an account in the app and,
  without the app, on the website. It is live once main has been pushed (see
  "The order matters").
- **App access:** "All or some functionality is restricted", then give a
  test email and password for a reviewer account (the same kind of login
  given to Apple's reviewers).
- **Ads:** No.
- **Data safety, a few answers the code decides:**
  - **Contacts:** collected, only to find friends; sent to CourtSide's server,
    checked against accounts, then deleted; not shared; optional. (The app
    says so on screen before Android's own question, which Google requires.)
  - **Location:** approximate and precise, while the app is open, for the map
    and players near you; optional.
  - **Photos and videos:** only the ones you choose to post or send.
  - **Crash logs:** collected (the app files its own crash reports).
  - The Android app has no Google Maps and no advertising ID in it.

Tell Claude "draft the Play forms" and Claude writes the rest (content
rating, target audience, the full data safety form) from the app's code, the
way the App Store listing was written, for you to paste in.

### 5c. Phones only, for now (tablets and foldables)

**Why:** CourtSide's layout is made for phones. Android 16 lets big tablets
and the inside screen of a folding phone turn any app sideways and stretch it,
and the app has not been checked that way yet. Leaving them out of the test is
the safe start; they can be added later.

1. Left menu: **Test and release** → **Reach and devices** → **Device catalog**
   (older screens: **Release** → **Device catalog**).
2. Click the **Tablet** filter (under **Form factor**), tick every tablet
   listed with the box at the top of the list, then **Exclude devices** and
   confirm. Do the same for **Foldable** if it is offered.

### 5d. Make the testers list

1. Left menu: **Test and release** → **Testing** → **Closed testing**.
2. Next to the track called **Closed testing - Alpha**, click **Manage track**.
3. Open the **Testers** tab and click **Create email list**.
4. **List name:** `CourtSide testers`. Add the Gmail address (Google account)
   of each tester, separated by commas, and press Enter. Use **15 to 20**
   people, not exactly 12: if anyone leaves during the 14 days, the count
   must still be 12 or more.
5. Click **Save changes**. Tick the new list so it is selected for the track,
   fill in **Feedback URL or email address** (for example
   support@courtsidebase.com), and click **Save**.

### 5e. The store listing pictures

Left menu: **Grow users** → **Store presence** → **Main store listing**.

- **App icon (512 × 512):** `store/google-play/icon-512.png` (the beige icon
  you chose, saved in the format Google Play asks for: a PNG with a
  see-through layer, 32-bit, under 1 MB. The `assets/logo-beige-512.png` copy
  lacks that layer and may be refused).
- **Feature graphic (1024 × 500):** `store/google-play/feature-graphic-1024x500.png`
  (cream, the green mark and name, one line about the app).
- **Phone screenshots (2 to 8):** these are best taken on the first Android
  test build, so they show Android's own status bar and buttons rather than an
  iPhone's. Claude can make them from the preview .apk once it is installed.

### 5f. Upload the first build

Google's rule: the very first build has to be uploaded by hand on this
website. Later ones can be sent from Expo (see 5h).

1. Still in **Closed testing - Alpha**, click **Create new release**.
2. If it asks about **app signing**, choose **Use Google-generated key** (the
   recommended option) and continue.
3. Under **App bundles**, click **Upload** and pick the **.aab** file from
   step 4.
4. **Release notes:** for example `First test version of CourtSide.`
5. Click **Next**, then **Save**.
6. Left menu: **Publishing overview** → **Send changes for review**. Google
   checks it (from a few hours to a few days). **This makes the app
   installable by your testers, still not public.**

### 5g. Get the testers in, then wait 14 days

1. When the review is done, go back to **Closed testing - Alpha** →
   **Testers** tab, and copy the link under **Join on Android** (or **Join on
   the web**).
2. Send that link to your testers. Each one opens it on their Android phone,
   signed in with the same Gmail address you listed, taps **Become a tester**,
   then **Download it on Google Play**.
   **On a phone that still has the test .apk from step 4** (yours, say),
   uninstall it first: **Settings → Apps → CourtSide → Uninstall**. The .apk
   is sealed with Expo's key and Google Play's copy with Google's, and
   Android will not put one over the other: Install fails with a "conflicts
   with an existing package" message. After installing from Google Play,
   sign in again.
3. The 14 days count from when 12 testers have opted in. They should keep the
   app installed and open it now and then; Google asks what they thought.
4. After 14 days, the Dashboard shows **Apply for production**. Click it and
   answer the questions about the test (who tested, what feedback came in,
   what changed). Claude can draft the answers. Google replies within about a
   week. **Production is the public release on Google Play.**

### 5h. Optional, later: let builds go to Google Play without dragging files

So that new builds go to Google Play without you dragging files in, Google
Play needs a "service account" (a robot login) for Expo. Ask Claude to walk
you through it when the first build is up; until then, uploading by hand
works fine. When set up, uploads land in **Closed testing - Alpha** as a
**draft**, so nothing reaches testers until you press the button.

## 6. What to try on the first Android test build

Most of the Android work could only be checked by reading the code, because
this Mac cannot run Android. On the first .apk, these are worth a minute each:

- **Typing:** a chat (the box sits right on the keyboard; the emoji keyboard
  is the same height), sign-up's lowest boxes, setup's lowest boxes
  ("Invited by?", "Goal", "Next tournament"), the instant's caption, the
  birthday page, Account center's password sheet.
- **Back button:** on the birthday page opened from the group form's "Add
  your birthday" (it should go back, not close the app); in a chat with the
  emoji keyboard or the + tray open; in
  Create (caption → editor → photos; a session's post asks "Discard post?");
  on a sheet (it slides down); on Community with a search open; during setup.
- **Photos and videos:** pinch and swipe-down on a full-screen photo; move and
  zoom in the profile-photo crop; close a full-screen video and check the
  clip on the page is still playing; rounded corners on clips in cards.
- **Instagram Stories** from Share, with and without Instagram installed.
- **Google sign-in**, and Account center afterwards (it stays put).
- **Alerts:** a message from another phone while CourtSide is closed, then
  Settings → Apps → CourtSide → Notifications shows Messages, Likes replies
  and follows, and Reminders.
- **Look:** the launch (the mark should not move as the app opens), the
  leaning logo, bold titles in the same typeface as on iPhone, the tab bar in
  the theme's colour, the New York theme's status bar.
- **An HDR clip** from a Pixel or Samsung (see 7), viewed on the website and
  an iPhone afterwards.

## 7. Later: things that need a new build of both apps

These need a new native part (a "package with phone code"), so they only
arrive with a new build, and the iPhone and Android builds must move to a
new version together (bump `version` in app.config.js). None is needed for
the closed test.

- **Navigation-bar buttons that follow the Night and New York themes**
  (`expo-navigation-bar`, Android code only). Today the bar under the app is
  light with dark buttons, which suits the cream and the four city courts.
  With it, the bar would turn dark on the two dark themes too.
- **Saving a clip or picture to the gallery** (`expo-media-library`).
  Android's share sheet has no "save to gallery", so on Android a post's
  menu says **Share original**, and Share has no Save button. With it, both
  would save straight to the phone's gallery.
- **HDR clips from Android cameras.** iPhones turn HDR clips into normal ones
  as they are picked; Android does not, and the compressor keeps the HDR
  labels, so an HDR clip from a Pixel or Samsung could look washed out. Check
  on the first test build (6). If it does, the fix is either a small manifest
  setting that makes Android hand over a normal copy, or a converter package.
  Until then: turn **HDR video** off in the camera's settings before filming.
- **Health Connect** (Samsung Health, Pixel Watch, Fitbit, Garmin on
  Android), after launch. A new package, the manifest permissions, and a
  "Health apps" declaration in Play Console (you). Until then Android's tennis
  sessions come from WHOOP and the other trackers, and Apple Health shows
  only for someone who connected it on an iPhone.
- **Shared links opening in the app** ("App Links": a post, a profile or a
  group link from app.courtsidebase.com opening in the Android app rather
  than the website). A choice for you: the iPhone app does not do it either
  today. If wanted, it takes a build, a small file on the website, and the
  Play app-signing fingerprint (step 3's list, Google Play's one).
- **A "Continue with Apple" button on Android** (optional): Supabase's web
  Apple sign-in in the same in-app browser as Google. It needs an Apple
  "Services ID" and a signing key added to Supabase (the key expires every six
  months). The line on the sign-in page covers it meanwhile.

## What the Android work changed (for reference)

All of it is Android-only unless it says otherwise, and the generated iPhone
project is identical to before.

- **Keyboard:** Android draws the app under the keyboard (always, in this
  Expo version) and never shrinks the window, so every page now makes room
  for the keyboard itself.
- **Back button:** steps back inside a page (chat panels, Create's steps,
  setup, sheets, searches, the map's cards) instead of closing it.
- **Sign-in:** Google returns to the same address as on iPhone, with PKCE;
  password-manager autofill; a line for Apple-account people.
- **Photos and videos:** gestures in full-screen viewers and the photo crop;
  Android's own Photo Picker with no permission question; exact cover frames;
  rounded, croppable video; the camera's instant is mirrored like its preview.
- **Instagram Stories** straight into Instagram.
- **Alerts:** three channels, on-time delivery (migration 106), a Settings row
  when alerts are off, the in-app banner standing aside under Android's own
  windows, read chats' alerts cleared.
- **Look:** the leaning logo, Inter Bold, the launch screen's mark staying
  put, the theme's own glass colour, brand-green cursor, light status-bar
  icons over black pages and New York's navy (that one on iPhone too).
- **Instant updates** go to both platforms; crash reports name the Android
  phone.
