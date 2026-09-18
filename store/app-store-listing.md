# CourtSide: App Store listing, version 1.0

This is everything you type into Apple's forms to put CourtSide on the App Store. The app was read screen by screen to write it, so every claim here matches what version 1.0 actually does.

**How to use this file**

- **App Store Connect** is Apple's website for publishing apps (appstoreconnect.apple.com). You sign in with your Apple Developer account. Every heading below says which page of App Store Connect the field is on.
- Each field is labelled with the name App Store Connect uses. Where there is a **character limit** (the most letters, spaces and punctuation the box accepts, spaces included), the limit and the exact count of the suggested text are shown. Every count was checked by a script.
- **Copy only the text inside the grey boxes.** Anything in `[square brackets]` is a placeholder. Replace it with your own details before you paste.
- The **product page** is the app's public page on the App Store: the name, pictures, description and so on that people see before they download.

**Apple words used in this file**

| Term | What it means |
|---|---|
| App Review | Apple's team that tests every app before it can go on the store. The person who tests it is the **reviewer**. |
| App Review Guidelines | Apple's rulebook for apps. Rules have numbers like "5.2.2". A rejection email quotes the number of the rule it is about. |
| Build | One packaged copy of the app, uploaded to Apple. You attach a build to a version before you submit it. |
| TestFlight | Apple's app for installing a build on your own iPhone before it is public. |
| Bundle ID | The app's permanent internal ID. For CourtSide it is `co.courtside.app`, and it cannot be changed later. |
| Age rating | The age label on the product page (4+, 9+, 13+, 16+ or 18+). Apple works it out from a questionnaire you fill in. |
| App Privacy ("nutrition label") | A standard summary of the data an app collects, shown on the product page. You fill it in from a questionnaire. |
| Tracking | Apple's word for combining what you know about someone with data from *other* companies' apps or websites to target ads, or handing it to a data broker. CourtSide does none of this. |
| Supabase | The online service that runs CourtSide's database (where accounts, posts and messages are stored) and its sign-in. |

---

## Read first: what could get this version rejected

Apple is likely to reject version 1.0 as it stands today. None of these problems is about the text in this file. They are things inside the app. Section 6 has the full checklist. The biggest ones:

1. **"Continue with Google" without "Sign in with Apple."** If an iPhone app offers a sign-in service like Google, it must also offer an equally private option, which in practice means Sign in with Apple (rule 4.8). Claude can add it, or remove Google from the iPhone app.
2. **Sample people and coaches look real.** Every signed-in person currently sees invented players ("Mira Okafor", "Dev Sharma"…), their written posts and discussions, and invented coaches with made-up credentials ("Former ATP Challenger coach"), star ratings ("4.9 from 213 players") and prices. Presenting made-up people, reviews and credentials as real is misleading. The Terms of Service now admit that some profiles and coaches are samples, but that does not help someone looking at a coach page. They need to come out before launch.
3. **Screens that look finished but are not.** The Payments screen shows a made-up Visa card and "Google Pay". Coach pages have "Send request · $65.00" buttons that say "No payment is taken in this demo". "Health and nutrition" shows sample sleep and calorie numbers with WHOOP and Cronometer marked "Connected". The Profile tab has an "Apple Health · Whoop · Cronometer" row. The About screen says "demo build". Apple rejects placeholder and demo content (rule 2.1), and naming Apple Health without really connecting to it invites a rejection of its own.
4. **Forum content without written permission.** The Community tab shows headlines and excerpts from Tennis Warehouse's Talk Tennis forum. Apple can ask for proof that you are allowed to show them (rule 5.2.2).

---

## 1. App information

**Where:** App Store Connect → Apps → CourtSide → **App Information** (left sidebar, under "General").

Before this page exists you create the app record: **Apps → "+" → New App**. That form asks for:

| Field | What to enter |
|---|---|
| Platforms | iOS |
| Name | The Name below |
| Primary Language | English (U.S.) |
| Bundle ID | `co.courtside.app` (it appears in the list once the first build is set up; Claude can register it for you) |
| SKU | `courtside-ios` (a private reference code of your choosing. Customers never see it.) |
| User Access | Full Access |

### Name (limit 30 characters)

```text
CourtSide: Tennis Community
```

27 characters. The name under the icon on people's phones stays "CourtSide". The longer store name tells searchers it is a tennis app, because Apple's search counts words in the name heavily. Apple does not allow two apps with the same name, and "CourtSide" alone may already be taken, so the added words also help. Fallbacks if this is taken: `CourtSide Tennis` (16) or `CourtSide - Tennis Social` (25).

### Subtitle (limit 30 characters)

```text
Share clips. Find players.
```

26 characters. The subtitle sits under the name on the product page and in search results. It names the two things people use the app for most. Alternatives: `Clips, threads and players` (26), or the brand tagline `Growing the game` (16), which reads well but does little for search. The tagline appears at the start of the Promotional Text and the Description instead.

### Category

- **Primary Category:** Sports
- **Secondary Category:** Social Networking

Why: the code is a social network (feed, follows, messages, comments) built entirely around one sport. As its main category, "Sports" means CourtSide competes with far fewer apps, and tennis players browsing Sports will find it. "Social Networking" as the second category still gets it seen there. Nothing in the code points to a different choice.

### Content Rights

App Store Connect asks: **"Does your app contain, show, or access third-party content?"** ("third-party content" means material that belongs to someone else.) The two answers are:

- "Yes, it contains, shows, or accesses third-party content, and I have the necessary rights"
- "No, it does not contain, show, or access third-party content"

**The honest answer is "Yes", but only once you actually have the rights.** CourtSide shows:

- **Talk Tennis threads (Tennis Warehouse).** Every six hours a scheduled job on GitHub (the site that holds CourtSide's code) copies the forum's public feed: headline, up to about 600 characters of the post, the author's username, and a link back. The Community tab shows these, marked "Talk Tennis". Tapping one opens the original in Safari. (They are not mixed into the Home feed; only threads written by CourtSide members are.)
- **Reddit threads, possibly.** If that saved copy cannot be reached, the phone fetches r/10s and r/tennis straight from Reddit as a backup. Today the saved copy holds 30 Talk Tennis threads and no Reddit ones.
- **Weather** from Open-Meteo, shown on the Find Players map.

"No" would be untrue, so it is not an option. And "Yes… I have the necessary rights" is only true once:

1. **Tennis Warehouse has given written permission** (an email from someone who can speak for them is enough) to show headlines, excerpts, usernames and links from Talk Tennis in the app. Apple's rule 5.2.2 says an app that displays content from another service must be allowed to do so under that service's terms, and must be able to show the permission if asked. Attach the permission in **App Review Information → Attachment** (section 5). **If you do not have it by submission day, have Claude take the forum threads out of the iPhone app** (they can stay on the website while you ask).
2. **The Reddit backup is removed, or Reddit agrees.** Reddit's terms for its data require its approval for commercial apps. The simplest fix is for Claude to remove the backup.
3. **Open-Meteo's terms are met.** See the weather item in section 6.

### Age Rating

Filled in through a questionnaire. See section 3.

### License Agreement

Leave it on **Apple's standard license agreement**. Apple also expects people to agree, inside the app, to rules that forbid objectionable content. CourtSide's Terms of Service already say this, but the sign-up screen does not show or link them yet. See section 6.

---

## 2. Version information

**Where:** App Store Connect → Apps → CourtSide → under "iOS App" in the left sidebar → **1.0 Prepare for Submission**.

### Previews and Screenshots

Four screenshots are ready in `store/screenshots/` at 1290 × 2796 pixels, the size for the **6.9-inch iPhone** slot: `01-home.png` (clips), `02-community.png` (discussions), `03-players.png` (players near you and the map), `04-messages.png` (a chat). Upload them in that order. They show sample players with made-up names, which is normal for store images; the profile screen was left out because it shows the unfinished Apple Health row. That one slot is enough, because Apple scales it down for smaller iPhones. CourtSide is iPhone-only (`supportsTablet: false` in `app.config.js`), so no iPad screenshots are needed. You can upload up to 10. The optional **App Preview** is a short video; it can be added later.

Screenshots must show what is really in the build. Leave out the Grand Slam theme names, the sample coaches, the "Coming soon" AI coach card, the Payments and Health screens, and anything with a made-up person's name that looks real.

### Promotional Text (limit 170 characters)

```text
Growing the game. Post your clips, snap a hit after every session, and find players near you. Ask the community anything, from string tension to second-serve nerves.
```

165 characters. This line sits above the description. **It is the only text you can change at any time without sending a new version to Apple**, so it is the place for news ("New: …").

### Description (limit 4,000 characters)

```text
CourtSide is a home for tennis players. Share your game, talk tennis with people who care about it as much as you do, and find someone to hit with. Growing the game, one rally at a time.

HOME
• A full-screen feed of clips you swipe through. Double-tap to like. Pinch out to hide everything but the tennis.
• Photo and video posts from the players you follow, with community discussions mixed in.
• Hits: one photo, taken right after your session. The camera counts down from five and takes it on its own. No retakes. Hits leave the feed after 24 hours.
• Pull down any time for a fresh feed.
• Comment, save, share, or send a post straight to a friend.

POST YOUR GAME
• Upload a clip from your phone. Trim it, pick its cover, or post it without sound.
• Rotate and crop your photos.
• Tag the players who are in your posts.
• Pin your best posts to the top of your profile, and archive the ones you want out of sight.

COMMUNITY
• Start a discussion or jump into one. Filter by topic: gear, technique, strategy, injuries, fitness, rules, and the mental game.
• Vote up the replies that help, so the best advice rises to the top.
• Save threads to come back to, and share them with friends.

FIND PLAYERS
• A map of players around you, placed by the city on each profile. Nobody's exact position is ever shown.
• Search for players by name, handle, or city.
• See the current weather right on the map.
• Location is optional and only used while the app is open.

YOUR PROFILE
• Your posts in a grid, with tabs for Posts, Clips, and the posts you're tagged in.
• A tennis profile that shows how you play: your rating, style, favorite surface, how often you play, and what you're working toward.
• Go private whenever you like. Then only followers you approve see your posts and hits.

MESSAGES AND NOTIFICATIONS
• Direct messages with emoji reactions. Edit or unsend what you said.
• Send posts, threads, and profiles into a chat.
• Turn read receipts off if you'd rather.
• Get notified when someone likes, comments, replies, tags you, or follows you.

MAKE IT YOURS
Six looks to choose from: the warm CourtSide original, a dark Night theme, and four inspired by the game's biggest stages: blue hard court, crushed-brick clay, grass green and purple, and a night session under the lights.

SAFETY FIRST
• CourtSide is for ages 13 and up.
• Teen accounts (ages 13 to 17) start private, and only people a teen follows can start a chat with them.
• Report a post, hit, or profile from its ••• menu. Block or mute anyone.
• No ads. We don't sell your data or track you across other apps.

EARLY ACCESS
CourtSide is brand new, and you're early. Tell us what to build next with a tip right in your feed, and vote on everyone else's ideas.

Anything about training, injuries, or fitness on CourtSide is general information shared by players, not medical advice.

Terms of Service: https://oatmealandsilk-dotcom.github.io/Courtside/terms.html
Privacy Policy: https://oatmealandsilk-dotcom.github.io/Courtside/privacy.html
```

3,014 characters.

**What is deliberately left out, and why:**

- **The AI coach.** The Coaching tab shows it as "Coming soon", and tapping it only says so. Describing a feature that does not work yet breaks Apple's rule that the description must match the app (2.3).
- **Paid coaching, prices, "certified" or "verified" coaches.** No payment can be taken and the coaches on screen today are invented.
- **Grand Slam names.** "Wimbledon", "Roland Garros", "Australian Open" and "US Open" are trademarks (names legally owned by the tournaments). The themes are described by look instead.
- **Apple Health, WHOOP, Cronometer.** Not connected.
- **Talk Tennis / Reddit.** Leave them out until you have permission.
- No prices and no competitor names, as asked.

**Optional coaching paragraph.** Add it only if **real** coaches are on CourtSide at launch, ready to answer. Paste it between the FIND PLAYERS and YOUR PROFILE sections, with an empty line above and below. It is 166 characters, so the description becomes 3,182.

```text
COACHING
• Ask a coach: post what you're stuck on. Questions and answers are public, so everyone learns from the reply.
• Browse the profiles of coaches on CourtSide.
```

### Keywords (limit 100 characters)

```text
hitting,partner,forum,serve,forehand,backhand,racquet,match,doubles,club,training,video,social,gear
```

99 characters, 14 keywords. **Keywords** are hidden search words. Customers never see them, but typing any of them in the App Store can bring up CourtSide.

- Commas with no spaces, because spaces use up the limit.
- No word from the Name or the Subtitle ("CourtSide", "Tennis", "Community", "Share", "Clips", "Find", "Players"). Apple already searches those, so repeating them wastes room.
- No trademarks (NTRP, UTR, tournament or racquet brand names) and no competitor apps. Apple's rule 2.3.7 forbids them.
- Apple matches keywords in combination with each other and with the name, so "hitting" + "partner" + "Tennis" covers "tennis hitting partner".

### Support URL

```text
https://oatmealandsilk-dotcom.github.io/Courtside/support.html
```

**This page does not exist yet** (right now that address shows "page not found"). Apple requires the Support URL to open a page with a working way to contact you. Ask Claude to add a short support page with your email address and a few answers; it goes live with the next website update. **If you submit before it exists, use the privacy policy address instead** (`https://oatmealandsilk-dotcom.github.io/Courtside/privacy.html`), which ends with your contact email. Never paste an address that does not load.

### Marketing URL (optional)

```text
https://oatmealandsilk-dotcom.github.io/Courtside/
```

This opens the web version of CourtSide. It is fine here: the field is optional and appears as a link on the product page.

### Version

`1.0.0`. It must match `version` in `app.config.js`, and it does.

### Copyright

```text
2026 [Your full legal name or company name]
```

Apple's format is the year you got the rights, then the owner's name, for example "2026 Jane Smith" or "2026 CourtSide LLC". Do not add a web address. Use the same legal name as your Apple Developer account. For a personal account that is your own name, and Apple shows it publicly as the seller.

### What's New in This Version (limit 4,000 characters)

App Store Connect does not ask for this on a first version. Keep this text for version 1.0.1, or paste it if the box does appear:

```text
The first release of CourtSide. Share clips and hits, talk tennis in the Community, find players near you, and message your hitting partners. Tell us what to build next with a tip in your feed.
```

193 characters.

### App Store Version Release

Choose **"Manually release this version."** When Apple approves the app, it then waits for you to press "Release". Nothing goes public until you choose. (Releasing is the public step.)

---

## 3. Age rating questionnaire

**Where:** App Information → **Age Rating** → Edit.

Apple's current age ratings are **4+, 9+, 13+, 16+ and 18+**. You answer questions about what the app contains, and App Store Connect works out the rating and shows it on the last screen as the **Calculated Rating**. The answers below come from reading the code. Questions are grouped the way Apple groups them; the order on screen may differ slightly.

**What CourtSide has that matters here**

- **Its own age check.** Everyone gives a date of birth once: on the sign-up form, or on a one-time screen (`app/(auth)/birthday.tsx`) for accounts made through Google. The question is neutral (it does not hint at which answers pass). **Under 13:** no account is kept, and the phone remembers the answer so the question cannot simply be answered again with a different date. **13 to 17:** a teen account, private to start with, and only people the teen follows can start a new chat with them. The database itself enforces this (`supabase/migrations/20260918000013_age_check.sql`), so the app cannot be tricked around it. The date of birth is never shown to anyone.
- **Reporting.** Posts and hits (from their ••• menu) and profiles (••• at the top right) can be reported. Each report is saved in the `reports` table (think of it as one tab of a spreadsheet) with who reported what. Nobody can read that table from the app; you read it in Supabase (Table Editor → reports).
- **Blocking and muting** from the same ••• menus. Blocked people are listed in Settings → Blocked.
- **No ads, no in-app purchases, no in-app web browser.**

### In-App Controls

| Question | Answer | Why |
|---|---|---|
| Parental Controls | **No** (leave unticked) | Nothing lets a parent watch over, limit or manage a teen's account. |
| Age Assurance | **No** (leave unticked). See note 1 | The birthday question takes the typed date on trust. Apple's examples are its own Declared Age Range API (a way for an app to ask the iPhone for the owner's age range), age estimation, or ID checks. CourtSide uses none of these. Ticking it would not change the rating either way. |

### Capabilities

| Question | Answer | Why | Minimum rating it causes |
|---|---|---|---|
| Unrestricted Web Access | **No** | There is no browser inside the app. Forum links open in Safari, outside CourtSide. Google sign-in uses Apple's standard sign-in window, which is not browsing. | (would be 16+) |
| User-Generated Content | **Yes** | People post clips, photos, hits, comments, discussions and replies that others see. | 4+ |
| Social Media | **Yes** | The Home feed spreads posts to many people, with likes, comments, shares and view counts. | **13+** |
| Social Media Disabled for Users Under 13 | **No** | Does not apply: CourtSide lets no one under 13 in at all. This option is for apps that let children in but switch social features off, and it requires Apple's Declared Age Range API. | none |
| Messaging and Chat | **Yes** | Direct messages between members. | 4+ |
| Advertising | **No** | No ads anywhere, and no advertising code in the app (checked `package.json`, the list of add-on code the app uses). | none |

### Mature Themes

| Question | Answer | Why | Rating |
|---|---|---|---|
| Profanity or Crude Humor | **Infrequent** | The app's own words are clean, but members' posts and the Talk Tennis excerpts are not filtered, so the odd swear word can appear. Saying so costs nothing, because it does not raise the final rating. | 9+ |
| Horror/Fear Themes | **None** | None in the app. | none |
| Alcohol, Tobacco, or Drug Use or References | **None** | None in the app. | none |

### Medical or Wellness

| Question | Answer | Why | Rating |
|---|---|---|---|
| Medical or Treatment Information | **Infrequent**. See note 2 | Community has an "Injuries" topic, where players (and Talk Tennis excerpts) discuss things like tennis elbow and rehab. The app's own screens give no treatment advice, and the app says training and injury content is not medical advice. | 13+ |
| Health or Wellness Topics | **Yes** | Fitness is a discussion topic. The tennis profile covers fitness level, sessions per week and goals, and players share training and exercise advice. | 9+ |

### Sexuality or Nudity

| Question | Answer | Why |
|---|---|---|
| Mature or Suggestive Themes | **None** | None in the app. The Terms forbid sexual content. Member posts are covered by the User-Generated Content answer. |
| Sexual Content or Nudity | **None** | As above. |
| Graphic Sexual Content and Nudity | **None** | As above. |

### Violence

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | **None** | None. |
| Realistic Violence | **None** | None. |
| Prolonged Graphic or Sadistic Realistic Violence | **None** | None. |
| Guns or Other Weapons | **None** | None. |

### Chance-Based Activities

| Question | Answer | Why | Rating |
|---|---|---|---|
| Simulated Gambling | **None** | None. | none |
| Contests | **Infrequent** | Achievement badges, personal goals, streaks, and up and down votes on threads and tips. No competitions, prizes or leaderboards. Apple's definition includes "achievement of personal goals". | 4+ |
| Gambling | **No** | None. | none |
| Loot Boxes | **No** | Nothing is sold. | none |

### Additional Information (the last screen)

- **Calculated Rating:** expect **13+**.
- **Age Categories / Made for Kids:** do not choose it. CourtSide is not a children's app.
- **Override to Higher Age Rating:** leave it alone if the Calculated Rating is 13+. **If it shows anything lower, override to 13+.** Apple says an override is required when your own terms set a higher minimum age than its calculation, and CourtSide's Terms say 13 and older.
- **Age Suitability URL (optional):** leave blank, or paste the privacy policy address. Its "Children and teens" section explains the age check and teen accounts.

### The likely result: 13+

Answering **Yes to Social Media** makes the app 13+ on its own, and nothing else goes higher. Apple's 16+ items are unrestricted web access, "Frequent" medical or treatment information, and "Frequent" mature or suggestive themes; the app has none of them. 13+ also matches the app's own minimum age, which is the ideal.

**Where this could be wrong. Please check before submitting:**

1. **Age Assurance (note 1).** Apple has not said exactly whether a typed date of birth counts. "No" is the careful answer. A reviewer could reasonably accept "Yes", but it would not change the rating, so there is nothing to gain from claiming it.
2. **Medical information (note 2).** If Apple decided injury talk is "Frequent", the rating would become 16+. That seems unlikely for a general tennis community. "None" would also be defensible, since the app itself gives no medical advice, and it would still come out 13+.
3. **The reviewer has the final say.** App Review can change the rating if they disagree with an answer.
4. **Country laws are separate from Apple's rating.** Australia banned social media accounts for under-16s from December 2025, and an app like CourtSide, which lets 13 to 15 year olds make accounts, may fall under that law. Some US states (Utah and Texas, for example) have passed laws requiring apps to use the app store's age information; their status has been changing in the courts. None of this is part of Apple's questionnaire. It affects which countries you choose in **Pricing and Availability**. It is worth a quick question to a lawyer, or leave Australia out at first.

---

## 4. App Privacy ("nutrition label")

**Where:** App Store Connect → Apps → CourtSide → **App Privacy** (left sidebar, under "General").

### The two addresses on this page

- **Privacy Policy URL** (required):

```text
https://oatmealandsilk-dotcom.github.io/Courtside/privacy.html
```

- **User Privacy Choices URL** (optional): leave blank, or paste the same privacy address, since its "Your choices" section covers downloading and deleting your data.

**Important:** the rewritten privacy policy went live today. It covers push notifications, crash reports, Open-Meteo and teen accounts, and it matches this label, with one exception. Its "Coaching and the AI coach" section still says the "Apply to be a coach" form "is not connected yet" and nothing is sent. Since today's update, the form **does** save applications (name, email, phone, ratings, certifications, references, clients, and a résumé file) to the database. The policy needs one more update before you submit. Updating the website means sending the change to the `main` branch (the live copy of the code), which is a public step. Claude will ask you first.

### Apple's three questions, in plain English

For every kind of data, App Store Connect asks:

1. **Is it collected?** Apple's definition: the data leaves the phone and is kept by you, or by a company working for you, for longer than it takes to answer the request right then. Data that never leaves the phone does not count.
2. **Is it linked to the user?** Is it stored with the person's account or identity? At CourtSide nearly everything is stored with the account, so the answer below is Yes almost everywhere. Answering Yes when unsure is the safe side.
3. **Is it used for tracking?** No, for everything. CourtSide contains no advertising or analytics code (checked `package.json`: only Expo, Supabase and map add-ons, none that track), does not read the iPhone's advertising ID, and sells or shares nothing with data brokers. That also means the app never needs to show the "Allow this app to track you?" pop-up.

For each data type marked collected, Apple also asks **what it is used for** (the **purpose**). The purposes used here:

- **App Functionality:** making the app work (accounts, showing posts, sending messages, keeping it secure, fixing crashes).
- **Product Personalization:** changing what someone sees based on them. CourtSide does this in two places: the Home feed is ordered partly by what you have liked and commented on, and "Players you might know" suggests people from your city and people you have interacted with.

Never tick Third-Party Advertising, Developer's Advertising or Marketing, Analytics, or Other Purposes. If you ever start sending marketing emails, come back and add "Developer's Advertising or Marketing" to Email Address.

### First question

"Do you or your third-party partners collect data from this app?" → **Yes, we collect data from this app.**

### Every data type

Tracking is **No** in every row.

| Apple category → data type | Collected? | Linked to user? | Purposes | What in CourtSide |
|---|---|---|---|---|
| **Contact Info → Name** | Yes | Yes | App Functionality | The display name typed at sign-up, or the name Google shares with "Continue with Google". Shown on the profile. Coach applicants also give their full legal name. |
| **Contact Info → Email Address** | Yes | Yes | App Functionality | Sign-in, email confirmation and password resets (sent by Supabase), plus the contact email on a coach application. Never shown to others. |
| **Contact Info → Phone Number** | Yes | Yes | App Functionality | Only from people who fill in "Apply to be a coach", so CourtSide can reach them about their application. Saved privately; never shown. |
| Contact Info → Physical Address | No | – | – | Not asked for. |
| Contact Info → Other User Contact Info | No | – | – | Not asked for. |
| Health & Fitness → **Health** | No. See the note below | – | – | The "Health and nutrition" screen only shows sample numbers, and linking a wearable does nothing yet. Nothing on screen lets a person type injury notes. **Change to Yes (linked, App Functionality) as soon as people can add injury notes or connect Apple Health or a wearable.** |
| **Health & Fitness → Fitness** | Yes | Yes | App Functionality | The tennis profile (fitness level, sessions per week, years playing, goals, next tournament) and session and match posts (minutes, drills, intensity, scores). |
| Financial Info → Payment Info | No | – | – | CourtSide takes no payments. The Payments screen is a preview with sample entries; it only saves short labels like "Apple Pay", never card or bank numbers. |
| Financial Info → Credit Info | No | – | – | – |
| Financial Info → Other Financial Info | No | – | – | – |
| Location → Precise Location | No | – | – | See "How location works" below. |
| **Location → Coarse Location** | Yes | Yes | App Functionality, Product Personalization | The city on each profile (typed in, or filled in by tapping "Use my location"), used for the Find Players map, player search and "Plays in [city]" suggestions. Also the rounded map point sent to Open-Meteo for the weather. |
| Sensitive Info | No | – | – | Nothing of that kind is asked for (Apple means things like race, religion, sexual orientation, biometrics). Date of birth is not on Apple's sensitive list; it goes under Other Data. |
| **Contacts** | Yes. See the note below | Yes | App Functionality, Product Personalization | CourtSide **never** reads the phone's address book. But Apple's definition of Contacts includes a "social graph", which means who follows whom, and CourtSide stores followers, following and follow requests. |
| **User Content → Emails or Text Messages** | Yes | Yes | App Functionality | Direct messages and their emoji reactions. Push alerts (the pop-up notifications on a phone) for messages include a short preview of the words, which passes through Expo's push service on its way to Apple. |
| **User Content → Photos or Videos** | Yes | Yes | App Functionality | Posts, clips, hits and profile photos. |
| **User Content → Audio Data** | Yes | Yes | App Functionality | Video clips are uploaded with their sound, unless "post without sound" is chosen. |
| User Content → Gameplay Content | No | – | – | Not a game. |
| User Content → Customer Support | No | – | – | Support happens by email, outside the app. |
| **User Content → Other User Content** | Yes | Yes | App Functionality | Captions, comments, discussion threads and replies, questions to coaches, coaching requests, reviews, tips, bios, votes, and the reports people send. Also coach applications: certifications, ratings, current clients, references, "how you coach", and an attached résumé file (kept in private storage that only the applicant and CourtSide can open). |
| Browsing History | No | – | – | Forum links open in Safari; the app does not record which ones someone opens. |
| Search History | No | – | – | Searches run on the phone against what is already loaded. Nothing is sent or saved. |
| **Identifiers → User ID** | Yes | Yes | App Functionality | The account ID and @handle. |
| **Identifiers → Device ID** | Yes | Yes | App Functionality | The phone's push address (the code that lets alerts reach one phone), saved with the account once someone allows notifications. It is **not** the advertising ID. |
| Purchases → Purchase History | No | – | – | Nothing is sold. **If paid coaching goes live, change to Yes.** |
| **Usage Data → Product Interaction** | Yes | Yes | App Functionality, Product Personalization | Likes, saves, votes, follows, views of posts and hits (each view is saved with the viewer's account; the poster sees only the count), and when each person last read a chat (unread counts and read receipts). |
| Usage Data → Advertising Data | No | – | – | No ads. |
| Usage Data → Other Usage Data | No | – | – | – |
| **Diagnostics → Crash Data** | Yes | Yes | App Functionality | New crash reporting: when the app hits an error it saves the error message and technical details to CourtSide's own database (`app_errors` table), with the account ID if signed in. |
| Diagnostics → Performance Data | No | – | – | Nothing measures launch time, freezes or battery use and sends it anywhere. |
| **Diagnostics → Other Diagnostic Data** | Yes | Yes | App Functionality | The same reports include errors that did not crash the app, plus the screen, app version, and phone type and system version. |
| Surroundings → Environment Scanning | No | – | – | For Apple Vision Pro. Not used. |
| Body → Hands / Head | No | – | – | For Apple Vision Pro. Not used. |
| **Other Data → Other Data Types** | Yes | Yes | App Functionality | **Date of birth.** Asked once for the age check, stored privately with the account, never shown. From it the account is labelled teen or adult, and other people can see only that label, so the teen rules work. Apple has no specific box for date of birth, so it goes here. |

**Why Health is "No" while the privacy policy mentions injury notes.** The database has a place for injury notes, and the privacy policy lists them as an optional part of the tennis profile. But no screen in version 1.0 lets anyone enter one; only the sample account has them. Apple wants the label to describe the app as it is. The trigger for changing it is written in the table.

**Why Contacts is "Yes".** This is a judgment call. "No" is defensible if you read Apple's definition as meaning only a phone's address book. "Yes" is the cautious reading, because Apple's own wording includes a social graph. Declaring more than necessary does no harm; declaring less can get an app rejected. If you choose Yes, it may be worth changing the Home feed's "Players you might know" strip, which currently says "Contacts, mutuals, interactions" even though the app never reads the phone's contacts.

### How location works (checked in the code)

- Location is off until the person turns it on (Settings → Location, or the switch on the Find Players map). The iPhone then asks permission "while using the app" only.
- The exact position (`src/lib/geo.ts`) **stays on the phone**. It centres the map and picks the nearest city from a list built into the app (`setLocationEnabled` in `src/store/AppContext.tsx`). The exact position is never sent to CourtSide's servers or saved.
- Other players are drawn at a fixed spot near the middle of the city on their profile (`src/features/players/positions.ts`), never where they really are.
- **Weather:** the app sends Open-Meteo, an outside weather service, the map's centre point **rounded to two decimal places, roughly 1 km** (`src/features/players/useWeather.ts`). Apple counts a location as "precise" only at three or more decimal places, so this is **coarse location**. Open-Meteo keeps server logs, which can include those coordinates, for up to 90 days. That is longer than it takes to answer the request, so it counts as collection by a company you work with. It is covered by the Coarse Location row above. It is not tracking, because no account details are sent with it.
- The map pictures on iPhone come from Apple Maps (Apple's own map service, part of the iPhone). Apple does not ask apps to declare that.

### Companies that receive data (none of them for tracking)

The label covers what these services handle on CourtSide's behalf. They do not get listed separately.

| Company | What it gets |
|---|---|
| Supabase | Accounts, posts, messages, uploaded photos and videos, coach applications and résumés, crash reports, push addresses. |
| Expo (push service) | Each alert on its way to Apple: who did what, and a short preview, including message text. |
| Apple | Delivers push alerts. Draws the map. |
| Google | Only for people who choose "Continue with Google". |
| Open-Meteo | The rounded map point, for the weather. |
| GitHub Pages | Hosts the saved list of Talk Tennis headlines that the app downloads. Like any website, it sees the phone's internet address. |

### What the product page will show

- **Data Used to Track You:** none.
- **Data Linked to You:** Contact Info, Health & Fitness (Fitness), Location (Coarse), Contacts, User Content, Identifiers, Usage Data, Diagnostics, Other Data.
- **Data Not Linked to You:** none.

### When you must update the label

Update it (App Privacy → Edit), and the privacy policy, before releasing any version that: opens the AI coach (it sends questions and a profile summary to Anthropic, the company behind Claude, and stores coach conversations), lets people add injury notes or connect Apple Health or a wearable, takes payments, or adds any analytics or advertising tool.

---

## 5. App Review Information

**Where:** 1.0 Prepare for Submission → scroll down to **App Review Information**. Nothing here is public. Only Apple's reviewer sees it.

### Sign-In Information

- Tick **Sign-in required**.
- **User name:** `[DEMO ACCOUNT EMAIL]`
- **Password:** `[DEMO ACCOUNT PASSWORD]`

The demo account must be a real CourtSide account that you create (section 6 explains how). It must keep working for as long as Apple is reviewing.

### Contact Information

Apple's reviewer uses these to reach you with questions. They are not shown on the store.

- **First name:** `[YOUR FIRST NAME]`
- **Last name:** `[YOUR LAST NAME]`
- **Phone number:** `[YOUR PHONE, WITH COUNTRY CODE, e.g. +1 555 010 0100]`
- **Email:** `[YOUR EMAIL]` (for example oatmealandsilk@gmail.com)

### Notes (limit 4,000 characters)

Replace `[SECOND DEMO EMAIL]` and `[SECOND DEMO PASSWORD]` first. If you remove the Talk Tennis threads from the app instead of getting permission, **delete the whole "THREADS FROM OTHER WEBSITES" paragraph**. These notes assume the fixes in section 6 are done (Sign in with Apple added or Google removed, sample content, Payments and Health screens gone, reports on the listed places, accounts deleted with their files).

```text
Thank you for reviewing CourtSide, a social app for tennis players.

SIGNING IN
Please use the demo account in the Sign-In Information fields. It is an adult account that has already answered the one-time birthday question and finished profile setup. To try direct messages between two people, a second demo account is: [SECOND DEMO EMAIL] / [SECOND DEMO PASSWORD]

WHERE THINGS ARE
- Home tab: a full-screen feed of clips, photo and video posts, 24-hour "hits" and community threads. Pull down to refresh.
- The + button in the tab bar makes a post, a clip, a hit (the camera counts down from five and takes one photo) or a discussion.
- Community tab: Discussions by topic, and Find Players (a map, player search and the local weather).
- Coaching tab: coach profiles, and Ask a coach, where players post public questions for coaches to answer.
- Profile tab: the bell opens Notifications, the paper plane opens Messages, and the menu button (three lines, top right) opens Settings.

AGE CHECK AND TEEN ACCOUNTS
Everyone gives a date of birth once: on the sign-up form, or on a one-time screen for accounts made with a sign-in service such as Google. Under 13: no account is kept (an account just made through a sign-in service is deleted at once), and the device will not offer sign-up again. 13 to 17: a teen account. It starts private, and only people the teen follows can start a new chat with them. This rule is enforced in our database, not only in the app. A date of birth is never shown to anyone.

REPORTING, BLOCKING AND MUTING
- Report: the ••• button on any post or hit, or the ••• button at the top right of any profile. Reports are saved to our database and a person reviews them within 24 hours. We remove content and suspend accounts that break our Terms of Service.
- Block or mute: from the same ••• menus. Blocking hides that person's posts, hits, threads and chat. Muting hides their posts from your feed. Blocked people are listed in Settings > Blocked.
- Our Terms of Service forbid abusive, hateful, sexual, dangerous or illegal content and harassment.

DELETING AN ACCOUNT
Profile tab > menu button (three lines, top right) > Account center > Delete account. Type DELETE, then tap "Delete my account". The account and its content are removed from our servers.

THREADS FROM OTHER WEBSITES
Some threads on the Community tab are marked "Talk Tennis". They are headlines and short excerpts from the public feed of the Tennis Warehouse Talk Tennis forum, shown with the original author's username. Each links back to the original thread, which opens in Safari. Written permission from Tennis Warehouse is attached to this submission.

PERMISSIONS
- Location is off until the person turns it on (Settings > Location, or the switch on the Find Players map). It is used only while the app is open, to center the map. The exact position is never sent to our servers. Weather on the map comes from Open-Meteo, which receives the map's center rounded to about 1 km.
- The camera is used only to take a hit. The photo library is used only when someone chooses a photo or video to post.
- After sign-in, the app asks once whether it may send notifications.

GOOD TO KNOW
- iPhone only.
- No purchases, subscriptions or ads in this version.
- Training, injury and fitness content is general information, not medical advice, and the app says so.

Contact: oatmealandsilk@gmail.com
```

3,392 characters with the placeholders in place. Your real details will change the count slightly, but it stays well under 4,000.

**Extra line, only if the AI coach card is still in the build.** Add it at the end of GOOD TO KNOW (115 characters):

```text
- The Courtside AI Coach card on the Coaching tab is marked Coming soon and does not open anything in this version.
```

**Also check:** if there are no real coaches at launch and the coach list is empty, change the Coaching tab line to say only "Ask a coach, where players post public questions."

### Attachment

Attach Tennis Warehouse's written permission here (a PDF or screenshot of their email). Skip this if the forum threads were removed.

---

## 6. Before you submit: checklist

Items marked **(Claude)** are code or website changes Claude makes once you say yes. Items marked **(you)** only you can do: accounts, passwords, money, legal decisions. Anything **public** or **costing money** is flagged.

### A. Accounts and agreements

- [ ] **(you) Join the Apple Developer Program.** **Costs money: US$99 a year.** Choose **Individual** (your personal legal name is shown publicly as the seller) or **Organization** (the company name is shown; this needs a free D-U-N-S number, a company ID issued by Dun & Bradstreet, which takes a few days to arrive). Decide this first, because it sets the Copyright line and the seller name.
- [ ] **(you) Accept Apple's agreements** in App Store Connect → Business. This is accepting legal terms, which only you can do. A free app needs no bank or tax details.
- [ ] **(you) EU "trader" question.** To list the app in the European Union, App Store Connect asks whether you are a "trader" under EU law (roughly: running it as a business). If you say yes, your address, phone number and email are **shown publicly** on the EU product page. If unsure, leave EU countries out at first.
- [ ] **(you + Claude) Create the app record** (section 1). Claude can register the Bundle ID and set up the build through EAS (Expo's service that builds the iPhone app).
- [ ] **(you) Check the name is free** by typing it into the New App form. Fallbacks are in section 1.

### B. Fix these in the app first (likely rejection otherwise)

- [ ] **(Claude) Sign in with Apple**, or remove "Continue with Google" from the iPhone app (rule 4.8).
- [ ] **(Claude) Remove the sample content** that real users see today: invented players, their posts and discussions, and invented coaches with their credentials, ratings, reviews and prices. Before that, **(you)** post some real content (a few clips, a photo, two or three discussions) so the reviewer's feed is not empty.
- [ ] **(Claude) Hide the Payments screen** and the priced "Send request" buttons on coach pages (sample Visa card, "Google Pay", "No payment is taken in this demo"). Mentioning Google Pay on an iPhone also breaks rule 2.3.10 on naming other phone platforms.
- [ ] **(Claude) Hide "Health and nutrition"** and the Profile tab's "Apple Health · Whoop · Cronometer" row until they work.
- [ ] **(Claude) Hide the "Coming soon" AI coach card** and the "What the coach remembers" row, or keep them and add the extra reviewer line from section 5. Apple dislikes placeholder features (rule 2.1), so hiding is safer.
- [ ] **(Claude) Remove "demo build"** from the About screen, and its lines "Coaches are verified by hand" and "coaching, human or AI".
- [ ] **(Claude) Safety features Apple expects in apps where people post (rule 1.2):**
  - a Report option on comments, discussion threads and replies, and inside a chat (today only posts, hits and profiles have one);
  - a basic filter that stops obviously offensive words from being posted;
  - "By creating an account you agree to the Terms of Service and Privacy Policy", with links, on the sign-up screen;
  - the Settings → Blocked screen says blocked people "cannot see your posts, message you, or find your profile". The privacy policy says blocking does not yet stop them seeing your public posts. Make the screen match what blocking really does, or make blocking do what the screen says.
- [ ] **(Claude) Account deletion must remove uploaded photos and videos too.** Today the files stay reachable at their web address after the account is gone. Apple requires deleting the account's data (rule 5.1.1(v)). Also check that the `delete-account` server function is deployed, and test it with a throwaway account.
- [ ] **(Claude) Production build settings:** the real Supabase key must be in the build (`eas.json` still holds a placeholder), and the Expo project ID must be set so push notifications work. A build missing either falls back to a broken or demo mode.
- [ ] **(you decide, Claude changes) Grand Slam theme names.** "Australian Open", "Roland Garros", "Wimbledon" and "US Open" in Settings → Theme are trademarks, and rule 5.2.1 covers trademarks. Suggested renames: "Hard Court Blue", "Clay", "Grass", "Night Session".
- [ ] **(you decide, Claude changes) Teens on the Find Players map.** Teen accounts appear on the map and in player search (at city level, never at their real position). Hiding teen accounts from adults there is a sensible child-safety step, and reviewers notice these things.
- [ ] **(Claude) Change the "Contacts, mutuals, interactions" line** on "Players you might know". The app does not read contacts.

### C. Third-party content and services

- [ ] **(you) Email Tennis Warehouse** asking for written permission to show Talk Tennis headlines, short excerpts, usernames and links, with a link back to each thread. Attach the reply in App Review Information. **No permission by submission day → (Claude) remove the threads from the iPhone app.**
- [ ] **(Claude) Remove the direct-from-Reddit backup** (or get Reddit's approval).
- [ ] **(you decide) Weather.** Open-Meteo's free service is for **non-commercial** use only and its data licence requires a visible credit. CourtSide shows no credit today. Options: (a) Claude adds a small "Weather data by Open-Meteo.com" line to the map; if CourtSide earns money (the Terms mention a coaching fee), (b) buy an Open-Meteo plan (**costs money**) or (c) switch to Apple's own weather service, WeatherKit, which is included with the developer membership up to a monthly limit and needs its own Apple Weather credit.

### D. Web pages (updating them is public)

- [ ] **(Claude, with your go-ahead) Update the privacy policy for coach applications.** It still says the Apply form sends nothing, but since today it saves applications and résumés (section 4). Updating it changes the public website.
- [ ] **(Claude) Keep the privacy policy and Terms in step with section B.** Both now say some profiles, posts, threads and coaches are samples, and that coach prices are a preview. When those are removed, those sentences should go too.
- [ ] **(Claude) Add a support page** (`support.html`) with your email and short answers, so the Support URL works.
- [ ] **(you) Open the privacy, terms and support links** on your phone and check each one loads.

### E. Demo accounts and testing

- [ ] **(you) Create the demo account** in the real app (not the web preview) with an email address you control. Confirm the email, give an adult date of birth (for example 1990), finish setup, then post a clip, a photo and a discussion, and follow the second account.
- [ ] **(you) Create a second demo account** the same way, and send one message between the two so the reviewer can see a chat.
- [ ] **(you) Never change these passwords** while the app is in review.
- [ ] **(you) Install the build on your iPhone through TestFlight** and try every step in the reviewer notes: sign in, post, a hit, report, block, the map and location, notifications, and account deletion (on a throwaway account, not the demo one).

### F. Store page material

- [x] Screenshots at 1290 × 2796: done, in `store/screenshots/`. Leave out what section 2 lists if you add more.
- [ ] App icon: already correct (`assets/icon.png` is 1024 × 1024 with no transparency).
- [ ] Every field in sections 1 to 5 filled in: Age Rating questionnaire, App Privacy (then press **Publish** on that page), Content Rights.
- [ ] **Pricing and Availability:** Price **Free**. Choose countries, bearing in mind the Australia and EU notes above.
- [ ] Encryption question: already answered in the build (`ITSAppUsesNonExemptEncryption: false`), so App Store Connect should not ask.

### G. After launch

- [ ] **(you) Read reports every day:** Supabase → Table Editor → `reports`. The reviewer notes promise a person reviews them within 24 hours, and Apple can remove apps that do not act on reports.
- [ ] **(you) Glance at crash reports:** Supabase → Table Editor → `app_errors`.
- [ ] **(you) Review coach applications:** Supabase → Table Editor → `coach_applications`, with résumés under Storage → `coach-applications`. The form tells applicants the team will get back to them.
- [ ] Update the App Privacy label and privacy policy before any version that changes what data is collected (section 4).

---

## 7. Open questions for you

1. **Store name:** is "CourtSide: Tennis Community" right (and is it free), or do you prefer a fallback?
2. **Individual or company developer account?** This decides the public seller name and the Copyright line.
3. **Talk Tennis:** ask Tennis Warehouse for permission, or take the forum threads out of the iPhone app for launch? And may Claude remove the Reddit backup?
4. **Coaching at launch:** will real coaches be on CourtSide, ready to answer questions? If not, what should the Coaching tab show once the sample coaches are removed? Also, for later: when paid coaching arrives, Apple will likely require its own In-App Purchase system (Apple takes a commission) for anything that is not a live one-to-one session, such as video reviews, written answers and training plans. Only live, real-time one-to-one sessions may be paid another way (rule 3.1.3(d)).
5. **Sign in with Apple:** add it (recommended), or drop Google on iPhone?
6. **Unfinished features:** OK to hide Payments, Health and nutrition, and the AI coach card for version 1.0?
7. **Theme names:** rename the four Grand Slam themes?
8. **Teen accounts on the Find Players map:** hide them from adults?
9. **Weather:** add the credit line, and is CourtSide commercial (pay Open-Meteo, or switch to Apple's WeatherKit)?
10. **Countries:** include Australia (under-16 social media law)? Include the EU (the trader question makes your contact details public)?
11. **Privacy label judgment calls:** Contacts = Yes (follow list counts as a "social graph") and Age Assurance = No. Are you comfortable with both?
12. **Reports:** who reads the reports table, and can you commit to 24 hours?
13. **Support page:** OK for Claude to add one with oatmealandsilk@gmail.com?

---

## Sources

- Apple, [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
- Apple, [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)
- Apple, [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apple Developer Forums, [Content Rights question while submitting an app](https://developer.apple.com/forums/thread/654320)
- Open-Meteo, [Terms and conditions](https://open-meteo.com/en/terms)
