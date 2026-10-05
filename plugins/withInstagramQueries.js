// Android only (Oct 5): lets the app ask whether Instagram is on the phone and
// hand it a story. Since Android 11 an app cannot see another app unless its
// manifest names it, so without this react-native-share's "is Instagram
// installed?" always said no and Stories sent people to the Play Store page.
//
// It adds, inside <queries> in AndroidManifest.xml:
//   <package android:name="com.instagram.android" />
//   <intent><action android:name="com.instagram.share.ADD_TO_STORY" /></intent>
//
// Native config, so it arrives with a build. The iPhone app is untouched (its
// own list is LSApplicationQueriesSchemes in app.config.js). react-native-share's
// own plugin is not used: it needs expo-build-properties, which is not installed.
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGE = 'com.instagram.android';
const ACTION = 'com.instagram.share.ADD_TO_STORY';

module.exports = function withInstagramQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!Array.isArray(manifest.queries)) manifest.queries = [];
    if (!manifest.queries.length) manifest.queries.push({});
    const queries = manifest.queries[0];

    queries.package = Array.isArray(queries.package) ? queries.package : [];
    if (!queries.package.some((p) => p.$ && p.$['android:name'] === PACKAGE)) {
      queries.package.push({ $: { 'android:name': PACKAGE } });
    }

    queries.intent = Array.isArray(queries.intent) ? queries.intent : [];
    const hasAction = queries.intent.some((intent) => (intent.action || []).some((a) => a.$ && a.$['android:name'] === ACTION));
    if (!hasAction) queries.intent.push({ action: [{ $: { 'android:name': ACTION } }] });

    return mod;
  });
};
