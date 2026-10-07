# CourtSide: App Store listing, version 1.0 (build 15)

Everything you type into Apple's forms to send CourtSide to the App Store, in the order you meet it, ready to copy. Rewritten Oct 5, 2026 from the app as it is on `main`, the live website and the live sign-in settings. The owner's copy of this file is `~/Desktop/CourtSide-AppStore-Pack.md`; keep the two the same.

**What changed from the previous version of this file:** Sign in with Apple is in the app (but still switched off on the server), the Reddit and Talk Tennis threads and the sample people are gone, location is now shared (rough area for strangers, exact spot only for friends who follow each other), Apple Health, contacts matching, phone linking, voice notes and the `app_opens` record are in the app and on the privacy label, paid booking and the AI coach are switched off for review, the age rating follows Apple's 2025 questionnaire, and the screenshots are the 8 in `~/Desktop/CourtSide-Store-Screenshots-B` (the 4 in `store/screenshots/` are out of date). Where `~/Desktop/CourtSide-AppStore-Checklist.md` (Oct 5, morning) disagrees, this file is newer.

**Updated Oct 5, evening:** Hidden words is live (database update 117 was applied at about 8pm), so it's marked done and named in the description and the review notes. The demo-account steps no longer let the made-up accounts reach real players (no city, Location off, follows only your own accounts). The Instagram switch was an open decision; it's now decided (see the next note). Smaller fixes: when the app asks for notifications, the sign-up box's name ("Username"), the location wording in the description, and the Device ID row (the privacy policy gains one matching line with Claude's next website update).

**Updated Oct 5, late:** you decided the Instagram switch (section 8, item J): it stays **on for everyone** and is now written into the Terms and the privacy policy. On the post screen it now reads "Let CourtSide feature this on its Instagram" (it used to say "Feature on CourtSide's Instagram"). The two marketing boxes in section 4 are ticked for good, and the item is gone from section 0. Later still: the same switch is now on the **Edit post** screen too, so people can switch it off any time after posting, and the Terms, the privacy policy and the short "I agree" page say so.

**Updated Oct 6 (App Store audit):** the review notes now say plainly that heart rate and calories show on a workout someone posts while "Share health data" is on (on to start for adults, off for teens, who can still switch it on), name the Health row as it appears in the app ("Apple Watch"), describe the camera, microphone and Photos the way the app now uses them (picking a photo for a chat or a comment no longer asks for Photos access), say the streak and weekly recap reminders each have an off switch, and list paid in-person lessons and King of the Court as built but switched off. The description's Apple Health line says the same about posts. A TODO above the notes reminds you that "Sign in with Apple … also work" is only true once you switch it on (section 8, item A).

**How to use it**

- **Copy only what is inside the grey boxes.** Anything in `[square brackets]` is a blank for you to fill in first.
- Every box with a character limit says how many characters it uses. A script counted them, spaces included.
- Section 0 is the short list of things that must be true **before** you press Submit. Section 9 is your to-do list.

**Words used below**

| Word | What it means |
|---|---|
| App Store Connect | Apple's website for publishing apps: appstoreconnect.apple.com. You sign in with your Apple Developer account (Robert Chen, Individual). |
| App Review, reviewer | Apple's team that tests every app before it goes on the store, and the person who tests yours. |
| Build | One packaged copy of the iPhone app uploaded to Apple. Build 15 is the one to send. |
| TestFlight | Apple's app for installing a build on your phone before it's public. |
| Supabase | The online service that holds CourtSide's database (accounts, posts, messages) and runs sign-in. |
| Server switch | A setting in the database that turns a feature on or off for everyone without a new build. |
| Database update (migration) | A numbered file of changes to the database. Claude writes them; they go live only with your yes. |
| Secret | A private key stored in Supabase. It works like a password, so only you type it in. |
| Demo account | A login you give Apple so the reviewer can get into the app. |
| Instant update | New app code Expo sends to phones that already have the app, with no new build. |

---

## 0. Must be true before you press Submit

Each of these would likely get the app rejected. Details are in the sections named.

1. **Sign in with Apple works.** Checked tonight (Oct 5): Supabase still has Apple sign-in **off**. The Apple button shows on every iPhone, and tapping it gives an error. Reviewers almost always tap it. Steps in section 8, item A.
2. **The Sign in with Apple key is in Supabase.** Apple requires that deleting an account made with Apple also removes CourtSide from that person's Apple ID (Apple calls it "revoking the token"). The code is ready; it needs your key. Steps in section 8, item B.
3. **Hidden words is live. Done** (Oct 5, about 8pm). Apple's rule 1.2 says apps where people post **must** have "a method for filtering objectionable material". Hidden words is that filter, and it's on (section 8, item C).
4. **Build 15 is in TestFlight and you have tried it** (section 8, item D).
5. **The two demo accounts exist, with something in them** (section 6).
6. **Every row a reviewer can tap works**, or is hidden for the review: Phone number, WHOOP, Google sign-in (section 8, items E to G).

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

## 2. Pricing and Availability

**Where:** left sidebar → **Pricing and Availability**.

- **Price:** Free (USD 0.00).
- **Countries or Regions:** click **Edit** → **Deselect All** → tick **United States** → **Done** → **Save**.

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

---

## 4. App Privacy ("nutrition label")

**Where:** left sidebar → **App Privacy**. These answers belong to the app, not to a build, so you can correct them any time without a new review.

### The two addresses

1. Next to **Privacy Policy URL**, click **Edit**, paste this, then **Save**:

```text
https://app.courtsidebase.com/privacy.html
```

2. **User Privacy Choices URL:** leave blank.

(Both addresses in this pack were checked tonight and open.)

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
| **Fitness** | Yes | No | App Functionality | Steps, active energy, workouts (tennis, runs, rides, the gym), logged sessions and matches, streaks, the tennis profile |
| **Precise Location** | Yes | No | App Functionality | An adult's spot on the map, to about 10 m, while they share it with "Players nearby" or "Only people you follow back". Deleted the moment Location is turned off. Also the point sent to place search when adding a place to a post. |
| **Coarse Location** | Yes | No | App Functionality, Product Personalization | The town on a profile; the rough (about 1 km) area kept for teens and "Only me"; the rounded point sent for the weather; players and open hits near you |
| **Contacts** | Yes | No | App Functionality, Product Personalization | Who follows whom (Apple counts a follow list as a "social graph"). Find friends from contacts sends phone numbers and emails from the phone's contacts, checks them, then throws them away. |
| **Emails or Text Messages** | Yes | No | App Functionality | Direct messages and group chats |
| **Photos or Videos** | Yes | No | App Functionality, **Developer's Advertising or Marketing** | Posts, clips, instants, chat photos, profile photos. Marketing: a post left on "Let CourtSide feature this on its Instagram" (on by default) may be reposted on CourtSide's Instagram and in its own marketing. |
| **Audio Data** | Yes | No | App Functionality | Voice notes, and the sound on clips |
| **Other User Content** | Yes | No | App Functionality | Captions, comments, threads, replies, polls, questions to coaches, tips, bios, court reports, reports people send, Hidden words lists, coach applications and résumés, and conversations with the AI coach once it's on |
| **Search History** | Yes | No | App Functionality | Post searches go to CourtSide's server and place searches to Photon (komoot's map search). CourtSide doesn't save them, but the services' request logs keep them for a few days, and the server's log knows which account searched. Declaring it is the safe side. |
| **User ID** | Yes | No | App Functionality, **Developer's Advertising or Marketing** | The account ID and @handle. Marketing: the @handle credits a reposted post. |
| **Device ID** | Yes | No | App Functionality | The phone's push address, so alerts reach it. A scrambled copy of each phone's push address is also kept (`device_sightings`) until the account is deleted, to catch invite fraud: someone counting a second account on the same phone as a player they invited. Apple counts fraud prevention as App Functionality. **Not** the advertising ID. |
| **Product Interaction** | Yes | No | App Functionality, Product Personalization, **Analytics** | Likes, saves, votes, follows, views; how long each post stayed on screen (orders the feed, kept about two months); when a chat was last read; which days someone opens the app (only ever counted as daily totals) |
| **Crash Data** | Yes | No | App Functionality | Error reports saved to CourtSide's own database (`app_errors`) with the account ID |
| **Other Diagnostic Data** | Yes | No | App Functionality | The same reports: the screen, app version, phone type and system version |
| **Other Data Types** | Yes | No | App Functionality | Date of birth, for the age check. Never shown to anyone. |

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
3. Drag in these 8 files, **in this order**, from Finder: Desktop → `CourtSide-Store-Screenshots-B` → `App Store 6.9 inch`:
   1. `01-find-someone-to-hit-with.png`
   2. `02-post-your-best-points.png`
   3. `03-up-3-2-on-mira-rematch.png`
   4. `04-make-the-win-your-story.png`
   5. `05-need-a-fourth-post-a-hit.png`
   6. `06-dont-break-the-streak.png`
   7. `07-ask-people-who-actually-play.png`
   8. `08-pick-your-court.png`
4. Check the order matches, then **Save** (top right).

They're 1320 × 2868 pixels with no transparency (checked), which is exactly what Apple wants for this slot. Apple shrinks them for smaller iPhones, so no other sizes are needed. CourtSide is iPhone only, so no iPad screenshots. The **App Preview** (a video) is optional; skip it.

### Promotional Text (limit 170)

```text
Growing the game. Find someone to hit with near you, post your best points with the score built in, and keep your streak going.
```

127 characters. This is the only text you can change any time without a new review, so use it later for news ("New: …").

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
• Hidden words hides offensive comments and messages from people you don't follow. Slurs and threats can't be posted.
• No ads. We don't sell your data or track you across other apps.

Training, injury and fitness content on CourtSide is general information, not medical advice.

Terms of Service: https://app.courtsidebase.com/terms.html
Privacy Policy: https://app.courtsidebase.com/privacy.html
```

3,139 characters.

**Why it says what it says**

- **Apple Health is named** because Apple rejects apps that use Health without saying so in the description (rule 2.5.1).
- **Location is described exactly:** other players see your rough area from any distance, or the court you've checked in at (for up to two hours); only friends who follow each other see your exact spot; or nobody. The old listing's "Nobody's exact position is ever shown" is no longer true.
- **Hidden words is named** in SAFETY FIRST because it's live and it's the filter Apple's rule 1.2 asks for.
- **Left out on purpose:** the AI coach and paid lessons (both switched off in this version), WHOOP, Fitbit, Oura and Polar (not open to everyone), tournament names (trademarks: the themes use city names), and the Instagram repost switch (the Terms and privacy policy explain it, and the description links to both).

**Optional coaching paragraph.** Add it only if at least one real coach is listed on the Coaching tab. Paste it between the TALK TENNIS and APPLE HEALTH sections, with an empty line above and below. It adds 152 characters (150, plus the empty line), making the description 3,291.

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

It opens (checked tonight) and has the support email, how to report and block, and how to delete an account.

### Marketing URL (optional)

```text
https://courtsidebase.com
```

It opens CourtSide's home page ("The social media app for tennis"). After launch, Claude switches its "Get the iPhone app" button from TestFlight to the App Store link.

### Version

`1.0.0`. It already matches the app.

### Copyright

```text
2026 Robert Chen
```

Use your name **exactly** as it appears on your Apple Developer account (it's an Individual account, so Apple shows that name publicly as the seller). Year first, then the name, nothing else.

### Build

Under **Build**, click **Add Build** (or the **+**), choose **15**, click **Done**. If 15 isn't listed, it hasn't finished processing in TestFlight yet (it can take up to an hour after upload).

### App Store Version Release

Choose **Manually release this version.** After Apple approves, nothing goes public until you press **Release**. Pressing Release is the public step.

---

## 6. The demo accounts (you make these)

**Why:** everything in CourtSide is behind sign-in. Apple requires a working login it can use (rule 2.1), and an empty app looks broken, so the accounts need a little in them. Two accounts let the reviewer try messages, reporting and blocking on each other.

**Do this on your iPhone with build 15, on Tue Oct 6 or Wed Oct 7.** Email confirmation is off in Supabase today (checked tonight), so a new account works at once. Turning it on later doesn't break accounts already made.

**Keep the made-up accounts away from real players.** Three things in CourtSide reach strangers on their own, so the steps below avoid all three:

- **A city.** A new account that sets a city sends a "joined near you" alert to up to 50 real players in that city. So both demo accounts **leave the city empty**.
- **A follow.** Every follow alerts the person followed. So the demo accounts follow only each other and your own two accounts, **@oatmealandsilk** and **@mrdinosaur62**.
- **Location.** CourtSide's Location switch belongs to the **phone**, not the account. If it's on when you make a new account, that account goes on the map straight away, wherever you are (at home, say), and players within about 30 miles get an alert that a new player shared their spot near them. So Location stays **off** until each account has its map setting.

### Before you start: switch Location off

While still signed in as yourself: **Profile** → gear (top right) → **Location** → switch it **off**. This also takes your own pin off the map until Location goes back on, at the court in step 3.

### Step 1: make account A (the main login)

1. Open CourtSide. If you're signed in: **Profile** → gear (top right) → **Account center** → **Switch account** → **Add account**. On the sign-in screen, tap **New here? Create an account**.
2. Fill in the form with **email and password**, not Apple or Google:
   - **Name:** `Review Demo`
   - **Username:** `reviewdemo1` (if taken, add a number)
   - **Email:** your Gmail address with `+review1` before the @, for example `yourname+review1@gmail.com`. Gmail delivers it to your normal inbox.
   - **Password:** a new one, 12+ characters, that you use nowhere else. Write it down; you'll paste it into App Store Connect.
   - **Birthday:** an adult date, for example **January 1, 1990**.
   - Tick the Terms box, then tap **Create account**.
3. Go through setup. On **About you**, **leave the Location box empty**. On Your game, pick a rating and a style. Skip the optional steps, and on the screen right after setup tap **Later** (answering the question shown there would reach a real player). Agree to the Community guidelines.
4. **Leave "Invited by?" empty.** Don't give it anyone's handle.
5. In **Edit profile**: add a profile photo of a court or a ball (not a stranger's face). **Leave the city empty.**
6. Set the map: **Profile** → gear → **Privacy center** → **Who can see you on the map** → **Only me**. Do this now, before Location is ever on for A. A still sees its friends on the map. The review notes tell Apple the demo account uses Only me, and the reviewer can change it. On the reviewer's phone, Location starts off, so they still get Apple's own permission pop-up.

### Step 2: make account B the same way

Same steps with name `Review Partner`, username `reviewdemo2`, and `+review2` in the email. Leave B's city empty too. In step 6, choose **Only people you follow back** instead of Only me.

### Step 3: put things in them

Do these while signed in as the account named. To switch: **Profile** → gear → **Account center** → **Switch account**.

| As | Do this | So the reviewer sees |
|---|---|---|
| A | Follow B, **@oatmealandsilk** and **@mrdinosaur62**, and nobody else (every follow alerts the person followed). | A Feed with posts in it |
| A | **+** → **post** → pick a **photo** of a court or your racquet, add a caption. Don't add a place or a court. Switch off "Let CourtSide feature this on its Instagram" (older builds call it "Feature on CourtSide's Instagram"). | A post to like, comment on and report |
| A | **+** → **post** → pick a **video** from your camera roll (your own tennis, no one in it who hasn't said yes). Same as the photo: no place or court, and the Instagram switch off if it's there. | The clip player |
| A | **+** → **Log a session** (Practice, 60 minutes) and keep it private | Your sessions and a streak |
| A | **+** → **thread or question** → for example "What string tension do you use with poly?" | A thread to reply to and report |
| A | **Coaching** → **Ask a coach** → ask one real question | Ask a coach working |
| B | Follow A back (now you're "mutuals", which Apple will see on the map) | A friend on the map |
| B | Like and comment on A's photo, and reply to A's thread | Comments and replies to report |
| B | Send A a direct message ("Hit Saturday?"), then switch to A and reply | A real chat |
| B | Start a group chat with A, called "Saturday doubles", and send one message | Group chats |
| Optional | As B, before the court step: post a **hit** (Community → Find Players → **Post a hit**) for a day after Oct 15 at a court where you could really play | An open hit. Real players nearby can see it and tap "I'm in", so only post one you'd turn up to, and delete it after approval. |
| B | **Last, at a public tennis court**, never at home. First check B's map setting says **Only people you follow back** (Profile → gear → Privacy center). Then **Profile** → gear → **Location** → switch it **on**, open the map and wait until it has found you. Then switch back to your own account. Don't turn Location off while signed in as B: that deletes B's spot. | B on A's map, at the court. Only A can see it, so real players nearby never see a made-up "Review Partner". |

### Step 4: check and leave them alone

- Sign in as A once more and look at the Feed, Community and Messages. All of the above should be there. (Location is on again by now; that's fine for A, because Only me hides it from everyone.)
- **Don't sign in as B again** after the court step while Location is on. B's pin would move to wherever you are, and A (the reviewer) sees B's exact spot.
- Back on your own account, Location is on again, so your own pin is back on the map as usual.
- **Never make either account an admin.** An admin account would show the reviewer the Reports, Removed, Waitlist, Invites and payment tools.
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

> **TODO (William), before you paste:** the notes say "Sign in with Apple and Google also work." That is only true once you have switched Apple sign-in on in Supabase (section 8, item A) and published Google sign-in (item G), and tried both on build 15. Until then the Apple button shows an error, and Apple rejects for that: don't submit. The new "Players joining near you" switch shows once database update 146 is applied (Claude does that); the notes don't depend on it.

```text
CourtSide is a social app for tennis players: a map of courts and players nearby, a feed of clips and photos, discussions, messages, and free Ask a coach questions.

DEMO ACCOUNTS
Email and password: [DEMO A EMAIL] / [DEMO A PASSWORD]. A second adult account, [DEMO B EMAIL] / [DEMO B PASSWORD], follows the first back and shares a chat and a group chat with it, to test messages, reporting and blocking. Sign in with Apple and Google also work.

WHERE THINGS ARE
The app opens on Community > Find Players (map). Tabs: Community (map, Discussions; "Post a hit" for open games), Feed, + (post or clip, instant, thread, log a session), Coaching, Profile. Messages: the paper-plane button at the top. Settings: the gear on Profile.

AGE AND TEENS
Everyone gives a birthday once; under 13 cannot join. Ages 13-17: accounts start private, only people they follow can start a chat with them, they are never shown to strangers on the map or suggested to adult strangers, and they can share only a rough area with friends who follow each other, off until they turn it on. Please use the adult demo accounts.

PERMISSIONS (each asked only when its feature is first used, except notifications)
- Location, while using the app only: courts and players near you. Optional. Each person chooses who sees them (Settings > Privacy center > Who can see you on the map): Players nearby (rough area), Only people you follow back, or Only me, which the demo account uses. Turning Location off deletes your spot from our servers.
- Camera and microphone: posts (photo, or video with sound), instants, chat photos, voice notes while recording. Photos: chat and comment photos ask nothing; picking for a post asks once (Limited or Don't Allow work too); saving asks add-only access.
- Contacts: only from Settings > Find friends from contacts. Numbers and emails are matched against CourtSide accounts, then deleted.
- Notifications: asked once after setup. Reminders (streak, weekly recap) each have an off switch in Settings.
- Apple Health, read only: Settings > Health and nutrition (row "Apple Watch"). Reads sleep, HRV, resting heart rate, steps, active energy, nutrition, and Workouts with heart rate to log a session in one tap. Background delivery only shows a local alert. Never writes to Health. Private, except heart rate and calories on a post with "Share health data" on (default on for adults only). Never used for ads or marketing, never sold, not in iCloud. With no workouts on the device, the sessions list is empty.

SAFETY (1.2)
Everyone agrees to the Terms and Community guidelines (no tolerance for objectionable content or abusive users). Report: ••• on a post, instant or profile; the flag on a thread; press and hold a comment, reply or message; ••• on a coach question; a chat's details. Block or mute: ••• on a profile. Reported items are hidden from the reporter at once. Our team is alerted to every report, reviews it within 24 hours in an in-app queue, takes down content (the author is told why) and suspends accounts. Settings > Hidden words hides offensive comments and messages from people you don't follow; slurs and threats can't be posted.

DELETE ACCOUNT
Profile > gear > Account center > Delete account, then type DELETE. Also on the web at app.courtsidebase.com.

COACHING AND PURCHASES
Coaching is free: Ask a coach (public questions) and coach profiles with messaging. Nothing can be bought: no in-app purchases, subscriptions, payments or ads.

NOT IN THIS VERSION
The AI coach is built but switched off on our server; it will come in a later update sent for review. Paid lessons and King of the Court are switched off. Fitbit, Oura, Polar and WHOOP tennis sessions are off too. Connecting WHOOP for recovery and sleep is optional and needs a WHOOP membership.

CONTACT
support@courtsidebase.com
```

3,817 characters with the blanks in. Your real emails and passwords add about 25, and the AI coach swap below about 130, so it stays just under 4,000 (about 3,975 with both). Anything added on top needs something else cut.

### Swaps, depending on your answers in section 8

- **You chose to switch the AI coach on for the review** (section 8, item I): replace the first sentence of NOT IN THIS VERSION with:

```text
The AI coach (Coaching tab) is powered by Claude from Anthropic. Before anything is sent, a one-time screen lists what is shared (questions, tennis profile, and sleep and HRV from Apple Health if connected) and asks Agree or Not now.
```

- **The WHOOP row was hidden for the review:** delete the last sentence of NOT IN THIS VERSION.
- **Phone number works** (section 8, item E): you may add this line at the end of PERMISSIONS: `- Phone number (optional): Settings > Phone number texts a 6-digit code to link a number, so friends who have it can find you. It is never shown.`

### Attachment

None needed. (The old listing asked for Talk Tennis permission; those threads are gone.)

---

## 8. Final submit checklist

Tick these in order. **(you)** means only you can do it. **(Claude)** means say the sentence in quotes and Claude does it.

### A. Switch on Sign in with Apple (you, 3 minutes) — must

**Why:** the Apple button is in the app, but the server refuses it. Checked tonight: still off.

1. Go to **supabase.com** and sign in. Open the **CourtSide** project (`cgitvbnvchmofqkhtlml`).
2. Left menu: **Authentication** → **Sign In / Providers** → **Apple**.
3. Switch on **Enable Sign in with Apple**.
4. In **Client IDs**, type `co.courtside.app`. If something is already there, add a comma, then `co.courtside.app`.
5. Leave the secret key box empty (it's only for Apple sign-in on the website). Click **Save**.
6. Test on build 15: sign out, tap **Sign in with Apple**, use an Apple ID that has never used CourtSide, choose **Hide My Email**. You should land in setup with your real first name filled in. Then delete that test account (Account center → Delete account).

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

**Why it matters:** it's the "filter" Apple's rule 1.2 asks for. **Settings → Hidden words** hides offensive comments and messages from people you don't follow, the way Instagram does, and slurs and threats can't be posted at all. (Exactly: slurs, sexual words about children, telling someone to kill themselves and the most serious threats are refused everywhere.) Tennis talk like "kill shot" is never touched, and nothing from someone you follow is ever hidden.

**Nothing to do.** Database update 117 was applied on Oct 5 at about 8pm, the app change is already on main (so build 15 carries it), and the live privacy policy already describes it.

### D. Build 15 (you start it, then test it) — must

1. Build 15 must include everything above, the new Instagram switch words and the same switch on Edit post (item J), and today's fixes. When Claude says main is ready, start it yourself (Claude can't start builds): in the Terminal tab, paste the line Claude gives you. It's normally `cd ~/Desktop/Courtside && npx eas-cli@latest build --platform ios --profile production --auto-submit`. It may ask for your Apple ID password when it uploads to TestFlight.
   - **Cost:** free within Expo's monthly build allowance; past it, Expo bills you.
2. When it reaches TestFlight, install it and try, in this order: Sign in with Apple, Continue with Google, email sign-in with demo A, post a photo, take an instant, report a comment, block account B then unblock, the map with Location on, Apple Health → Connect, a message with a voice note, and delete a throwaway account (never a demo one).
3. If you can borrow an iPad, try sign-in and a photo there too. Apple often tests iPhone-only apps on an iPad.

### E. Phone number row (you test; Claude hides it if it fails)

Tonight's check shows Supabase's phone texting switched off, so linking a number probably says "Phone numbers can't be linked just yet". A reviewer who taps it would see a broken feature.

- On build 15: **Profile** → gear → **Phone number** → enter your number → **Text me a code**.
- **A code arrives:** fine, keep it.
- **It fails:** say **"Hide the Phone number row for the review."** Don't fix it by switching on Supabase's phone sign-in by itself: that lets strangers trigger texts Twilio bills you for.

### F. WHOOP row (you test; Claude hides it if it fails)

The WHOOP row on **Settings → Health and nutrition** is shown to everyone, but CourtSide's WHOOP app may still be in WHOOP's small test program (10 members), so a stranger's WHOOP sign-in could fail. Ask a friend with a WHOOP who isn't on your test list to tap **Connect** on their phone. If it fails, or you can't find anyone to try, say **"Hide the WHOOP row for the review."** (the safer choice), then use the WHOOP swap in section 7.

### G. Google sign-in works for strangers

1. Go to **console.cloud.google.com** → project **courtside-508622** → **Google Auth Platform** → **Audience**.
2. If **Publishing status** says "Testing", click **Publish app** → **Confirm**.
3. On build 15, sign in with a Google account that's never used CourtSide.

Or say: **"Check Google sign-in is published"** and Claude looks in its browser tab.

### H. The support email arrives (you, 1 minute)

Send any email to **support@courtsidebase.com** from your phone. If it doesn't reach your inbox within a few minutes, say **"Add the support@ email route in Cloudflare."**

### I. Your two calls

| Decision | Recommendation | Why |
|---|---|---|
| **AI coach during review** | **Keep it off** (don't add the Anthropic key until after approval, then switch it on with the next reviewed update). | Fewer things for the reviewer to question, no cost. If you want it at launch instead, add the key **and** a monthly spend limit in the Anthropic console **before** you submit, and use the swap in section 7. Never add the key between Submit and approval. |
| **Every workout from Apple Health, for everyone** | **Yes, before you submit**, if your brother's runs came through. Say "Turn on workouts from Apple Health for everyone." | Build 15's Health permission text says "tennis, runs, rides, the gym and more". Today that's only on for admins and the people you named, so a reviewer would get tennis only. |

### J. Decided: the Instagram switch is on for everyone — done

**What you said (Oct 5):** "Let's just make it on for everyone and then we have it listed inside of the terms and agreement."

**What that means:** most new posts have a "Let CourtSide feature this on its Instagram" switch (it used to say "Feature on CourtSide's Instagram"). It starts **on** for everyone, teens included, and people can switch it off before they post, or any time after on the post itself (••• → Edit, the same switch). Posts shared only to a group, posts with a logged or tracked session's stats attached (including "Log it" posts), and instants have no switch and are never featured.

**What Claude did:**

- **Terms:** a new section, "When CourtSide features your post". While the switch is on, the person gives CourtSide a free, non-exclusive licence to show that post (photo or clip, caption, @handle) on CourtSide's own social media and marketing, credited to their @handle. Switching it off (before posting, or any time after on Edit post), deleting the post, or emailing support@ to have it switched off stops any new use; anything already up can be taken down on request. Nothing is sold to anyone.
- **Privacy policy:** the same thing in one line of "What we collect" (next to what you post), a line in "Your choices" on how to switch it off, a sentence each in "Private accounts" and the teen rules saying a featured post is public even from a private or teen account, a line under "Some things stay" for posts already featured when an account is deleted, and Instagram (Meta) in "Services we rely on".
- **The switch's words** on the post screen are plainer now, and the same switch is on **Edit post** (••• → Edit on your own post), so it can be switched off after posting. It isn't there on group posts or posts with a session's stats, which are never featured.
- **The short terms** (the "I agree" page) gained one line: "Featured posts: CourtSide may feature your posts on its Instagram, credited to you. Switch it off on any post when you share it, or later in Edit post."
- **Section 4:** **Developer's Advertising or Marketing** stays ticked on Photos or Videos and User ID.

**Still for you:** the Terms and privacy policy go live with the next website update (public, on app.courtsidebase.com). People who agreed to the Terms before today aren't asked again unless Claude bumps the Terms version, which shows everyone the "I agree" page once more on their next open. Say **"Ask everyone to agree to the new Terms"** if you want that.

### K. The forms (you, about 45 minutes)

- [ ] **App Information:** Name, Subtitle, Category, Content Rights (section 1). **Save.**
- [ ] **Age Rating:** questionnaire done, shows **13+** (section 3).
- [ ] **App Privacy:** URL saved, 19 types set up, the two marketing boxes ticked (item J), **Publish** pressed (section 4).
- [ ] **Pricing and Availability:** Free, United States only (section 2).
- [ ] **Version page:** 8 screenshots in order, Promotional Text, Description, Keywords, Support URL, Marketing URL, Copyright (section 5).
- [ ] **Build:** **15** selected.
- [ ] **Export compliance:** nothing to answer. Build 15 already tells Apple it uses no special encryption (only the iPhone's own secure connections). If App Store Connect still asks "What type of encryption algorithms does your app implement?", choose **None of the algorithms mentioned above**.
- [ ] **Sign in with Apple** is on the sign-in screen of build 15 **and works** (item A).
- [ ] **App Review Information:** Sign-in required ticked, demo A login, your contact details, Notes pasted with the blanks filled.
- [ ] **App Store Version Release:** Manually release this version.
- [ ] **Accessibility** (a newer, optional section): skip it for now.
- [ ] **Business → Agreements:** "Free Apps" shows Active. (No bank or tax details are needed for a free app.)
- [ ] Tell Claude **"Submitted"**, so it holds every instant update until Apple answers. The reviewer must see exactly the build you sent.
- [ ] Top right of 1.0 Prepare for Submission: **Add for Review** → **Submit for Review**. Submitting isn't public.

### After Apple answers

- **Approved:** press **Release** when you're ready (this is the public moment). Then tell Claude "Released": it unfreezes updates and switches the website's TestFlight button to the App Store.
- **Rejected:** forward the message from Apple's Resolution Center to Claude. Most rejections are fixed by a reply or a small change, and the next review is usually faster.
- **From launch day on:** check **Profile → gear → Admin → Reports** at least once a day. The notes promise Apple a person reviews every report within 24 hours.

---

## 9. Your to-do

1. **Tonight or tomorrow morning:** switch on Sign in with Apple (8A), or tell Claude to.
2. **Tomorrow (Tue Oct 6):** send your two calls (8I). Make the Sign in with Apple key (8B). Publish Google sign-in (8G). Email support@ (8H). Hidden words (8C) is already done.
3. **When Claude says main is ready:** start build 15 (8D).
4. **Wed Oct 7:** install build 15, test it, test Phone number and WHOOP (8E, 8F), and make the two demo accounts (section 6, starting with Location off).
5. **Wed or Thu:** fill in the forms (8K), paste the notes with the demo logins, and press **Submit for Review** by **Thu Oct 8**.

---

## Sources

- Apple, [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions) (the 4+, 9+, 13+, 16+, 18+ scale and every question's meaning)
- Apple, [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.2 user content, 2.1 completeness, 2.3.7 keywords, 2.5.1 HealthKit, 4.8 sign-in, 5.1.1(v) account deletion)
- Apple, [Revoke tokens (Sign in with Apple REST API)](https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens)
