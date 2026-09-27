import { Linking, Platform } from 'react-native';

/** A place in the phone's own maps app (Apple Maps on iPhone), or Google Maps in a browser. */
export function openInMaps(place: { name: string; lat: number; lng: number }) {
  const q = encodeURIComponent(place.name);
  const url = Platform.OS === 'ios' ? `maps://?q=${q}&ll=${place.lat},${place.lng}`
    : Platform.OS === 'android' ? `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}(${q})`
    : `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://maps.apple.com/?q=${q}&ll=${place.lat},${place.lng}`));
}
