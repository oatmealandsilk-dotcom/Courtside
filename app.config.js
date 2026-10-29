// Base URL is only set in CI so GitHub Pages can serve the app from /<repo>/.
// Local dev (expo start --web) leaves it undefined and serves from /.
const baseUrl = process.env.EXPO_BASE_URL || undefined;
// How a preview copy looks in Expo Go's list, so the copies are told apart at
// a glance: a name after "CourtSide" (COURTSIDE_LABEL, e.g. "Demo") and the
// old green icon (COURTSIDE_ICON=green). Either can also sit in .courtside-local.json
// on this Mac, which is never committed and is read afresh each time the phone
// asks — so the look of a running copy changes without restarting it. With
// neither, as in every store build, it is plain CourtSide with the beige icon,
// the brand's default since Sep 29: the green mark on the cream ground.
let local = {};
try { local = JSON.parse(require('fs').readFileSync(`${__dirname}/.courtside-local.json`, 'utf8')); } catch { /* none */ }
const label = process.env.COURTSIDE_LABEL || local.label;
const green = (process.env.COURTSIDE_ICON || local.icon) === 'green';
// Android push alerts go through Google's Firebase, which needs its
// google-services.json in the build (Oct 4, Android prep). On Expo's build
// service it comes from the GOOGLE_SERVICES_JSON file variable (the path EAS
// writes it to); on this Mac, from google-services.json in the project folder,
// which is never committed. With neither, the Android build is still made and
// works, just without push alerts (registerForPush says 'unavailable' and files
// it once per install). It has to be there for preview builds too: the
// variable is needed in Expo's preview and production environments, and the
// FCM V1 key on Expo before the first build (docs/android-setup.md).
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
  || (require('fs').existsSync(`${__dirname}/google-services.json`) ? './google-services.json' : undefined);

module.exports = {
  expo: {
    name: label ? `CourtSide ${label}` : 'CourtSide',
    slug: 'courtside',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'courtside',
    // The app follows the phone's light or dark mode (Oct 25), for two things: Match phone on
    // the Theme page (Night while the phone is dark), and the launch screen's dark look on a dark
    // phone (expo-splash-screen's `dark`, below). Until then it was fixed to 'dark', so the app could
    // never tell. The app's own pages still wear the court picked; what follows the phone is only
    // the phone's own parts: its alerts, menus, keyboard and pickers. iPhone: the next store build
    // (after 18; src/lib/phoneAppearance.ts). Android: below.
    userInterfaceStyle: 'automatic',
    // The root behind the app (expo-system-ui): white, the launch screen's own ground and the Clean
    // theme's (Oct 25), so a frame between the launch screen and the app's first draw is never a third
    // colour. Native: the next store build. On Android the app sets it to the theme's own once running.
    backgroundColor: '#FFFFFF',
    // Android only reads this (its "primary" colour: the app's card in the recent-apps
    // view, and the edge glow on older phones), which was Expo's default navy. The
    // brand's green, as on the icon (Oct 5). The iPhone app and the website ignore it.
    primaryColor: '#3F7049',
    // Shown by Expo Go and native builds while the JS loads; matches app/index.tsx
    // so the loader fades straight into the in-app splash.
    // The refined icon he picked (Oct 6): the same green court mark, redrawn with even
    // corners, heavier lines and round bar ends. The old icon-glow.png stays in assets/.
    // Oct 22: "Do thin large for logo": the same mark with thinner strokes at 68% of the tile,
    // flat green on cream (no gradient or glow). icon-refined*.png stay in assets/.
    // Oct 26 (owner, of option A: "A is good"): on iOS 26 the thin mark came out a washed sage, so the
    // refined weight again and a deeper green (#236B3F), flat on the same cream. icon-thin*.png stay.
    icon: green ? './assets/icon.png' : './assets/icon-a.png',
    splash: { image: './assets/splash-c.png', resizeMode: 'cover', backgroundColor: '#FFFFFF' },
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      usesAppleSignIn: true,
      bundleIdentifier: 'co.courtside.app',
      // iOS 18+ lets people pick a light, dark or tinted home screen. Each gets its own
      // drawing of the refined icon (Oct 6) instead of iOS guessing the dark and tinted
      // looks (its guessed tinted icon was a solid amber square). Next App Store build.
      // Oct 29 (owner: "fuzzy and dark and blurry" next to Instagram): iOS 26+ draws a flat
      // picture icon through its glass system and softens it. The layered Icon Composer file
      // (scripts/make-app-icon.py) gives the phone the cream background and the same green
      // mark as sharp vector layers, with its own Dark, Clear and Tinted looks. Older iPhones
      // get pictures Xcode makes from the same file. Android and the website keep icon-a.png.
      icon: green ? './assets/icon.png' : './assets/CourtSideIcon.icon',
      // Apple Health may wake the app the moment a workout is saved, so "Workout detected"
      // comes even with CourtSide closed (modules/workout-watch, Oct 5). The react-native-health
      // plugin below adds the HealthKit entitlement itself; this adds background delivery only.
      // No other permission is needed: the alert is the app's own, under its usual alerts.
      // Takes effect from the next App Store build (15).
      entitlements: { 'com.apple.developer.healthkit.background-delivery': true },
      infoPlist: {
        // No custom encryption: skips the export-compliance question on every upload.
        ITSAppUsesNonExemptEncryption: false,
        // Instagram Stories straight from Share (build 13, Facebook App ID in storyImage.ts).
        LSApplicationQueriesSchemes: ['instagram-stories', 'instagram'],
        // The camera is used for photos and videos you post (Take photo / Record video) and
        // photos sent in chats; all are named (Oct 6, App Review 5.1.1). Instants are hidden at
        // launch, so they are no longer named (Oct 17, owner's pre-flight list for the next build).
        // Purpose-string changes like these reach phones only with the next App Store build.
        NSCameraUsageDescription: 'CourtSide uses the camera to take photos and videos you post and photos you send in chats.',
        NSPhotoLibraryUsageDescription: 'CourtSide uses your photo library to choose clips and photos to post or send in chats.',
        NSLocationWhenInUseUsageDescription: 'CourtSide uses your location while the app is open to show courts near you, and when you tap Check in, to show friends who follow you back where you are until 10pm.',
        // Saving a chat photo to your camera roll from the share sheet (from build 11).
        NSPhotoLibraryAddUsageDescription: 'CourtSide saves the photos and videos you choose to your library.',
      },
    },
    android: {
      // The same id as the iPhone app's bundleIdentifier. Google Play never lets it change once the first build is uploaded.
      package: 'co.courtside.app',
      // Play's build number. Expo's build service keeps the real count and adds one per
      // production build (appVersionSource "remote" + autoIncrement in eas.json); this is only where it starts.
      versionCode: 1,
      // The refined icon (Oct 6): the green mark on the icon's cream. Android crops icons to a
      // circle or a squircle, so this copy of the mark is drawn smaller to sit inside Android's
      // safe zone. The Android 13+ "themed icon" gets the same mark without its soft shadow
      // (Android only uses its shape). The old android-icon-foreground.png stays in assets/.
      // Oct 22: the thin mark at the same safe-zone size, on the new icon's flat cream.
      adaptiveIcon: { foregroundImage: './assets/icon-a-android-foreground.png', monochromeImage: './assets/icon-a-android-monochrome.png', backgroundColor: '#F6EFE4' },
      // Only what the app uses (Oct 4): the camera (instants, hits, Take photo / Record video), the microphone (voice notes, video sound),
      // location while open (courts and players near you), contacts read-only (find friends) and
      // alerts. Photos need nothing on Android 13+: the system photo picker hands over only what
      // was chosen. Older phones get their storage permission from the picker itself.
      permissions: ['CAMERA', 'RECORD_AUDIO', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS', 'POST_NOTIFICATIONS', 'VIBRATE'],
      // Taken back out of what the add-ons slip in. Full photo-library access is what Google
      // Play's photo policy rejects apps for when the picker is enough; nothing is ever written
      // to contacts; there is no background location; no advertising id is used; and nothing
      // draws over other apps (the template's "display over other apps" is for debug screens only).
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.WRITE_CONTACTS',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'com.google.android.gms.permission.AD_ID',
      ],
      // No app links yet: the iPhone app has no associated domains either, so links to
      // app.courtsidebase.com open the website on both. Add the two together when wanted.
      ...(googleServicesFile ? { googleServicesFile } : {}),
      // Android's own parts of the app (its dialogs, its navigation-bar buttons) follow the
      // phone's light or dark mode (Oct 25), as on the iPhone: without that the app cannot
      // see the phone's mode (Match phone, the dark launch screen). From Oct 5 they
      // were fixed light: 'dark' had forced the whole window into night mode, so phones
      // with three-button navigation had a dark band with white buttons along the bottom
      // of every cream page. Following the phone, that band shows only on a phone in dark
      // mode with a light court picked and Match phone off. The app's own pages
      // follow its theme either way. (Buttons that follow the theme itself need
      // expo-navigation-bar, a later build: see docs/android-setup.md.)
      userInterfaceStyle: 'automatic',
    },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: [
      // Build 12 (Oct 4): the phone opens on the logo, cream, never a black frame. expo-system-ui
      // (installed) paints the root the backgroundColor above; this keeps the launch picture full screen.
      // Android (Oct 4) only ever shows a round logo in the middle of the colour, never a
      // full-screen picture, so it gets the mark on its own, cream around it, as on the icon.
      // Oct 24, splash C (next store build, after 18): logo only, as Instagram, WhatsApp and Threads open:
      // the icon's thin mark in its green, centred, 22% of the screen wide, on the icon's own cream (so
      // the zoom from the icon has no colour step), "GROWING THE GAME" small at the foot. Made, with the
      // app's drawn copy of it, by scripts/make-splash-c.py; the app draws that copy only on builds newer
      // than 18 (src/lib/splashLook.ts), so phones on 18 keep matching splash.png. Android: the mark
      // alone (its launch screen is an icon), 90 points wide on the same ground.
      // Oct 25: on white, not the icon's cream: the Clean theme's ground, what the app opens in since Oct 24
      // (owner: "Think the loading screen color is off"); the line in Clean's muted grey.
      // Oct 25, later: two looks, white and dark (owner: "just have two themes for the loading screen just
      // white clean and dark mode"). A phone in dark mode shows the dark one: the same mark and line on the
      // Night theme's ground, in Night's green and grey (assets/splash-c-dark.png, splash-c-android-dark.png,
      // from scripts/make-splash-c.py). The phone picks by its own mode, before the app runs; the app's drawn
      // copy picks the same way (src/components/LaunchMark.tsx). Next store build (iPhone: after 18).
      ['expo-splash-screen', {
        image: './assets/splash-c.png', backgroundColor: '#FFFFFF', resizeMode: 'cover', enableFullScreenImage_legacy: true,
        dark: { image: './assets/splash-c-dark.png', backgroundColor: '#0F1412' },
        android: { image: './assets/splash-c-android.png', imageWidth: 288, resizeMode: 'contain', backgroundColor: '#FFFFFF', dark: { image: './assets/splash-c-android-dark.png', backgroundColor: '#0F1412' } },
      }],
      // The status-bar icons on the launch screen follow the phone's mode, as its two looks do (dark icons on
      // the white one, light on the dark one), so they do not flip when the app takes over; once the app
      // runs, ThemedStatusBar sets them per theme. Replaces expo-status-bar's plugin (fixed dark, Oct 24).
      './plugins/withLaunchStatusBar',
      // iOS 27 needs the scene start-up or the app stops at launch (Xcode 27 builds, Oct 29):
      // Expo's own ExpoAppSceneDelegate makes the window (plugins/withSceneLifecycle.js).
      './plugins/withSceneLifecycle',
      // adaptiveColors off (Oct 25): left on, expo-router redraws every page in the app the moment the
      // phone (or browser) turns dark or light, for its own Color API, which the app does not use. With
      // the app following the phone (userInterfaceStyle 'automatic'), that would be a whole-app redraw at
      // every change of mode, switch on or off, under a finger too. Match phone does its own
      // change instead, through the smooth path (src/theme/ThemeProvider.tsx followPhone). Read from the
      // app's config at runtime, so it reaches phones by update.
      ['expo-router', { adaptiveColors: false }],
      // The microphone is for voice notes in chats (expo-audio, below) and the sound of a video
      // recorded with Record video (expo-image-picker); the Instant camera itself never records sound.
      ['expo-camera', { cameraPermission: 'CourtSide uses the camera to take photos and videos you post and photos you send in chats.', microphonePermission: 'CourtSide uses the microphone to record the sound of videos you post, and for voice notes you send in chats.', recordAudioAndroid: false }],
      // The same camera words as above, so the build never falls back to Apple's generic text.
      ['expo-image-picker', { photosPermission: 'CourtSide uses your photo library to choose clips and photos to post or send in chats.', cameraPermission: 'CourtSide uses the camera to take photos and videos you post and photos you send in chats.', microphonePermission: 'CourtSide uses the microphone to record the sound of videos you post, and for voice notes you send in chats.' }],
      'expo-video',
      // Build 14 (Oct 4): find friends from your contacts. Only phone numbers and emails are checked, and nothing is kept.
      ['expo-contacts', { contactsPermission: 'CourtSide checks your contacts’ phone numbers and emails to show which friends are already on CourtSide. Nothing from your contacts is saved.' }],
      // The add-on fills in Apple's generic "Allow CourtSide to access your location" and motion texts for any it is not
      // given (they stay in the app even though CourtSide never asks for them), so each gets honest words instead.
      // None can be left out: the add-on's own code still mentions them. Next App Store build (Oct 5).
      ['expo-location', {
        locationWhenInUsePermission: 'CourtSide uses your location while the app is open to show courts near you, and when you tap Check in, to show friends who follow you back where you are until 10pm.',
        locationAlwaysAndWhenInUsePermission: 'CourtSide uses your location only while the app is open, to show courts near you and, when you tap Check in, to show friends where you are. It never tracks you in the background.',
        locationAlwaysPermission: 'CourtSide uses your location only while the app is open, to show courts near you and, when you tap Check in, to show friends where you are. It never tracks you in the background.',
        motionUsagePermission: 'CourtSide does not use motion data.',
      }],
      // Android draws the status-bar alert icon in white from the picture's shape alone, so
      // it gets the mark as a white cut-out (Oct 4); the full-colour app icon would be a blank square.
      ['expo-notifications', { color: '#3F7049', icon: './assets/notification-icon.png', defaultChannel: 'activity' }],
      // Android's alert channels are made by the app (src/features/push/channels.ts). Every server
      // alert must name its channel (send_push does, migration 106): Expo's push service sends
      // Android alerts as data that the app draws itself, and one naming no channel lands in a new,
      // permanent "Miscellaneous" channel. defaultChannel above only applies to alerts sent straight
      // through Firebase, which CourtSide does not do; nothing relies on it.
      // Logins kept in the phone's secure storage stay out of Android's backup to Google Drive and
      // phone-to-phone copies (Oct 5): a copied phone opened signed in on the same login as the old
      // one, and one of the two was then signed out at random. faceIDPermission: false keeps the
      // iPhone's Info.plist exactly as it is (the app never uses Face ID).
      ['expo-secure-store', { faceIDPermission: false }],
      // Android only: lets the app see Instagram, for Share to Instagram Stories (plugins/withInstagramQueries.js).
      './plugins/withInstagramQueries',
      'expo-apple-authentication',
      // No playing on in the background: nothing in the app is meant to be
      // heard once you leave it (clips and voice notes both stop), and without
      // this the plugin quietly asks iOS for background audio, so a clip that
      // started a moment after you left could still be heard. Takes effect
      // from the next App Store build.
      ['expo-audio', { microphonePermission: 'CourtSide uses the microphone to record the sound of videos you post, and for voice notes you send in chats.', enableBackgroundPlayback: false }],
      // Apple Health, in the App Store build only (Expo Go has no HealthKit).
      // The reason shown on Apple's Health sheet must name everything asked
      // for: workouts (tennis and, since Oct 5, every other kind: runs, rides,
      // the gym) and heart rate, plus the daily numbers and food totals.
      // Takes effect from the next App Store build.
      ['react-native-health', { healthSharePermission: 'CourtSide reads your workouts (tennis, runs, rides, the gym and more) and your heart rate during them, so you can log your sessions, plus sleep, heart rate variability, resting heart rate, steps, active energy and nutrition, for your Health page.', healthUpdatePermission: 'CourtSide does not write to Health.' }],
    ],
    experiments: { baseUrl },
    // Instant updates: a build asks Expo for newer app code when it opens and
    // uses it from the next launch. A build only takes code made for the same
    // version, so bump `version` above whenever something native changes (a new
    // package with phone code, a permission, a plugin) and make a new build.
    // The iPhone and Android builds share it (1.0.0), and `npm run update` sends
    // both the same code (Oct 5). So: make the first Android build from main
    // once this Android work is merged (an update from main would otherwise take
    // its Android fixes away), and if a package with phone code is ever added for
    // one platform only (Health Connect, say), bump `version` and build both, or
    // the other platform's older build would be sent code that needs it.
    // Once iPhone build 15 (modules/workout-watch) is out, never roll back to or
    // republish an update made before that module's code was merged: that older
    // code never tells the module when sessions are turned off, so its "Workout
    // detected" alerts would carry on (the module drops switches the app has not
    // confirmed for 30 days, as a backstop only).
    runtimeVersion: { policy: 'appVersion' },
    // The phone opens at once on the version it already has; a newer one downloads in the
    // background and is used from the next open (Oct 6, owner: the loading screen was too long).
    // Builds 11 to this one waited up to 3 s for it on every open; that wait only goes with a new
    // store build, since this setting is built into the app, not sent with an update.
    updates: { url: 'https://u.expo.dev/ce2e922d-6122-47f6-97b7-58a7fad4b3ef', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
    // The app's home on Expo's build service (the robertzchen account), for builds and push alerts.
    extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? 'ce2e922d-6122-47f6-97b7-58a7fad4b3ef' } },
  },
};
