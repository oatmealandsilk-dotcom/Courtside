// Base URL is only set in CI so GitHub Pages can serve the app from /<repo>/.
// Local dev (expo start --web) leaves it undefined and serves from /.
const baseUrl = process.env.EXPO_BASE_URL || undefined;

module.exports = {
  expo: {
    name: 'CourtSide',
    slug: 'courtside',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'courtside',
    userInterfaceStyle: 'dark',
    backgroundColor: '#F8F7F2',
    // Shown by Expo Go and native builds while the JS loads; matches app/index.tsx
    // so the loader fades straight into the in-app splash.
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#F8F7F2' },
    newArchEnabled: true,
    ios: { supportsTablet: true, bundleIdentifier: 'co.courtside.app' },
    android: { package: 'co.courtside.app', edgeToEdgeEnabled: true },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: ['expo-router'],
    experiments: { baseUrl },
  },
};
