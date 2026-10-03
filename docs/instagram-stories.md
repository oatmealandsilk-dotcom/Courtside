# Sharing a session straight into Instagram Stories

## What works today (no new App Store build needed)

The **Share** page for a session (`app/share-session.tsx`) makes a
1080 × 1920 picture in one of three designs: your photo with the session card
on it, the card filling the story, or the card alone as a see-through sticker.

- **Instagram Stories** opens the iPhone's share sheet with the picture.
  Instagram is one of the apps in it; tapping it offers Stories, Feed or
  Messages. That is one more tap than Strava, and Instagram treats the picture
  as the story's background, so a see-through sticker cannot be dragged
  around on top of a photo this way.
- **Save image** puts it in Photos (builds 11 and later, which carry the
  "add to your photo library" permission). From there, Instagram's own photo
  sticker can lay the see-through sticker over any story.
- **More…** is the same share sheet for any other app.
- On the website the picture is shared as a file where the browser can (most
  phones) and saved to downloads where it cannot.

## Why the direct route has to wait for build 12

Strava's button opens Instagram already on the Stories editor, with the stats
as a sticker you can move and resize over your own photo. Instagram's way of
doing that ("Sharing to Stories") is:

1. Put the picture on the iPhone's pasteboard (its copy-and-paste clipboard)
   under Instagram's own item names: `com.instagram.sharedSticker.stickerImage`
   (the sticker) and/or `com.instagram.sharedSticker.backgroundImage`, plus
   `com.instagram.sharedSticker.backgroundTopColor` / `BottomColor`, with a
   five-minute expiry.
2. Open `instagram-stories://share?source_application=<Facebook App ID>`.

Neither step is possible with what the current build has:

- **Custom pasteboard items.** `expo-clipboard` can only put plain text, an
  image or a link on the clipboard, under the standard names. Instagram looks
  only at its own names, so it would open with an empty story. Writing those
  names needs a few lines of native (Swift / Objective-C) code, and native
  code only reaches phones through a new App Store build.
- **Asking whether Instagram is installed.** iPhone only answers
  `canOpenURL("instagram-stories://")` for addresses the app lists in its
  settings (`LSApplicationQueriesSchemes`). That list is fixed when the app is
  built.
- **A Facebook App ID.** Since 2023 Instagram ignores the share without one.

## What build 12 needs

1. **A Facebook App ID** (free). William: create an app at
   developers.facebook.com → My Apps → Create App ("Other" → "Consumer"), and
   copy the App ID number from the app's dashboard. No review is needed for
   Stories sharing.
2. **In `app.config.js`**, under `ios.infoPlist`:

   ```js
   LSApplicationQueriesSchemes: ['instagram-stories', 'instagram'],
   ```

   and the App ID under `extra` (for example `extra.facebookAppId`), so the
   code can read it.
3. **The native piece**, either of:
   - **`react-native-share`** (an existing, widely used package): its
     `Share.shareSingle({ social: Share.Social.INSTAGRAM_STORIES, appId,
     stickerImage, backgroundImage, backgroundTopColor, backgroundBottomColor })`
     does both steps. Add it with `npx expo install react-native-share`; it
     needs the same `LSApplicationQueriesSchemes` entry above. On Android it
     uses Instagram's `com.instagram.share.ADD_TO_STORY` intent.
   - or **a small Expo module of our own** (`modules/instagram-stories`, about
     40 lines of Swift) that writes the pasteboard items and opens the
     address. Smaller, but ours to maintain.
4. **In `src/features/share/storyImage.ts`**, for the "Instagram Stories"
   button: when Instagram is installed, send
   - the **Sticker** design as `stickerImage` over the theme's two colours
     (`backgroundTopColor` / `backgroundBottomColor`), or over the post's
     photo as `backgroundImage`;
   - the **Photo** and **Card** designs as `backgroundImage`.
   Keep today's share sheet as the fallback when Instagram is not installed
   or the native piece is missing (an older build reading the same code).
5. Bump `version` in `app.config.js` (native code changed), make the build,
   and test on a phone with Instagram installed.

## Privacy rules the pictures already follow

- Health numbers appear only when the post shares them (the server keeps
  only the numbers the author ticked, migration 72). A session never posted
  shows its time and what it was, nothing else.
- "Data by WHOOP" (or "From Apple Watch"…) is on every picture that shows a
  tracker's numbers, the tracker's time included.
- The court or place is left off for anyone not known to be an adult.
