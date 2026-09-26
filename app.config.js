// Base URL is only set in CI so GitHub Pages can serve the app from /<repo>/.
// Local dev (expo start --web) leaves it undefined and serves from /.
const baseUrl = process.env.EXPO_BASE_URL || undefined;

module.exports = {
  expo: {
    name: 'CourtSide',
    slug: 'courtside',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'courtside',
    userInterfaceStyle: 'dark',
    backgroundColor: '#F8F7F2',
    // Shown by Expo Go and native builds while the JS loads; matches app/index.tsx
    // so the loader fades straight into the in-app splash.
    icon: './assets/icon.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#F8F7F2' },
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      usesAppleSignIn: true,
      bundleIdentifier: 'co.courtside.app',
      buildNumber: '1',
      infoPlist: {
        // No custom encryption: skips the export-compliance question on every upload.
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'CourtSide uses the camera to take an instant — one photo right after your session.',
        NSPhotoLibraryUsageDescription: 'CourtSide needs your photo library to choose clips and photos to post.',
        NSMicrophoneUsageDescription: 'CourtSide records audio when you capture video for a clip.',
        NSLocationWhenInUseUsageDescription: 'CourtSide uses your location, only while the app is open, to show players near you.',
      },
    },
    android: {
      package: 'co.courtside.app',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#3F7049' },
      permissions: ['CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'ACCESS_COARSE_LOCATION'],
    },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: [
      'expo-router',
      ['expo-camera', { cameraPermission: 'CourtSide uses the camera to take an instant — one photo right after your session.' }],
      ['expo-image-picker', { photosPermission: 'CourtSide needs your photo library to choose clips and photos to post.' }],
      'expo-video',
      ['expo-location', { locationWhenInUsePermission: 'CourtSide uses your location to show players near you on the map.' }],
      ['expo-notifications', { color: '#3F7049' }],
      'expo-apple-authentication',
      // Apple Health, in the App Store build only (Expo Go has no HealthKit).
      ['react-native-health', { healthSharePermission: 'CourtSide reads your sleep, heart rate variability, resting heart rate, steps and active energy so the AI coach can plan around how recovered you are.', healthUpdatePermission: 'CourtSide does not write to Health.' }],
    ],
    experiments: { baseUrl },
    // The app's home on Expo's build service (the robertzchen account), for builds and push alerts.
    extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? 'ce2e922d-6122-47f6-97b7-58a7fad4b3ef' } },
  },
};
