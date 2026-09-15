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
      bundleIdentifier: 'co.courtside.app',
      buildNumber: '1',
      infoPlist: {
        // No custom encryption: skips the export-compliance question on every upload.
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'CourtSide uses the camera to take a hit — one photo right after your session.',
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
      ['expo-camera', { cameraPermission: 'CourtSide uses the camera to take a hit — one photo right after your session.' }],
      ['expo-image-picker', { photosPermission: 'CourtSide needs your photo library to choose clips and photos to post.' }],
      'expo-video',
      ['expo-location', { locationWhenInUsePermission: 'CourtSide uses your location to show players near you on the map.' }],
    ],
    experiments: { baseUrl },
    extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
  },
};
