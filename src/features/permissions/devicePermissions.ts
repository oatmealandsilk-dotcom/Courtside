import { Linking, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

/**
 * The three things the phone has to allow before you can post: camera for a
 * hit, photos for clips, microphone for video with sound. One place to ask,
 * one place to read the answer, so the quiz, Settings, and the composer agree.
 */
export type DevicePermission = 'camera' | 'photos' | 'microphone' | 'location';
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export const PERMISSION_META: Record<DevicePermission, { label: string; why: string; icon: string }> = {
  camera: { label: 'Camera', why: 'To take a hit after a session.', icon: 'camera-outline' },
  // "Limited" access looks granted to iOS but breaks handing a video over
  // (error 3164), so the wording says "All Photos" specifically, not just "on".
  photos: { label: 'Photos', why: 'To pick clips and photos to post. Choose All Photos, not a selection, or videos may fail to open.', icon: 'images-outline' },
  microphone: { label: 'Microphone', why: 'So clips you record have sound.', icon: 'mic-outline' },
  location: { label: 'Location', why: 'To put you on the map and find players near you.', icon: 'navigate-outline' },
};

export const ALL_PERMISSIONS: DevicePermission[] = ['camera', 'photos', 'microphone', 'location'];

const fold = (p: { granted: boolean; canAskAgain?: boolean; accessPrivileges?: string } | null): PermissionState => {
  if (!p) return 'unavailable';
  if (p.granted && p.accessPrivileges !== 'limited') return 'granted';
  if (p.granted) return 'denied'; // limited photo access breaks video export; treat as needing a change
  return p.canAskAgain === false ? 'denied' : 'undetermined';
};

/* ------------------------------- Browser -------------------------------- */

// A browser keeps its own answer per site. Chrome and Edge let a page read it;
// Safari does not, so there it reads as "not asked yet" until you tap the switch.
const webQuery = async (name: 'camera' | 'microphone' | 'geolocation'): Promise<PermissionState> => {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
};

const webRequest = async (kind: DevicePermission): Promise<PermissionState> => {
  if (kind === 'photos') return 'granted';
  if (kind === 'location') {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve('unavailable');
      navigator.geolocation.getCurrentPosition(() => resolve('granted'), (err) => resolve(err.code === 1 ? 'denied' : 'undetermined'), { timeout: 8000, maximumAge: 300000 });
    });
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true } : { audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
};

export async function getPermission(kind: DevicePermission): Promise<PermissionState> {
  if (Platform.OS === 'web') {
    // Picking a file never needs permission in a browser, so photos are always on.
    if (kind === 'photos') return 'granted';
    if (kind === 'location') return typeof navigator !== 'undefined' && navigator.geolocation ? webQuery('geolocation') : 'unavailable';
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return 'unavailable';
    return webQuery(kind);
  }
  try {
    if (kind === 'camera') return fold(await Camera.getCameraPermissionsAsync());
    if (kind === 'microphone') return fold(await Camera.getMicrophonePermissionsAsync());
    if (kind === 'location') return fold(await Location.getForegroundPermissionsAsync());
    return fold(await ImagePicker.getMediaLibraryPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/** Asks the phone. If it has already been refused for good, opens Settings instead. */
export async function requestPermission(kind: DevicePermission): Promise<PermissionState> {
  if (Platform.OS === 'web') return webRequest(kind);
  const current = await getPermission(kind);
  if (current === 'denied') {
    await Linking.openSettings().catch(() => undefined);
    return current;
  }
  try {
    if (kind === 'camera') return fold(await Camera.requestCameraPermissionsAsync());
    if (kind === 'microphone') return fold(await Camera.requestMicrophonePermissionsAsync());
    if (kind === 'location') return fold(await Location.requestForegroundPermissionsAsync());
    return fold(await ImagePicker.requestMediaLibraryPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/** iOS and Android only let you take a permission away in the phone's own Settings. */
export async function openPermissionSettings() {
  if (Platform.OS === 'web') return;
  await Linking.openSettings().catch(() => undefined);
}

/** Where the "off" side of the switch lives, in words, for the platform in hand. */
export const OFF_HINT = Platform.OS === 'web'
  ? 'Your browser keeps this setting. Click the lock or tune icon next to the web address to change it.'
  : 'Switching one off opens your phone’s Settings, because only the phone can take a permission away.';

export async function getAllPermissions(): Promise<Record<DevicePermission, PermissionState>> {
  const [camera, photos, microphone, location] = await Promise.all(ALL_PERMISSIONS.map(getPermission));
  return { camera, photos, microphone, location };
}
