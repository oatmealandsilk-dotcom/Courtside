// Which native add-ons are built into the app (Oct 5).
//
// react-native-maps is installed but nothing in the app uses it: the map is
// MapLibre in a web view (src/components/map/MapCanvas.tsx). On Android it
// would still pull Google Maps and Google's location services into the app,
// for no feature: a bigger download, and more to declare on Google Play's
// data-safety form. So it is left out of the Android app only. The iPhone app
// is untouched until after App Review; the package can then come out of both
// on a later shared build.
module.exports = {
  dependencies: {
    'react-native-maps': {
      platforms: {
        android: null,
      },
    },
  },
};
