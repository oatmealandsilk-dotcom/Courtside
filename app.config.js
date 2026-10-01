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

module.exports = {
  expo: {
    name: label ? `CourtSide ${label}` : 'CourtSide',
    slug: 'courtside',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'courtside',
    userInterfaceStyle: 'dark',
    backgroundColor: '#F8F7F2',
    // Shown by Expo Go and native builds while the JS loads; matches app/index.tsx
    // so the loader fades straight into the in-app splash.
    icon: green ? './assets/icon.png' : './assets/icon-beige.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#F8F7F2' },
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      usesAppleSignIn: true,
      bundleIdentifier: 'co.courtside.app',
      infoPlist: {
        // No custom encryption: skips the export-compliance question on every upload.
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'CourtSide uses the camera to take an instant — one photo right after your session.',
        NSPhotoLibraryUsageDescription: 'CourtSide needs your photo library to choose clips and photos to post.',
        NSLocationWhenInUseUsageDescription: 'CourtSide uses your location, only while the app is open, to show players near you.',
      },
    },
    android: {
      package: 'co.courtside.app',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon-beige.png', backgroundColor: '#F8F7F2' },
      permissions: ['CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'ACCESS_COARSE_LOCATION'],
    },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: [
      'expo-router',
      // The microphone is only for voice notes in chats (expo-audio, below); the camera itself never records sound.
      ['expo-camera', { cameraPermission: 'CourtSide uses the camera to take an instant — one photo right after your session.', microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.', recordAudioAndroid: false }],
      ['expo-image-picker', { photosPermission: 'CourtSide needs your photo library to choose clips and photos to post.', microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.' }],
      'expo-video',
      ['expo-location', { locationWhenInUsePermission: 'CourtSide uses your location to show players near you on the map.' }],
      ['expo-notifications', { color: '#3F7049' }],
      'expo-apple-authentication',
      // No playing on in the background: nothing in the app is meant to be
      // heard once you leave it (clips and voice notes both stop), and without
      // this the plugin quietly asks iOS for background audio, so a clip that
      // started a moment after you left could still be heard. Takes effect
      // from the next App Store build.
      ['expo-audio', { microphonePermission: 'CourtSide uses the microphone for voice notes you send in chats.', enableBackgroundPlayback: false }],
      // Apple Health, in the App Store build only (Expo Go has no HealthKit).
      ['react-native-health', { healthSharePermission: 'CourtSide reads your sleep, heart rate variability, resting heart rate, steps and active energy so the AI coach can plan around how recovered you are.', healthUpdatePermission: 'CourtSide does not write to Health.' }],
    ],
    experiments: { baseUrl },
    // Instant updates: a build asks Expo for newer app code when it opens and
    // uses it from the next launch. A build only takes code made for the same
    // version, so bump `version` above whenever something native changes (a new
    // package with phone code, a permission, a plugin) and make a new build.
    runtimeVersion: { policy: 'appVersion' },
    updates: { url: 'https://u.expo.dev/ce2e922d-6122-47f6-97b7-58a7fad4b3ef', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
    // The app's home on Expo's build service (the robertzchen account), for builds and push alerts.
    extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? 'ce2e922d-6122-47f6-97b7-58a7fad4b3ef' } },
  },
};
