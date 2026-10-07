# CourtSide: App Store listing, version 1.0 (build 16)

Everything you type into Apple's forms to send CourtSide to the App Store, in the order you meet it, ready to copy. Rewritten Oct 7, 2026 for **build 16**, from the app as it is on `main`, the live database, the live website and the live sign-in settings.

**This is the only pack now.** It replaces `~/Desktop/CourtSide-AppStore-Pack.md` (Oct 6) and `~/Desktop/CourtSide-AppStore-Checklist.md` (Oct 5). Both now say so at the top. To open this one: Desktop → `Courtside` folder → `store` → `app-store-listing.md`.

**What changed for build 16 (Oct 7)**

- **Build 16 everywhere.** Build 15 is too old to send: its camera pop-up doesn't mention videos. Build 16 has its own update channel (`store`), so instant updates can't reach the copy Apple reviews.
- **Pre-order** for **Tue Oct 13**, set up before you submit (section 2 and item 8K).
- **Screenshots:** folder `CourtSide-Store-Screenshots-C` (was B).
- **Review notes:** how to try Start a session and hits, the new + menu, reporting a group, Ask for a review, Hidden words as it now starts. Recounted: 3,898 of 4,000.
- **Description:** one new line for Start a session. **What's New** added (from the Oct 6 Desktop pack, plus today's features).
- **Privacy label:** checked against build 16. No boxes change; a few "what it is" notes added.
- **Demo-account steps** follow today's app (+ → Session, Not now and Continue after setup).
- **Settings is under ☰:** Profile → ☰ (top right) → Settings. The gear went on Oct 5; every path here, the review notes too, now says ☰.
- **New must before Submit:** the privacy policy's camera line (item 8L).

Earlier changes (Oct 5 and 6) are in this file's history.

**How to use it**

- **Copy only what is inside the grey boxes.** Anything in `[square brackets]` is a blank for you to fill in first.
- Every box with a character limit says how many characters it uses. A script counted them, spaces included.
- Section 0 is the short list of things that must be true **before** you press Submit. Section 9 is your to-do list.

**Words used below**

| Word | What it means |
|---|---|
| App Store Connect | Apple's website for publishing apps: appstoreconnect.apple.com. You sign in with your Apple Developer account (Robert Chen, Individual). |
| App Review, reviewer | Apple's team that tests every app before it goes on the store, and the person who tests yours. |
| Build | One packaged copy of the iPhone app uploaded to Apple. **Build 16** is the one to send. |
| TestFlight | Apple's app for installing a build on your phone before it's public. |
| Pre-order | The App Store page goes up before the app can be downloaded. People tap "Pre-Order" (free), and the app downloads by itself on release day. |
| Supabase | The online service that holds CourtSide's database (accounts, posts, messages) and runs sign-in. |
| Server switch | A setting in the database that turns a feature on or off for everyone without a new build. |
| Database update (migration) | A numbered file of changes to the database. Claude writes them; they go live only with your yes. |
| Secret | A private key stored in Supabase. It works like a password, so only you type it in. |
| Demo account | A login you give Apple so the reviewer can get into the app. |
| Instant update | New app code Expo sends to phones that already have the app, with no new build. |
| Channel | The "mailbox" a build checks for instant updates. Builds 11 to 15 use `production`; build 16 uses `store`, which stays empty during review. |

---

## 0. Must be true before you press Submit

Each of these would likely get the app rejected. Details are in the sections named.

1. **Sign in with Apple works.** Checked Oct 7, evening: Supabase still has Apple sign-in **off**. The Apple button shows on every iPhone, and tapping it gives an error. Reviewers almost always tap it. Steps in section 8, item A.
2. **The Sign in with Apple key is in Supabase.** Apple requires that deleting an account made with Apple also removes CourtSide from that person's Apple ID (Apple calls it "revoking the token"). The code is ready; it needs your key. Steps in section 8, item B.
3. **Hidden words is live. Done.** Apple's rule 1.2 says apps where people post **must** have "a method for filtering objectionable material". Hidden words is that filter (section 8, item C). Checked Oct 7: database update 148 is live, so adults start with it off and can switch it on, under-18s always have it on, and slurs and threats are refused for everyone.
4. **Build 16 is in TestFlight and you have tried it** (section 8, item D). Not build 15.
5. **The pre-order is set up**, release date **Tue Oct 13** (section 2, item 8K).
6. **The two demo accounts exist, with something in them** (section 6).
7. **Every row a reviewer can tap works**, or is hidden for the review: Phone number, WHOOP, Google sign-in (section 8, items E to G).
8. **The privacy policy's camera line is fixed on the website** (section 8, item L).

---

## 1. App Information page

**Where:** App Store Connect → **Apps** → **CourtSide** → left sidebar, under "General" → **App Information**.

### Name (limit 30)

```text
CourtSide: Tennis Community
```

27 characters. The name under the icon on phones stays "CourtSide". The extra words help search, because Apple weighs words in the name heavily. If App Store Connect says the name is taken, use `CourtSide: Tennis Players` (25) or `CourtSide Tennis` (16).

### Subtitle (limit 30)

```text
Find players & courts near you
```

30 characters. It sits under the name in search results. It names what the app opens on (the map) and adds three search words ("players", "courts", "near"). The brand line from screenshot 01 also fits if you prefer it: `Find someone to hit with` (24).

### Category

- **Primary Category:** Sports
- **Secondary Category:** Social Networking

### Content Rights

App Store Connect asks: **"Does your app contain, show, or access third-party content?"** ("Third-party" means it belongs to someone else.)

Choose: **"Yes, it contains, shows, or accesses third-party content, and I have the necessary rights."**

Why that's true today:

- **Members' posts, clips and messages.** People keep ownership of what they post, and the Terms of Service give CourtSide the right to show it.
- **The map:** map data from OpenStreetMap, shown under its open licence with the credit "Map data © OpenStreetMap contributors" (the map's ⓘ card and the About page).
- **Weather** from Open-Meteo, credited the same way ("Weather by Open-Meteo.com"). Its free service is for non-commercial use. CourtSide earns nothing today, so that's fine for now; before paid lessons start, buy their plan or switch to Apple's weather (it costs money; Claude will remind you).
- **Link previews:** when someone sends a link in a chat, the title and picture of that page show as a card, the way every messaging app does.
- The Reddit and Talk Tennis threads that the old listing worried about were **removed** from the app. Nothing from other forums is shown.

### Age Rating

Click **Edit** next to Age Rating and answer from section 3.

### License Agreement

Leave **Apple's standard license agreement**. The extra rule Apple wants (no tolerance for objectionable content or abusive users) is in CourtSide's own Terms, and everyone agrees to it at sign-up and on the one-time Community guidelines screen.

---

## 2. Pricing and Availability (with the pre-order)

**Where:** left sidebar → **Pricing and Availability**. Do this on **Thu Oct 8**, before you submit.

**Why a pre-order:** Apple can approve the app any day this week, but launch is **Tue Oct 13**. A pre-order puts the App Store page up as soon as you release it after approval, so people can tap "Pre-Order" and share the link, and the app downloads by itself on their phones on Oct 13.

### Price

**Free** (USD 0.00). If a price is already set, leave it. If not: **Price Schedule** → **Add Pricing** → choose **USD 0.00 (Free)** → **Next** → **Confirm**.

### Where, and when (the pre-order)

These are Apple's own steps, in Apple's order:

1. Scroll to **App Availability** and click **Set Up Availability**.
2. Choose **Publish as Pre-Order**, then **Next**.
3. **Release date:** **Tue Oct 13, 2026**, then **Next**.
4. Countries: **Deselect All**, then tick **United States** only, then **Next**.
5. Click **Confirm**. The pre-order now shows under **Pre-Orders** on that page. Nothing is public yet.

**If you see Manage instead of Set Up Availability** (you chose the countries on an earlier day): click **Manage** → **Set Up Pre-Order**, then the same date (Tue Oct 13), United States only, and **Confirm**.

**The date rule:** Apple only accepts a release date 2 to 180 days in the future. Set on Thu Oct 8, Oct 13 is fine. **Sun Oct 11** is the very last day it could still work; don't leave it that late.

Why US only at first:

- **Australia** bans social media accounts for under-16s, and CourtSide allows 13 to 15 year olds.
- **The European Union** asks whether you are a "trader". If you say yes, your name, address, phone and email are **shown publicly** on the EU store page.
- It also keeps the later move to paid lessons simple. You can add countries any time without a new review.

---

## 3. Age rating questionnaire

**Where:** App Information → **Age Rating** → **Edit**. Apple may show the questions in a slightly different order.

### First, 12+ and 17+ no longer exist

Apple changed its age ratings in July 2025. The old **12+ is now 13+**, and the old **17+ is now 18+**; there is also a new **16+**. The full set is **4+, 9+, 13+, 16+ and 18+**. The Age Rating page works it out from your answers and shows the result at the end as the **Calculated Rating**.

### What decides CourtSide's rating

- **People posting things (user-generated content) and direct messages** count, but on their own they only make an app 4+.
- **A social feed** (posts that spread to many people, with likes, comments and shares) is what makes an app **13+**. Apple calls this "Social Media".
- **Location is not part of the age rating at all.** It's covered by the App Privacy label (section 4) and the iPhone's own permission pop-up.
- **16+** would need a browser inside the app that can go to any website, or *frequent* medical advice, or *frequent* suggestive content. CourtSide has none of these.
- **18+** would need frequent sexual content, frequent realistic violence, or gambling. CourtSide has none of these.

**So the answer is 13+**, which is also the minimum age in CourtSide's Terms. Choosing 18+ by hand isn't recommended: iPhones set up for teens would hide CourtSide, which works against the teen accounts you built on purpose.

### The answers

| Section | Question | Answer | Why |
|---|---|---|---|
| In-App Controls | Parental Controls | **No** | Nothing lets a parent manage a teen's account. |
| | Age Assurance | **No** | The birthday is typed in and taken on trust. Apple's examples are its own age-range check, face-based age estimates, or ID checks. Ticking it wouldn't change the rating anyway. |
| Capabilities | Unrestricted Web Access | **No** | Links open in Apple's Safari window, where you can't type an address, and the map is CourtSide's own page. There is no browser to roam the web. |
| | User-Generated Content | **Yes** | Clips, photos, instants, comments, threads, replies. |
| | Social Media | **Yes** | The Feed spreads posts to many people with likes, comments, shares and view counts. **This is the answer that makes it 13+.** |
| | Social Media Disabled for Users Under 13 | **No** | Doesn't apply: nobody under 13 can join at all. |
| | Messaging and Chat | **Yes** | Direct messages and group chats. |
| | Advertising | **No** | No ads anywhere. |
| Mature Themes | Profanity or Crude Humor | **Infrequent** | Members can write the odd swear word. |
| | Horror/Fear Themes | **None** | |
| | Alcohol, Tobacco, or Drug Use or References | **None** | |
| Medical or Wellness | Medical or Treatment Information | **Infrequent** | Players talk about injuries like tennis elbow in Discussions. The app gives no medical advice and says so. |
| | Health or Wellness Topics | **Yes** | Training, fitness, Apple Health numbers. |
| Sexuality or Nudity | Mature or Suggestive Themes | **None** | The Terms forbid it. |
| | Sexual Content or Nudity | **None** | |
| | Graphic Sexual Content and Nudity | **None** | |
| Violence | Cartoon or Fantasy Violence | **None** | |
| | Realistic Violence | **None** | |
| | Prolonged Graphic or Sadistic Realistic Violence | **None** | |
| | Guns or Other Weapons | **None** | |
| Chance-Based Activities | Simulated Gambling | **None** | |
| | Contests | **Frequent** | Weekly challenges with standings, streaks, head-to-head records and match scores. Apple counts "sport or fitness contests". Frequent is 13+, the same as the rest, so it costs nothing. |
| | Gambling | **No** | |
| | Loot Boxes | **No** | |

### The last screen

- **Calculated Rating:** expect **13+**. If it shows anything lower, choose **Override to Higher Age Rating → 13+**. Apple requires this when your own Terms set a higher minimum age.
- **Made for Kids:** don't choose it.
- **Age Suitability URL:** leave blank.
- Click **Save**.

**If the reviewer disagrees:** the most likely change is Apple deciding that Safari links count as web access, which would make it 16+. That only changes who can download it on a teen's iPhone; nothing else needs doing.

Groups being open to teens (since Oct 7) doesn't change any answer here.

---

## 4. App Privacy ("nutrition label")

**Where:** left sidebar → **App Privacy**. These answers belong to the app, not to a build, so you can correct them any time without a new review.

### The two addresses

1. Next to **Privacy Policy URL**, click **Edit**, paste this, then **Save**:

```text
https://app.courtsidebase.com/privacy.html
```

2. **User Privacy Choices URL:** leave blank.

(The CourtSide addresses in this pack were checked on Oct 7 and open.)

### Apple's three questions, in plain words

For each kind of data, Apple asks:

1. **Collected?** Does it leave the phone and get kept, by CourtSide or a company working for it, longer than it takes to answer right then?
2. **Linked to the user?** Is it kept with the person's account? At CourtSide almost everything is.
3. **Used for tracking?** **No, for every single one.** "Tracking" means combining what you know about someone with other companies' data for ads, or selling it to data brokers. CourtSide has no advertising or analytics code (checked: `package.json` has none), never reads the iPhone's advertising ID, and sells nothing. So the app never shows the "Allow tracking?" pop-up.

And for each one it asks **what it is used for** (the purpose). Four purposes apply:

- **App Functionality:** making the app work.
- **Product Personalization:** changing what someone sees based on them (the feed's order, "Players you might know", players near you).
- **Analytics:** CourtSide's own count of how many people open the app each day (`app_opens`), kept in its own database. Tick it only where the table says.
- **Developer's Advertising or Marketing:** tick it on **Photos or Videos** and **User ID** only. Most posts have a "Let CourtSide feature this on its Instagram" switch, on unless the person turns it off (before posting, or later in Edit post), so CourtSide may repost a member's photo or clip, credited to their @handle, on its own Instagram to promote the app. That's marketing use, and Apple wants it declared (section 8, item J).

Never tick **Third-Party Advertising** or **Other Purposes**.

### Step by step

1. Next to **Data Types**, click **Get Started** (or **Edit**).
2. Choose **"Yes, we collect data from this app"**, then **Next**.
3. Tick **exactly these 19 types**, then **Save**:
   - Contact Info: **Name**, **Email Address**, **Phone Number**
   - Health & Fitness: **Health**, **Fitness**
   - Location: **Precise Location**, **Coarse Location**
   - **Contacts**
   - User Content: **Emails or Text Messages**, **Photos or Videos**, **Audio Data**, **Other User Content**
   - **Search History**
   - Identifiers: **User ID**, **Device ID**
   - Usage Data: **Product Interaction**
   - Diagnostics: **Crash Data**, **Other Diagnostic Data**
   - Other Data: **Other Data Types**
4. Each ticked type now has a **Set Up** button. For each one, answer from the table below: tick the purposes, then "Is this data linked to the user's identity?" and "Do you or your third-party partners use this data for tracking purposes?"
5. When every type says it's set up, click **Publish** (top right of the App Privacy page). Nothing is saved for Apple until you press Publish.

| Data type | Linked? | Tracking? | Purposes to tick | What it is in CourtSide |
|---|---|---|---|---|
| **Name** | Yes | No | App Functionality | Display name; the name Apple or Google shares at sign-in; a coach applicant's full name |
| **Email Address** | Yes | No | App Functionality | Sign-in and password resets; coach applications. Never shown to others. |
| **Phone Number** | Yes | No | App Functionality | A number linked in Settings → Phone number (checked with a texted code), and a coach applicant's number. Never shown. |
| **Health** | Yes | No | App Functionality | From Apple Health: sleep, heart rate variability, resting heart rate, food totals, and the average and maximum heart rate of a workout. From WHOOP, if connected: recovery, sleep, HRV. Also private injury notes for the coach. |
| **Fitness** | Yes | No | App Functionality | Steps, active energy, workouts (tennis, runs, rides, the gym), logged sessions and matches, streaks, the tennis profile. A live session's running timer stays on the phone; only the session you log or post reaches CourtSide. |
| **Precise Location** | Yes | No | App Functionality | An adult's spot on the map, to about 10 m, while they share it with "Players nearby" or "Only people you follow back". Deleted the moment Location is turned off. The court an adult checks in at ("I'm playing here", or **Start a session** at a court), shown to the same people for two hours at a time (a live session renews it while it runs, and Finish ends it). Also the point sent to place search when adding a place to a post. |
| **Coarse Location** | Yes | No | App Functionality, Product Personalization | The town on a profile; the rough (about 1 km) area kept for teens and "Only me"; the rounded point sent for the weather; players and open hits near you |
| **Contacts** | Yes | No | App Functionality, Product Personalization | Who follows whom (Apple counts a follow list as a "social graph"), including a follow from the map's player card. Find friends from contacts sends phone numbers and emails from the phone's contacts, checks them, then throws them away. |
| **Emails or Text Messages** | Yes | No | App Functionality | Direct messages and group chats, including a hit's chat and its "called off" and "left" lines |
| **Photos or Videos** | Yes | No | App Functionality, **Developer's Advertising or Marketing** | Posts, clips, instants, a session's photo or clip, chat photos, profile photos. Marketing: a post left on "Let CourtSide feature this on its Instagram" (on by default) may be reposted on CourtSide's Instagram and in its own marketing. |
| **Audio Data** | Yes | No | App Functionality | Voice notes, and the sound on clips |
| **Other User Content** | Yes | No | App Functionality | Captions, comments, threads, replies, polls, questions to coaches, tips, bios, court notes, reports people send, requests to review a take-down, Hidden words lists, coach applications and résumés, and conversations with the AI coach once it's on |
| **Search History** | Yes | No | App Functionality | Post searches go to CourtSide's server and place searches to Photon (komoot's map search). CourtSide doesn't save them, but the services' request logs keep them for a few days, and the server's log knows which account searched. Declaring it is the safe side. |
| **User ID** | Yes | No | App Functionality, **Developer's Advertising or Marketing** | The account ID and @handle. Marketing: the @handle credits a reposted post. |
| **Device ID** | Yes | No | App Functionality | The phone's push address, so alerts reach it (hit call-offs and "Can't make it" included). A scrambled copy of each phone's push address is also kept (`device_sightings`) until the account is deleted, to catch invite fraud: someone counting a second account on the same phone as a player they invited. Apple counts fraud prevention as App Functionality. **Not** the advertising ID. |
| **Product Interaction** | Yes | No | App Functionality, Product Personalization, **Analytics** | Likes, saves, votes, follows, views; how long each post stayed on screen and when you last saw it (orders the feed, so posts you've already seen come after new ones; kept about two months); when a chat was last read; which days someone opens the app (only ever counted as daily totals) |
| **Crash Data** | Yes | No | App Functionality | Error reports saved to CourtSide's own database (`app_errors`) with the account ID |
| **Other Diagnostic Data** | Yes | No | App Functionality | The same reports: the screen, app version, phone type and system version |
| **Other Data Types** | Yes | No | App Functionality | Date of birth, for the age check. Never shown to anyone. |

**Checked Oct 7 against build 16: no box changes.** Start a session's check-in is the same court check-in as "I'm playing here" (Precise Location, already ticked). The feed's "seen" record is Product Interaction (already ticked). Hit alerts use the push address (Device ID). Follow on the map card is the follow list (Contacts). "Push to bottom" is a tool for admins and collects nothing from members. The words in the last column are for you; Apple only sees the boxes.

**Leave everything else unticked (No):**

- Physical Address, Other User Contact Info
- Payment Info, Credit Info, Other Financial Info: nothing can be bought in version 1.0, and cards are only ever typed into Stripe's own page
- Sensitive Info (Apple means things like religion or sexual orientation; heart rate isn't on its list)
- Gameplay Content, Customer Support (support is by email, outside the app), Browsing History
- Purchase History: nothing can be bought in version 1.0
- Advertising Data, Other Usage Data, Performance Data
- Environment Scanning, Hands, Head (Apple Vision Pro only)

**What the product page will then show**

- Data Used to Track You: **none**
- Data Linked to You: Contact Info, Health & Fitness, Location, Contacts, User Content, Search History, Identifiers, Usage Data, Diagnostics, Other Data
- Data Not Linked to You: **none**

**Three things to know:**

- Sharing to Instagram Stories hands the picture to the Instagram app only when the person taps Share. That's the person's own choice, not CourtSide collecting anything, so it isn't on the label.
- **The two marketing boxes stay ticked** (Developer's Advertising or Marketing on Photos or Videos and User ID), because the Instagram switch is on for everyone (section 8, item J). The Terms ("When CourtSide features your post") and the privacy policy say the same, so the label, the app and the website match.
- **Update the label before** any version that switches on paid lessons (add **Purchase History**: Yes, linked, App Functionality) or adds any outside analytics or advertising tool. The AI coach is already covered.

---

## 5. The version page

**Where:** left sidebar, under "iOS App" → **1.0 Prepare for Submission**.

### Previews and Screenshots

1. Under **Previews and Screenshots**, choose the **iPhone 6.9" Display** tab.
2. Delete any screenshots already there (hover → the ✕).
3. Drag in these 8 files, **in this order**, from Finder: Desktop → `CourtSide-Store-Screenshots-C` → `App Store 6.9 inch`. Use folder **C**, not B or the older ones: the file names are the same, so check the folder name.
   1. `01-find-someone-to-hit-with.png`
   2. `02-post-your-best-points.png`
   3. `03-up-3-2-on-mira-rematch.png`
   4. `04-make-the-win-your-story.png`
   5. `05-need-a-fourth-post-a-hit.png`
   6. `06-dont-break-the-streak.png`
   7. `07-ask-people-who-actually-play.png`
   8. `08-pick-your-court.png`
4. Check the order matches, then **Save** (top right).

Set C's files are 1320 × 2868 pixels with no transparency, which is exactly what Apple wants for this slot. Apple shrinks them for smaller iPhones, so no other sizes are needed. CourtSide is iPhone only, so no iPad screenshots. The **App Preview** (a video) is optional; skip it. (The 4 pictures in the project's `store/screenshots/` are out of date; don't use them.)

### Promotional Text (limit 170)

```text
Growing the game. Find someone to hit with near you, post your best points with the score built in, and keep your streak going.
```

127 characters. This is the only text you can change any time without a new review, so use it later for news ("New: …").

### What's New in This Version (limit 4,000)

Apple shows this box only for updates, so on version 1.0 you will probably **not** see it. If it is there, paste this. If not, skip it; nothing is lost.

```text
• Start a session when you get to the court: a live timer from Start to Finish, then log it with a photo or clip.
• Take a photo or record a video right from the post screen.
• Add a match score, like 6-4 3-6 10-8, to any session. It shows on your post and your share card.
• An Activities tab in the Feed: sessions from you and the people you follow.
• Your tennis profile in three tabs (Activity, Health and Game), with a weekly recap of your time on court.
• Streaks: a flame by your name from three days in a row, and "Friends on a streak" to see who's keeping theirs going.
• Hits: calling one off tells everyone who's in, and "Can't make it" frees your spot.
• Share your clips and photos straight to your Instagram story.
• Find friends from your contacts while you set up.
• Chats: hold a message to react, and turn read receipts on or off for each chat.
• Hidden words can hide offensive comments and messages from people you don't follow. If a post of yours is taken down, you'll see why and can ask for a review.
• A new app icon, long clips that shrink to fit instead of failing to upload, and lots of smaller fixes.
```

1,128 characters. Optional: paste the same text in **TestFlight** → build **16** → **Test Details** → **What to Test**, so your testers see what changed (only testers see it there).

### Description (limit 4,000)

```text
CourtSide is the social app for tennis. Find someone to hit with, post your best points, and talk tennis with people who actually play. Growing the game, one rally at a time.

FIND SOMEONE TO HIT WITH
• A map of tennis courts and players near you, with the weather.
• Open to hit: tap your ring and players near you see you're free to play, until the time you choose.
• Need a fourth? Post a hit. Pick a court and a time, and players tap "I'm in."
• Say "I'm playing here" at a court so players can find you there.
• Location is optional and only used while the app is open. You choose who sees you: other players see only your rough area, or your court while you check in; friends who follow you back can see where you are; or nobody at all.

POST YOUR GAME
• Clips and photos in a full-screen feed. Double-tap to like, then comment, save or send it to a friend.
• Start a session when you get to the court: a live timer, and others can see you're playing there if you choose.
• Add your score and session stats to a clip, or log a session just for you.
• Every session you log counts toward your streak.
• Instants: one photo right after you play. A five-second countdown, then the camera takes it. Instants stay up for 24 hours.
• Tag the people you played. Once they accept, your head-to-head record shows on your profiles.
• Turn any session into a share card for your Instagram story.

TALK TENNIS
• Discussions by topic: gear, technique, strategy, injuries, fitness, rules and the mental game. Vote up the replies that help.
• Join up to three groups, each with its own feed, for your club, your team or your regular crew.
• Direct messages and group chats with photos, voice notes and reactions.

APPLE HEALTH (OPTIONAL)
• Connect Apple Health in Settings, under Health and nutrition. Your tennis workouts come in with their average and maximum heart rate, so you can log a session in one tap.
• See your sleep, heart rate variability, resting heart rate, steps, active energy and food totals in one place.
• CourtSide only reads from Health and never writes to it. Your health data stays private: only a workout you post shows its heart rate and calories, and one switch hides them. It is never used for ads or sold.

YOUR PROFILE
• Your posts, your clips and the posts you're tagged in, with a tennis profile: your rating, play style, favorite surface and what you're working toward.
• Go private any time. Then only followers you approve see your posts.

MAKE IT YOURS
Seven looks: the warm CourtSide original, Night, Clean, and four city courts: Melbourne blue hard court, Paris clay, London grass and a New York night session.

SAFETY FIRST
• CourtSide is for ages 13 and up. Teen accounts start private, only people a teen follows can message them, and teens are never shown to strangers on the map.
• Report posts, profiles, threads, comments and messages. Block or mute anyone.
• Hidden words can hide offensive comments and messages from people you don't follow (always on for under-18s). Slurs and threats can't be posted.
• No ads. We don't sell your data or track you across other apps.

Training, injury and fitness content on CourtSide is general information, not medical advice.

Terms of Service: https://app.courtsidebase.com/terms.html
Privacy Policy: https://app.courtsidebase.com/privacy.html
```

3,320 characters.

**Why it says what it says**

- **Apple Health is named** because Apple rejects apps that use Health without saying so in the description (rule 2.5.1).
- **Location is described exactly:** other players see your rough area from any distance, or the court you've checked in at (for up to two hours); only friends who follow each other see your exact spot; or nobody. "Others … if you choose" on the Start a session line is there because the check-in follows the same choice: with "Players nearby", adults near the court see you there too, not only friends (and it never happens with Only me, with Location off, or for teens).
- **Hidden words "can hide"** because, since Oct 7, adults start with it off and switch it on themselves; it's always on for under-18s.
- **Left out on purpose:** the AI coach and paid lessons (both switched off in this version), WHOOP, Fitbit, Oura and Polar (not open to everyone), tournament names (trademarks: the themes use city names), the admins' "Push to bottom" tool, and the Instagram repost switch (the Terms and privacy policy explain it, and the description links to both).

**Optional coaching paragraph.** Add it only if at least one real coach is listed on the Coaching tab. Paste it between the TALK TENNIS and APPLE HEALTH sections, with an empty line above and below. It adds 152 characters (150, plus the empty line), making the description 3,472.

```text
COACHING
• Ask a coach: post what you're stuck on. Questions and answers are public, so everyone learns from the reply. Coaching on CourtSide is free.
```

### Keywords (limit 100)

```text
partner,hitting,match,doubles,coach,club,serve,racquet,score,streak,clips,social,training,workout
```

97 characters, 14 words. Keywords are hidden search words; customers never see them.

- Commas with no spaces (spaces waste the limit).
- No word that is already in the Name or Subtitle ("CourtSide", "Tennis", "Community", "Find", "players", "courts", "near", "you"): Apple searches those anyway.
- No trademarks (NTRP, UTR, tournament or racquet brand names) and no other apps' names. Apple's rule 2.3.7 forbids them.
- Apple combines keywords with the name, so "Tennis" + "hitting" + "partner" covers "tennis hitting partner".

### Support URL

```text
https://app.courtsidebase.com/support.html
```

It opens (checked Oct 7) and has the support email, how to report and block, and how to delete an account.

### Marketing URL (optional)

```text
https://courtsidebase.com
```

It opens CourtSide's home page ("The social media app for tennis"). After the pre-order page is up, Claude switches its "Get the iPhone app" button from TestFlight to the App Store link (a public website change, so Claude asks you first).

### Version

`1.0.0`. It already matches the app.

### Copyright

```text
2026 Robert Chen
```

Use your name **exactly** as it appears on your Apple Developer account (it's an Individual account, so Apple shows that name publicly as the seller). Year first, then the name, nothing else.

### Build

Under **Build**, click **Add Build** (or the **+**), choose **16**, click **Done**. **Not 15**: build 15 is older and its camera pop-up doesn't mention videos. If 16 isn't listed, it hasn't finished processing yet (it can take up to an hour after upload).

### App Store Version Release

Choose **Manually release this version.** After Apple approves, nothing goes public until you press **Release This Version**. With the pre-order set up, pressing it (then **Confirm** in the box that appears) puts the **pre-order page** up straight away (it can take up to 24 hours to show everywhere), and the app becomes downloadable by itself on **Tue Oct 13**. Pressing Release is the public step.

---

## 6. The demo accounts (you make these)

**Why:** everything in CourtSide is behind sign-in. Apple requires a working login it can use (rule 2.1), and an empty app looks broken, so the accounts need a little in them. Two accounts let the reviewer try messages, reporting and blocking on each other.

**Do this on your iPhone with build 16, on Thu Oct 8, before you submit.** (If you already made them on build 15, they still work: accounts live on the server, not in the build. Just check step 4.) Email confirmation is off in Supabase (checked Oct 7), so a new account works at once. Turning it on later doesn't break accounts already made.

**Keep the made-up accounts away from real players.** Three things in CourtSide reach strangers on their own, so the steps below avoid all three:

- **A city.** A new account that sets a city sends a "joined near you" alert to up to 50 real players in that city. So both demo accounts **leave the city empty**.
- **A follow.** Every follow alerts the person followed. So the demo accounts follow only each other and your own two accounts, **@oatmealandsilk** and **@mrdinosaur62**. That includes the "People you may know" screen right after setup: follow nobody there.
- **Location.** CourtSide's Location switch belongs to the **phone**, not the account. If it's on when you make a new account, that account goes on the map straight away, wherever you are (at home, say), and players within about 30 miles get an alert that a new player shared their spot near them. So Location stays **off** until each account has its map setting.

### Before you start: switch Location off

While still signed in as yourself: **Profile** → **☰** (top right) → **Settings** → **Location** → switch it **off**. This also takes your own pin off the map until Location goes back on, at the court in step 3.

### Step 1: make account A (the main login)

1. Open CourtSide. If you're signed in: **Profile** → **☰** (top right) → **Settings** → **Account center** → **Switch account** → **Add account**. On the sign-in screen, tap **New here? Create an account**.
2. Fill in the form with **email and password**, not Apple or Google:
   - **Name:** `Review Demo`
   - **Username:** `reviewdemo1` (if taken, add a number)
   - **Email:** your Gmail address with `+review1` before the @, for example `yourname+review1@gmail.com`. Gmail delivers it to your normal inbox.
   - **Password:** a new one, 12+ characters, that you use nowhere else. Write it down; you'll paste it into App Store Connect.
   - **Birthday:** an adult date, for example **January 1, 1990**.
   - Tick the Terms box, then tap **Create account**.
3. Go through setup:
   - On **About you**, **leave the Location box empty**, and **leave "Invited by?" empty**.
   - On **Your game**, pick a rating and a style. Skip the optional steps.
   - On **Log your tennis automatically**, tap **Not now**.
   - On **People you may know**, don't follow anyone and don't tap **Find friends from your contacts**. Tap **Continue**.
   - Agree to the **Community guidelines** when they show.
4. In **Edit profile**: add a profile photo of a court or a ball (not a stranger's face). **Leave the city empty.**
5. Set the map: **Profile** → **☰** → **Settings** → **Privacy center** → **Who can see you on the map** → **Only me**. Do this now, before Location is ever on for A. A still sees its friends on the map. The review notes tell Apple the demo account uses Only me, and the reviewer can change it. On the reviewer's phone, Location starts off, so they still get Apple's own permission pop-up. (With Only me, the reviewer's Start a session says "Only you will see this session" and checks in nowhere, which is what you want.)

### Step 2: make account B the same way

Same steps with name `Review Partner`, username `reviewdemo2`, and `+review2` in the email. Leave B's city empty too. In step 5, choose **Only people you follow back** instead of Only me.

### Step 3: put things in them

Do these while signed in as the account named. To switch: **Profile** → **☰** → **Settings** → **Account center** → **Switch account**.

| As | Do this | So the reviewer sees |
|---|---|---|
| A | Follow B, **@oatmealandsilk** and **@mrdinosaur62**, and nobody else (every follow alerts the person followed). | A Feed with posts in it |
| A | **+** → **Post** → **Choose from library** → pick a **photo** of a court or your racquet, add a caption. Don't add a place or a court. Switch off "Let CourtSide feature this on its Instagram". | A post to like, comment on and report |
| A | **+** → **Clip** → **Choose from library** → pick a **video** from your camera roll (your own tennis, no one in it who hasn't said yes). Same as the photo: no place or court, and the Instagram switch off if it's there. | The clip player |
| A | **+** → **Session** → **Log a past one** → **Practice**, **How long** 1 hour → **Save**. It stays private. | Your sessions and a streak |
| A | **+** → **Thread or question** → for example "What string tension do you use with poly?" | A thread to reply to and report |
| A | **Coaching** → **Ask a coach** → ask one real question | Ask a coach working |
| B | Follow A back (now you're "mutuals", which Apple will see on the map) | A friend on the map |
| B | Like and comment on A's photo, and reply to A's thread | Comments and replies to report |
| B | Send A a direct message ("Hit Saturday?"), then switch to A and reply | A real chat |
| B | Start a group chat with A, called "Saturday doubles", and send one message | Group chats |
| Optional | As B, before the court step: **Community** → **Find Players** → scroll to **Open hits** → the box at the top (**Looking for a hit?**, or **Play at [court]?**) → a court where you could really play, on the **last day it offers** (it only goes 6 days ahead: Wed Oct 14 if you post on Thu Oct 8), in the evening | An open hit the reviewer can join, chat in and leave with **Can't make it**. Real players nearby can see it and tap "I'm in", so only post one you'd turn up to. Don't call it off during review (that alerts whoever joined); delete it after approval. |
| B | **Last, at a public tennis court**, never at home. First check B's map setting says **Only people you follow back** (Profile → ☰ → Settings → Privacy center). Then **Profile** → **☰** → **Settings** → **Location** → switch it **on**, open the map and wait until it has found you. Then switch back to your own account. Don't turn Location off while signed in as B: that deletes B's spot. | B on A's map, at the court. Only A can see it, so real players nearby never see a made-up "Review Partner". |

Don't start a live session as B: it would check B in at the court for B's friends, and that's an extra thing to undo.

### Step 4: check and leave them alone

- Sign in as A once more and look at the Feed, Community and Messages. All of the above should be there. (Location is on again by now; that's fine for A, because Only me hides it from everyone.)
- **Don't sign in as B again** after the court step while Location is on. B's pin would move to wherever you are, and A (the reviewer) sees B's exact spot.
- Back on your own account, Location is on again, so your own pin is back on the map as usual.
- **Never make either account an admin.** An admin account would show the reviewer the Reports, Removed, Pushed-down posts, Waitlist, Invites and payment tools.
- **Don't change the passwords or delete anything** until Apple approves.
- Don't post an instant for the reviewer: it leaves the rail after 24 hours anyway.

---

## 7. App Review Information

**Where:** the bottom of **1.0 Prepare for Submission** → **App Review Information**. Only the reviewer sees this.

### Sign-In Information

- Tick **Sign-in required**.
- **User name:** account A's email.
- **Password:** account A's password.

### Contact Information

- **First name / Last name:** your own name (the person Apple should ask for)
- **Phone number:** your mobile, with the country code, for example `+1 919 555 0100`
- **Email:** `support@courtsidebase.com`, once your test email to it has arrived (section 8, item H). Until then, use your own Gmail.

### Notes (limit 4,000)

First replace the four `[…]` blanks with the two logins from section 6. The notes assume section 0 is done.

> **TODO (William), before you paste:** the notes say "Sign in with Apple and Google also work." That is only true once you have switched Apple sign-in on in Supabase (section 8, item A) and published Google sign-in (item G), and tried both on build 16. Checked Oct 7, evening: Apple sign-in is still off. Until it's on, the Apple button shows an error, and Apple rejects for that: don't submit.

```text
CourtSide: a social app for tennis players (map, feed, discussions, messages).

DEMO ACCOUNTS
Email and password: [DEMO A EMAIL] / [DEMO A PASSWORD]. Second adult account: [DEMO B EMAIL] / [DEMO B PASSWORD]. The two follow each other and share a chat and a group chat, to test messages, reporting and blocking. Sign in with Apple and Google also work.

WHERE THINGS ARE
The app opens on Community > Find Players (map, then Open hits). Tabs: Community, Feed, + (Session, Clip, Post, Thread, Instant), Coaching, Profile. Messages: paper-plane button, top. Settings: Profile > ☰ > Settings.

TO TRY
- Session: + > Session > Start now runs a timer. After 5+ minutes, Finish opens Log it (photo or clip, then Post session or Save privately); under 5 it offers Discard.
- Hits: the top box under Open hits posts one; others tap I'm in and a chat opens. Call off and Can't make it alert the others.

AGE AND TEENS
A birthday is asked once; under 13 cannot join. Ages 13-17: accounts start private, only people they follow can start a chat with them, they are never shown to strangers on the map or suggested to adult strangers, and they can share only a rough area with friends who follow each other, off until they turn it on.

PERMISSIONS (each asked when its feature is first used; notifications once after setup)
- Location, while using the app only: courts and players near you. Optional. Each person chooses who sees them (Settings > Privacy center > Who can see you on the map): Players nearby (rough area), Only people you follow back, or Only me, which the demo account uses. Turning Location off deletes your spot from our servers. Start a session checks you in at its court for the same people.
- Camera and microphone: posts (photo, or video with sound), instants, chat photos, voice notes while recording. Photos: chat and comment photos ask nothing; picking for a post asks once (Limited or Don't Allow work too); saving asks add-only access.
- Contacts: only if the person taps Find friends from your contacts (after setup or in Settings). Numbers and emails are matched against CourtSide accounts, then deleted.
- Notifications: reminders (streak, weekly recap) each have an off switch in Settings.
- Apple Health, read only: Settings > Health and nutrition (row "Apple Watch"). Reads workouts with heart rate (to log sessions), sleep, HRV, resting heart rate, steps, active energy, nutrition. Background delivery only shows a local alert. Never writes. Private, except heart rate and calories on a post with "Share health data" on (default on for adults only). Never used for ads or marketing, never sold, not in iCloud.

SAFETY (1.2)
Everyone agrees to the Terms and Community guidelines (no tolerance for objectionable content or abusive users). Report: ••• on a post, instant, profile or group; the flag on a thread; press and hold a comment, reply or message; ••• on a coach question; a chat's details. Block or mute: ••• on a profile. Reported items are hidden from the reporter at once. Our team is alerted to every report, reviews it within 24 hours, takes down content (the author is told why and can ask for a review) and suspends accounts. Settings > Hidden words hides offensive comments and messages from people you don't follow (adults switch it on; always on for under-18s); slurs and threats can't be posted anywhere.

DELETE ACCOUNT
Profile > ☰ > Settings > Account center > Delete account, then type DELETE.

PURCHASES
None. Coaching (Ask a coach, coach profiles) is free. No in-app purchases, subscriptions, payments or ads.

NOT IN THIS VERSION
The AI coach, paid lessons and King of the Court are built but switched off on our server; the AI coach will come in a later update sent for review. Fitbit, Oura, Polar and WHOOP tennis sessions are off too. Connecting WHOOP for recovery and sleep is optional and needs a WHOOP membership.

CONTACT
support@courtsidebase.com
```

3,898 characters with the blanks in. Your real emails and passwords add about 30, so about 3,930 of 4,000. Anything added on top needs something else cut: ask Claude to recount.

**Why these words (for you, not for Apple)**

- **TO TRY** is new: it walks the reviewer to today's two biggest features, Start a session and hits, in one line each. Reporting and blocking are in SAFETY.
- **"After 5+ minutes"**: a session under 5 minutes can't be logged, so a quick Start then Finish shows "That was under 5 minutes" with Discard and Keep going, not the Log it page. Without this line the reviewer would think Finish is broken.
- **"The top box under Open hits"**, not its words: it reads "Looking for a hit?", or "Play at [court]?" when nothing is open and a public court is close by.
- **"Profile > ☰ > Settings"**: there is no gear any more (since Oct 5, the ☰ menu holds Groups and Settings).
- **Start a session** reuses the court check-in ("I'm playing here"): adults only, never with Only me or Location off, no tracking in the background. The demo account uses Only me, so the reviewer's session checks in nowhere and says why on screen.
- **Hidden words** says "adults switch it on" because database update 148 (live, checked Oct 7) starts it off for adults. Slurs and threats are still refused for everyone, which is the filter rule 1.2 asks for.
- **"Push to bottom"** (the admins' tool that sinks a post in every feed) is left out: it's for you and the other admin account only, and the notes are at their limit. Mention it in a reply if Apple asks how you moderate.
- **Shortened to fit:** the web delete link, "Please use the adult demo accounts", the long notifications line, and the first line now just says what CourtSide is (the description says the rest); nothing a reviewer needs.

### Swaps, depending on your answers in section 8

- **The WHOOP row was hidden for the review** (item F): delete the last sentence of NOT IN THIS VERSION.
- **You chose to switch the AI coach on for the review** (item I, not recommended): the old swap no longer fits under 4,000. Tell Claude and it rewrites NOT IN THIS VERSION to fit.
- **Phone number works** (item E): the line about it no longer fits. The recommended choice is to hide the row anyway.

### Attachment

None needed. (The old listing asked for Talk Tennis permission; those threads are gone.)

---

## 8. Final submit checklist

Tick these in order. **(you)** means only you can do it. **(Claude)** means say the sentence in quotes and Claude does it.

### A. Switch on Sign in with Apple (you, 3 minutes) — must

**Why:** the Apple button is in the app, but the server refuses it. Checked Oct 7, evening: still off.

1. Go to **supabase.com** and sign in. Open the **CourtSide** project (`cgitvbnvchmofqkhtlml`).
2. Left menu: **Authentication** → **Sign In / Providers** → **Apple**.
3. Switch on **Enable Sign in with Apple**.
4. In **Client IDs**, type `co.courtside.app`. If something is already there, add a comma, then `co.courtside.app`.
5. Leave the secret key box empty (it's only for Apple sign-in on the website). Click **Save**.
6. Test on build 16: sign out, tap **Sign in with Apple**, use an Apple ID that has never used CourtSide, choose **Hide My Email**. You should land in setup with your real first name filled in. Then delete that test account (Account center → Delete account).

Or say: **"Yes, turn on Sign in with Apple in Supabase"** and Claude does steps 1 to 5 in its browser tab.

### B. The Sign in with Apple key (you, 10 minutes) — must

**Why:** when someone who signed in with Apple deletes their account, Apple requires the app to tell Apple too. This key lets the server do that.

1. Go to **developer.apple.com/account** → **Certificates, IDs & Profiles** → **Keys** → **+**.
2. **Key Name:** `CourtSide Sign in with Apple`. Tick **Sign in with Apple** → **Configure** → choose `co.courtside.app` → **Save** → **Continue** → **Register**.
3. Click **Download**. **Apple lets you download it only once.** The file ends in `.p8`. Treat it like a password: never paste it into a chat or email. Write down the **Key ID** shown on that page.
4. Your **Team ID** is under **Membership details** (it should be `5B5F4SP3TG`).
5. Go to Supabase → CourtSide project → **Edge Functions** → **Secrets** → add three:
   - `APPLE_TEAM_ID` = your Team ID
   - `APPLE_KEY_ID` = the Key ID
   - `APPLE_PRIVATE_KEY` = everything inside the .p8 file, including the BEGIN and END lines. To see it: right-click the file → **Open With** → **TextEdit** → select all → copy.
6. Click **Save**. Then tell Claude "the Apple key is in" so it can check (without reading the key).

### C. Hidden words is live — done

**Why it matters:** it's the "filter" Apple's rule 1.2 asks for. **Settings → Hidden words** can hide offensive comments and messages from people you don't follow, the way Instagram does, and slurs and threats can't be posted at all. (Exactly: slurs, sexual words about children, telling someone to kill themselves and the most serious threats are refused everywhere.) Tennis talk like "kill shot" is never touched, and nothing from someone you follow is ever hidden.

**Nothing to do.** It went live Oct 5. Your Oct 6 change (database update 148: adults start with it off, under-18s always on) is live too, checked Oct 7. The review notes and the description say it that way.

### D. Build 16 (you start it, then test it) — must

**Why build 16, not 15:** build 15 was made late on Monday night (12:37am, Tue Oct 6). Its camera pop-up still says the camera is for instants and chat photos, while the app now records videos for posts (Apple's rule 5.1.1 wants the pop-up to match). Build 16 also has its own update channel, `store`, so instant updates meant for testers can't reach the copy Apple reviews.

1. **When Claude says "ready for build 16"**, open the Terminal tab, paste this and press Return:

   ```
   cd ~/Desktop/Courtside && npx eas-cli@latest build --platform ios --profile store --auto-submit-with-profile production
   ```

   It takes about 10 minutes, then Apple needs up to an hour to process it. If it asks you to log in to Apple, use robertzchen@icloud.com and type the password and code yourself.
   - **Cost:** free within Expo's monthly build allowance (about 6 iPhone builds so far this month). If Expo shows a page asking you to pay, stop and tell Claude.
2. When it reaches TestFlight, install **build 16** and try, in this order: Sign in with Apple (an Apple ID that has never used CourtSide, choose Hide My Email), Continue with Google, email sign-in with demo A, **+ → Post → Take photo** (read the camera pop-up: it should mention posts), **Record video**, **+ → Session → Start now**, wait 5 minutes (shorter only offers Discard), then **Finish** and **Save privately**, the map with Location on, a hit (if one is open near you: join it, then **Can't make it**), report a comment, block account B then unblock, Apple Health → Connect, a message with a voice note, and delete a throwaway account (never a demo one).
3. If you can borrow an iPad, try sign-in and a photo there too. Apple often tests iPhone-only apps on an iPad.

### E. Phone number row (your call; recommended: hide it)

Checked Oct 7: Supabase's phone texting is still switched **off**, so linking a number says "Phone numbers can't be linked just yet". A reviewer who taps it sees a feature that looks unfinished.

- **Recommended:** say **"Hide the Phone number row for the review."** Claude hides it before build 16 (it can come back with an instant update after approval).
- Don't fix it by switching on Supabase's phone sign-in by itself: that lets strangers trigger texts Twilio bills you for.

### F. WHOOP row (you test; Claude hides it if it fails)

The WHOOP row on **Settings → Health and nutrition** is shown to everyone, but CourtSide's WHOOP app may still be in WHOOP's small test program (10 members), so a stranger's WHOOP sign-in could fail. Ask a friend with a WHOOP who isn't on your test list to tap **Connect** on their phone. If it fails, or you can't find anyone to try, say **"Hide the WHOOP row for the review."** (the safer choice), then use the WHOOP swap in section 7.

### G. Google sign-in works for strangers

1. Go to **console.cloud.google.com** → project **courtside-508622** → **Google Auth Platform** → **Audience**.
2. If **Publishing status** says "Testing", click **Publish app** → **Confirm**.
3. On build 16, sign in with a Google account that's never used CourtSide.

Or say: **"Check Google sign-in is published"** and Claude looks in its browser tab.

### H. The support email arrives (you, 1 minute)

Send any email to **support@courtsidebase.com** from your phone. If it doesn't reach your inbox within a few minutes, say **"Add the support@ email route in Cloudflare."**

### I. Your calls

| Decision | Status | Why |
|---|---|---|
| **AI coach during review** | **Keep it off** (recommended). Don't add the Anthropic key until after approval, then switch it on with the next reviewed update. | Fewer things for the reviewer to question, no cost. If you want it at launch instead, add the key **and** a monthly spend limit in the Anthropic console **before** you submit, and tell Claude so it rewrites the notes. Never add the key between Submit and approval. |
| **Every workout from Apple Health, for everyone** | **Done** (Oct 6; checked on Oct 7). | Build 16's Health pop-up says "tennis, runs, rides, the gym and more", and that's now true for everyone, the reviewer included. |

### J. Decided: the Instagram switch is on for everyone — done

**What you said (Oct 5):** "Let's just make it on for everyone and then we have it listed inside of the terms and agreement."

**What that means:** most new posts have a "Let CourtSide feature this on its Instagram" switch. It starts **on** for everyone, teens included, and people can switch it off before they post, or any time after on the post itself (••• → Edit, the same switch). Posts shared only to a group, posts with a logged or tracked session's stats attached (including "Log it" posts), and instants have no switch and are never featured.

**Already done:** the Terms ("When CourtSide features your post"), the privacy policy, the short "I agree" page and the Edit post screen all say so, and section 4 keeps **Developer's Advertising or Marketing** ticked on Photos or Videos and User ID. People who agreed to the Terms before Oct 5 aren't asked again unless you say **"Ask everyone to agree to the new Terms"**.

### K. The pre-order (you, 3 minutes) — must, before you submit

The steps are in section 2. In short:

- **Thu Oct 8**, before **Submit for Review**: Pricing and Availability → App Availability → **Set Up Availability** → **Publish as Pre-Order** → release date **Tue Oct 13** → United States only → **Confirm**. (Already chose countries before? **Manage** → **Set Up Pre-Order** instead.)
- The date must be 2 to 180 days away, so **Sun Oct 11 is the very last day** to set Oct 13. Don't leave it that late.
- Nothing is public yet. The pre-order page only goes up when you press **Release This Version** after approval.
- **If approval is slow** and Oct 13 gets close, tell Claude: the date can be moved before it passes (same page).

### L. The privacy policy's camera line (Claude, after your OK) — must, before you submit

The website's privacy policy still says the camera is only for "an instant or a photo for a chat" and the microphone only for voice notes. Build 16 records photos and videos with sound for posts, so the policy must say so too. The current and the proposed sentence are in **`~/Desktop/CourtSide-Privacy-Camera-Line.md`**. Read it, then say **"Yes, put the new camera line on the website."** It's a public change to app.courtsidebase.com/privacy.html; Claude does it and checks the live page.

### M. The forms (you, about 45 minutes)

- [ ] **App Information:** Name, Subtitle, Category, Content Rights (section 1). **Save.**
- [ ] **Age Rating:** questionnaire done, shows **13+** (section 3).
- [ ] **App Privacy:** URL saved, 19 types set up, the two marketing boxes ticked (item J), **Publish** pressed (section 4).
- [ ] **Pricing and Availability:** Free, United States only, **Publish as Pre-Order** with release date **Tue Oct 13** (section 2, item K).
- [ ] **Version page:** the 8 screenshots from folder **C**, in order; Promotional Text; What's New only if the box shows; Description, Keywords, Support URL, Marketing URL, Copyright (section 5).
- [ ] **Build:** **16** selected (not 15).
- [ ] **Export compliance:** nothing to answer. Build 16 already tells Apple it uses no special encryption (only the iPhone's own secure connections). If App Store Connect still asks "What type of encryption algorithms does your app implement?", choose **None of the algorithms mentioned above**.
- [ ] **Sign in with Apple** is on the sign-in screen of build 16 **and works** (item A).
- [ ] **The privacy policy's camera line** is live on the website (item L).
- [ ] **App Review Information:** Sign-in required ticked, demo A login, your contact details, Notes pasted with the blanks filled.
- [ ] **App Store Version Release:** Manually release this version.
- [ ] **Accessibility** (a newer, optional section): skip it for now.
- [ ] **Business → Agreements:** "Free Apps" shows Active. (No bank or tax details are needed for a free app.)
- [ ] Top right of 1.0 Prepare for Submission: **Add for Review** → **Submit for Review**. Submitting isn't public.
- [ ] Tell Claude **"Submitted"**. Nothing is sent to build 16's `store` channel until Apple answers, so the reviewer sees exactly the build you sent. Testers on builds 11 to 15 keep getting updates as normal.

### After Apple answers

- **Approved:** tell Claude **"Approved"**. Then:
  1. Claude, with your OK, points build 16's channel at the normal updates, so people who download on launch day get the newest fixes from their second open: `npx eas-cli@latest channel:edit store --branch production --non-interactive`. Do it before Tue Oct 13.
  2. **You** press **Release This Version** (top right of the version page), then **Confirm**. **This is the public moment:** the pre-order page goes up straight away (up to 24 hours to show everywhere), and downloads open by themselves on **Tue Oct 13**.
  3. Claude, with your OK, switches the website's "Get the iPhone app" button from TestFlight to the App Store link.
- **Rejected:** forward the message from Apple's Resolution Center to Claude. Most rejections are fixed by a reply or a small change, and the next review is usually faster. If the fix needs a new build, it's build 17, and the pre-order date may need moving (item K).
- **From launch day on:** check **Profile → ☰ → Settings → Reports** (under Admin) at least once a day. The notes promise Apple a person reviews every report within 24 hours.

---

## 9. Your to-do

1. **Tonight (Wed Oct 7):** switch on Sign in with Apple (8A, or tell Claude to) and add the Apple key (8B). Say **"Hide the Phone number row for the review."** (8E). Read the camera sentence on your Desktop and OK it (8L).
2. **When Claude says "ready for build 16":** paste the build command (8D).
3. **Thu Oct 8:** install build 16 from TestFlight and test it (8D), WHOOP (8F), Google (8G), email support@ (8H). Make the two demo accounts on build 16 (section 6, starting with Location off).
4. **Thu Oct 8:** set up the pre-order (section 2), fill in the forms (8M), paste the notes with the demo logins, press **Submit for Review**, and tell Claude **"Submitted"**.
5. **After approval:** tell Claude **"Approved"**, then press **Release This Version**. Launch is **Tue Oct 13**.

---

## Sources

- Apple, [Publish for pre-order](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/publish-for-pre-order/) and [Offering your apps for pre-order](https://developer.apple.com/app-store/pre-orders/)
- Apple, [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions) (the 4+, 9+, 13+, 16+, 18+ scale and every question's meaning)
- Apple, [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.2 user content, 2.1 completeness, 2.3.7 keywords, 2.5.1 HealthKit, 4.8 sign-in, 5.1.1 permissions and account deletion)
- Apple, [Revoke tokens (Sign in with Apple REST API)](https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens)
