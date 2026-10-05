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
    userInterfaceStyle: 'dark',
    backgroundColor: '#F8F7F2',
    // Android only reads this (its "primary" colour: the app's card in the recent-apps
    // view, and the edge glow on older phones), which was Expo's default navy. The
    // brand's green, as on the icon (Oct 5). The iPhone app and the website ignore it.
    primaryColor: '#3F7049',
    // Shown by Expo Go and native builds while the JS loads; matches app/index.tsx
    // so the loader fades straight into the in-app splash.
    icon: green ? './assets/icon.png' : './assets/icon-glow.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#F8F7F2' },
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      usesAppleSignIn: true,
      bundleIdentifier: 'co.courtside.app',
      infoPlist: {
        // No custom encryption: skips the export-compliance question on every upload.
        ITSAppUsesNonExemptEncryption: false,
        // Instagram Stories straight from Share (build 13, Facebook App ID in storyImage.ts).
        LSApplicationQueriesSchemes: ['instagram-stories', 'instagram'],
        NSCameraUsageDescription: 'CourtSide uses the camera to take an instant — one photo right after your session.',
        NSPhotoLibraryUsageDescription: 'CourtSide needs your photo library to choose clips and photos to post.',
        NSLocationWhenInUseUsageDescription: 'CourtSide uses your location while the app is open to show courts and players near you. You choose who can see you.',
        // Saving a chat photo to your camera roll from the share sheet (from build 11).
        NSPhotoLibraryAddUsageDescription: 'CourtSide saves the photos you choose to your library.',
      },
    },
    android: {
      // The same id as the iPhone app's bundleIdentifier. Google Play never lets it change once the first build is uploaded.
      package: 'co.courtside.app',
      // Play's build number. Expo's build service keeps the real count and adds one per
      // production build (appVersionSource "remote" + autoIncrement in eas.json); this is only where it starts.
      versionCode: 1,
      // The beige icon he chose (Oct 1), unchanged: the green mark on the cream ground. Android
      // crops icons to a circle or a squircle, and the iPhone-sized mark lost its tips in the
      // circle, so this copy of the mark is drawn a little smaller to sit inside Android's safe
      // zone. The same picture is the Android 13+ "themed icon" (Android only uses its shape).
      adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', monochromeImage: './assets/android-icon-foreground.png', backgroundColor: '#F8F7F2' },
      // Only what the app uses (Oct 4): the camera (instants, hits), the microphone (voice notes),
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
      // Android's own parts of the app (its dialogs, its navigation-bar buttons) in their
      // light look (Oct 5). The 'dark' above is for the iPhone; on Android it forced the
      // whole window into night mode, so phones with three-button navigation had a dark
      // band with white buttons along the bottom of every cream page. The app's own
      // pages follow its theme either way. (Buttons that follow the Night and New York
      // themes need expo-navigation-bar, a later build: see docs/android-setup.md.)
      userInterfaceStyle: 'light',
    },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: [
      // Build 12 (Oct 4): the phone opens on the logo, cream, never a black frame. expo-system-ui
      // (installed) paints the root the backgroundColor above; this keeps the launch picture full screen.
      // Android (Oct 4) only ever shows a round logo in the middle of the colour, never a
      // full-screen picture, so it gets the mark on its own, cream around it, as on the icon.
      ['expo-splash-screen', { image: './assets/splash.png', backgroundColor: '#F8F7F2', resizeMode: 'cover', enableFullScreenImage_legacy: true, android: { image: './assets/android-icon-foreground.png', imageWidth: 288, resizeMode: 'contain', backgroundColor: '#F8F7F2' } }],
      'expo-router',
      // The microphone is only for voice notes in chats (expo-audio, below); the camera itself never records sound.
      ['expo-camera', { cameraPermission: 'CourtSide uses the camera to take an instant — one photo right after your session.', microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.', recordAudioAndroid: false }],
      ['expo-image-picker', { photosPermission: 'CourtSide needs your photo library to choose clips and photos to post.', microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.' }],
      'expo-video',
      // Build 14 (Oct 4): find friends from your contacts. Only phone numbers and emails are checked, and nothing is kept.
      ['expo-contacts', { contactsPermission: 'CourtSide checks your contacts’ phone numbers and emails to show which friends are already on CourtSide. Nothing from your contacts is saved.' }],
      ['expo-location', { locationWhenInUsePermission: 'CourtSide uses your location while the app is open to show courts and players near you. You choose who can see you.' }],
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
      ['expo-audio', { microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.', enableBackgroundPlayback: false }],
      // Apple Health, in the App Store build only (Expo Go has no HealthKit).
      // The reason shown on Apple's Health sheet must name everything asked
      // for: workouts (tennis and, since Oct 5, every other kind: runs, rides,
      // the gym) and heart rate, plus the daily numbers and food totals.
      // Takes effect from the next App Store build.
      ['react-native-health', { healthSharePermission: 'CourtSide reads your workouts (tennis, runs, rides, the gym and more) and your heart rate during them, so you can log your sessions, plus sleep, heart rate variability, resting heart rate, steps, active energy and nutrition, for your Health page and your AI coach’s training plan.', healthUpdatePermission: 'CourtSide does not write to Health.' }],
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
    runtimeVersion: { policy: 'appVersion' },
    // The phone waits up to 3 s while opening for a newer version and opens straight into it,
    // so testers don't need to close and reopen twice (from build 11, Oct 2).
    updates: { url: 'https://u.expo.dev/ce2e922d-6122-47f6-97b7-58a7fad4b3ef', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 3000 },
    // The app's home on Expo's build service (the robertzchen account), for builds and push alerts.
    extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? 'ce2e922d-6122-47f6-97b7-58a7fad4b3ef' } },
  },
};
