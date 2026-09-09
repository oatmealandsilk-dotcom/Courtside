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
    backgroundColor: '#0B1220',
    newArchEnabled: true,
    ios: { supportsTablet: true, bundleIdentifier: 'co.courtside.app' },
    android: { package: 'co.courtside.app', edgeToEdgeEnabled: true },
    web: { bundler: 'metro', output: 'single', name: 'CourtSide' },
    plugins: ['expo-router'],
    experiments: { baseUrl },
  },
};
