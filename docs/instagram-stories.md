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
