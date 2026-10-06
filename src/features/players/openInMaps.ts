import { Linking, Platform } from 'react-native';

/**
 * Where a place opens when the phone has no maps app to take it: Apple Maps'
 * website on an iPhone, Google Maps' on Android (Oct 6: Android fell back to
 * Apple's website too, which an Android phone opens in the browser).
 */
const webPlace = (place: { lat: number; lng: number }, q: string) => (Platform.OS === 'android'
  ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
  : `https://maps.apple.com/?q=${q}&ll=${place.lat},${place.lng}`);
const webDirections = (place: { lat: number; lng: number }) => (Platform.OS === 'android'
  ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
  : `https://maps.apple.com/?daddr=${place.lat},${place.lng}`);

/** A place in the phone's own maps app (Apple Maps on iPhone, the one chosen on Android), or Google Maps in a browser. */
export function openInMaps(place: { name: string; lat: number; lng: number }) {
  const q = encodeURIComponent(place.name);
  const url = Platform.OS === 'ios' ? `maps://?q=${q}&ll=${place.lat},${place.lng}`
    : Platform.OS === 'android' ? `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${q})`
    : `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  void Linking.openURL(url).catch(() => Linking.openURL(webPlace(place, q)));
}

/** Directions to a place: Apple Maps on iPhone, Google Maps (its app if installed) on Android and in a browser. */
export function directionsTo(place: { name: string; lat: number; lng: number }) {
  const q = encodeURIComponent(place.name);
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`, '_blank', 'noopener');
    return;
  }
  // Android: Google's own directions link, which Android hands to the Google Maps app when it is
  // installed (the browser otherwise). A geo: link only showed the place, with no route to it.
  const url = Platform.OS === 'ios' ? `maps://?daddr=${place.lat},${place.lng}&q=${q}` : webDirections(place);
  void Linking.openURL(url).catch(() => Linking.openURL(webDirections(place)));
}
