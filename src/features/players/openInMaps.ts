import { Linking, Platform } from 'react-native';

/** A place in the phone's own maps app (Apple Maps on iPhone), or Google Maps in a browser. */
export function openInMaps(place: { name: string; lat: number; lng: number }) {
  const q = encodeURIComponent(place.name);
  const url = Platform.OS === 'ios' ? `maps://?q=${q}&ll=${place.lat},${place.lng}`
    : Platform.OS === 'android' ? `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${q})`
    : `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://maps.apple.com/?q=${q}&ll=${place.lat},${place.lng}`));
}

/** Directions to a place: Apple Maps on iPhone, the phone's maps app on Android, Google Maps in a browser. */
export function directionsTo(place: { name: string; lat: number; lng: number }) {
  const q = encodeURIComponent(place.name);
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`, '_blank', 'noopener');
    return;
  }
  const url = Platform.OS === 'ios' ? `maps://?daddr=${place.lat},${place.lng}&q=${q}` : `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${q})`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://maps.apple.com/?daddr=${place.lat},${place.lng}`));
}
