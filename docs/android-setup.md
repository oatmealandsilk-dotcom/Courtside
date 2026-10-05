# CourtSide on Android: setting it up

The app's code is ready for Android. What is left is a handful of accounts
and files that only you can make, because they need your Google login. This
page lists them in order, click by click. Nothing here costs money, and
nothing here makes anything public, except where a step says so in bold.

No Android build has been made yet. Claude makes the first one when you say
go, once Google has verified your identity.

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
- **Package name**: the Android app's permanent ID, `co.courtside.app`, the
  same as the iPhone app's. It can never change once a build is on Google Play.
- **SHA-1 fingerprint**: a short code (pairs of letters and numbers separated
  by colons) that identifies the key an Android app is signed with. Like the
  serial number on a wax seal.
- **Closed testing**: a private release on Google Play that only the people
  you invite can install.

## What you do, and what Claude does

You: steps 1, 2, 3 and 5 below (they need your Google and Expo logins).
Claude: everything else, including making the builds and uploading the
Firebase file to Expo, each only after you say go.

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
    Expo as a private file setting called `GOOGLE_SERVICES_JSON`, so every
    Android build picks it up. The file is never put on GitHub.

## 2. Give Expo the FCM V1 key (so alerts reach Android phones)

**Why:** Expo's push service sends CourtSide's alerts. For Android it needs
permission from your Firebase project, and this key is that permission.

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

Nothing in the database needs changing: alerts are already sent through
Expo's push service, which now knows how to reach Android phones too.

## 3. Google sign-in on Android

**How it works today:** the **Continue with Google** button opens Google's
page in a sheet inside the app, and CourtSide's server (Supabase) talks to
Google. That is the same way it works on the website, so Google needs **no
Android-specific setting**. There is only one thing to check:

1. Open https://supabase.com/dashboard, sign in, and open the CourtSide project.
2. In the left menu: **Authentication** → **URL Configuration**.
3. Under **Redirect URLs**, look for `courtside://**`.
   - If it is there, you are done.
   - If it is not, click **Add URL**, paste `courtside://**`, and click
     **Save URLs**. This is the address the Android app returns to after
     Google; the star pattern also covers the iPhone's `courtside://auth`,
     so nothing that works today changes.

(Or tell Claude "check the Google redirect" and Claude does it in your
browser with you watching.)

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

## 4. The first build (Claude, when you say go)

**Flag: Expo builds count towards your Expo plan's monthly builds, the same
as iPhone builds.** Claude says before starting one.

- **Preview (.apk):** for trying on an Android phone straight away, before
  Google is involved. Expo gives a link; open it on the phone, download, and
  allow the install when Android asks.
- **Production (.aab):** for Google Play. Claude starts it and gives you the
  expo.dev page where the **.aab** file can be downloaded, for step 5.

Expo creates the app's signing key on the first build and keeps it safe. Say
yes if it asks to "generate a new Android Keystore".

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
- **App access:** "All or some functionality is restricted", then give a
  test email and password for a reviewer account (the same kind of login
  given to Apple's reviewers).
- **Ads:** No.

Tell Claude "draft the Play forms" and Claude writes the rest (content
rating, target audience, data safety) from the app's code, the way the App
Store listing was written, for you to paste in.

### 5c. Make the testers list

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

### 5d. Upload the first build

Google's rule: the very first build has to be uploaded by hand on this
website. Later ones Claude can send from Expo (see 5f).

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

### 5e. Get the testers in, then wait 14 days

1. When the review is done, go back to **Closed testing - Alpha** →
   **Testers** tab, and copy the link under **Join on Android** (or **Join on
   the web**).
2. Send that link to your testers. Each one opens it on their Android phone,
   signed in with the same Gmail address you listed, taps **Become a tester**,
   then **Download it on Google Play**.
3. The 14 days count from when 12 testers have opted in. They should keep the
   app installed and open it now and then; Google asks what they thought.
4. After 14 days, the Dashboard shows **Apply for production**. Click it and
   answer the questions about the test (who tested, what feedback came in,
   what changed). Claude can draft the answers. Google replies within about a
   week. **Production is the public release on Google Play.**

### 5f. Optional, later: let Claude upload builds for you

So that new builds go to Google Play without you dragging files in, Google
Play needs a "service account" (a robot login) for Expo. Ask Claude to walk
you through it when the first build is up; until then, uploading by hand
works fine. When set up, Claude's uploads land in **Closed testing - Alpha**
as a **draft**, so nothing reaches testers until you press the button.
