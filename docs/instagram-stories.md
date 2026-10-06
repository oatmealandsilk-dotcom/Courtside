# Sharing a session straight into Instagram Stories

The **Share** page for a session (`app/share-session.tsx`) makes a
1080 × 1920 picture in one of four designs: **Photo** (your photo with the
session card on it), **Card** (the card filling the story), **Sticker** (the
card alone on a see-through ground) and **Overlay** (just the numbers and the
mark in white, see-through).

## What the Stories button does, by build (Oct 4)

- **iPhone, a build that carries react-native-share (build 14 for certain),
  Instagram installed**: Instagram opens on its story editor with the picture already
  in it, the way Strava does. Photo and Card go in as the whole story. Sticker
  goes in as a sticker you can move and resize, over the court's brand and
  page colours; Overlay as a sticker over the court's darkest colour (a hint
  of the court colour at the top), so the white numbers and the CourtSide
  mark in the brand colour both read.
- **Same build, no Instagram on the phone**: the phone's share sheet opens
  with the picture (the app checks first, so the button never does nothing).
- **Older iPhone builds** (no react-native-share): the picture goes on the
  clipboard and Instagram opens on its story camera; the app says to pick a
  photo first, then tap Add sticker (or tap and hold, then Paste). Without
  Instagram, the share sheet.
- **Android**: the share sheet, where Instagram offers Stories, Feed and Chats.
- **Website**: the picture is shared as a file where the browser can (most
  phones) and saved to downloads where it cannot.

**Copy** puts the picture on the clipboard (to paste onto a story of your own
as a sticker), **Save** puts it in Photos (builds 11 on), **More** is the share
sheet for any other app.

## How the hand-over works (for reference)

Instagram's "Sharing to Stories" on iPhone, which `react-native-share` does
for us in `src/features/share/storyImage.ts`:

1. The picture goes on the iPhone's pasteboard (its copy-and-paste clipboard)
   under Instagram's own item names, `com.instagram.sharedSticker.stickerImage`
   or `com.instagram.sharedSticker.backgroundImage`, plus
   `com.instagram.sharedSticker.backgroundTopColor` / `backgroundBottomColor`,
   kept for five minutes.
2. The app opens `instagram-stories://share?source_application=1407829631564079`
   (CourtSide's Facebook App ID; Instagram ignores the share without one).

`app.config.js` lists `instagram-stories` and `instagram` under
`LSApplicationQueriesSchemes`, which is what lets the app ask the phone whether
Instagram is installed. The JS only loads react-native-share where the build
carries it, so the same code is safe on older builds after an instant update.

## Testing it on build 14

On an iPhone with Instagram installed and signed in, open a session → Share,
and tap Stories once on each of the four designs. Each should open Instagram's
story editor with the picture in it. Then delete Instagram (or try a phone
without it) and tap Stories: the share sheet should open.

If Instagram opens but the story is empty, the Facebook App ID is the first
thing to check: on developers.facebook.com → My Apps → CourtSide, the App ID at
the top must read 1407829631564079.

## Android (from its first build, Oct 5)

Stories on Android goes straight into Instagram's "add to story" screen too,
the same sticker-over-two-colours or whole-picture looks as on iPhone. Two
pieces make it work, both in the first Android build:

- `plugins/withInstagramQueries.js` names Instagram in the Android manifest
  (`<queries>`), which Android 11 and later need before an app may ask
  whether another app is installed. Without it the answer was always "no".
- The picture is written to the app's private cache (`useInternalStorage`),
  the one place react-native-share can hand Instagram a link to.

No Instagram on the phone: the share sheet opens instead. Copy is not offered
on Android (Instagram there has no paste-a-sticker), and neither is Save
(Android's share sheet cannot save to the gallery; see docs/android-setup.md).

To check on the first Android test build: Share → Stories on each design, on
a phone with Instagram and on one without.

## Clips and photos (Oct 5, build 15 extras)

Your own clip or photo post can go straight into Instagram Stories too: the
post's **•••** menu has **Share to Instagram Story** (on a session post with
a clip it reads **Share clip to Instagram Story**, beside the session
picture's own **Share to Instagram**). Code: `src/features/share/mediaStory.ts`.

- On it goes the CourtSide overlay (`src/components/share/StoryOverlay.tsx`,
  Oct 5, owner: "Can't be in the middle of the screen", then "Make it better
  like how like Strava would do"): no box, white type with a soft shadow,
  low on the left and clear of Instagram's buttons. The CourtSide mark beside
  "@handle" over "on CourtSide"; on a clip with a session, Strava's stats
  sticker above it (a small label over each big figure: "Match 1h 24m",
  "Won 6–4 6–3", where it was played, "Data by WHOOP" for a tracker's
  numbers) and a fine rule. What the numbers show is in
  `src/features/share/storyOverlay.ts`: at most two, the time first.
- Instagram's Sharing to Stories has no way to say where a sticker goes: it
  puts it in the middle (Meta documents only a recommended 640 × 480 sticker,
  which the person can then move or resize). So:
  - **A clip** goes as the story's `backgroundVideo` (the file as uploaded,
    downloaded into the app's cache), and the sticker is a see-through
    picture the size of the story itself, 1080 × 1920, with the overlay drawn
    low on the left. Laid over the story it lines up with it; if Instagram
    shows it smaller, it still lands in the lower left. It is still a
    sticker: it can be moved, pinched or deleted in Instagram.
  - **A photo** has the overlay drawn onto it in the app (cropped to 9:16 as
    the session's Photo design does, with a faint shade low down) and goes as
    the story's `backgroundImage`, with no sticker: exactly where it was
    drawn. If the photo will not load (8 seconds), it goes as before, the
    original with the see-through sticker.
- Only your own posts, and only where the build carries react-native-share
  (iPhone build 13 on, Android from its first build), so it is safe as an
  instant update. A browser does not offer it. No Instagram on the phone:
  the share sheet opens with the file.
- A session post with only a photo keeps the session picture (its Photo
  design does that photo better), so the new row is for its clip only.
- Instagram gets the file as it was uploaded. A trim, a speed, a zoom or
  "posted without sound" are applied by CourtSide's player as the clip plays,
  not cut into the file, so they do not come along; Instagram's editor can
  trim and mute. The menu says so on a clip posted without sound or trimmed
  ("The full original clip, with its sound. Trim and mute it in Instagram."),
  so nobody who muted a clip to hide what was said is surprised. Instagram's
  guidance is clips up to about 20 seconds and under 50 MB; a longer one may
  be cut short there.
- Closing the menu while the file is still coming down (a tap above it, the
  back button) cancels the share: Instagram does not open on its own a moment
  later.

To check on build 15 (or 14, over the air): your own clip → ••• → Share to
Instagram Story, then the same on a photo post. Instagram should open on its
story editor with the clip or photo filling it and the overlay in the lower
left, not the middle; on the clip, pinching should grab the whole story-sized
sticker. Try a clip with a match on it too (the numbers above the handle),
on an iPhone and on Android.

## Not done yet

- **A tighter sticker.** Sticker and Overlay are handed over as the whole
  9:16 picture with a see-through ground, so they arrive in Instagram the size
  the preview shows. If Instagram shows them smaller than wanted on build 14,
  the fix is to photograph only the card for those two designs.

## Privacy rules the pictures already follow

- Health numbers appear only when the post shares them (the server keeps
  only the numbers the author ticked, migration 72). A session never posted
  shows its time and what it was, nothing else.
- "Data by WHOOP" (or "From Apple Watch"…) is on every picture that shows a
  tracker's numbers, the tracker's time included.
- The court or place is left off for anyone not known to be an adult.
