import { Linking, Platform } from 'react-native';

import { captureFromCamera, pickFromDevice, type PickedMedia } from '@/components/MediaPicker';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { confirm } from '@/lib/confirm';

/** Where a post's photo or clip comes from: the camera now, or the library. */
export type MediaSource = 'photo' | 'video' | 'library';

/**
 * Adding a photo or clip to a post asks where from first, the way Instagram
 * and Strava do: "Take photo", "Record video" or "Choose from library", on
 * the app's own card of choices. A clip (`selection` 'video') is offered
 * "Record video" and the library; anything else all three. `run` is called
 * from the tap on the card itself, because a browser opens its camera or
 * file box only from a tap. A computer's browser has no camera to offer
 * (its file box ignores the camera setting), so there it goes straight to
 * the file box, as before.
 */
export function askMediaSource(selection: 'video' | 'all', run: (source: MediaSource) => void) {
  if (isDesktopBrowser()) { run('library'); return; }
  const library = { label: 'Choose from library', onPress: () => run('library') };
  if (selection === 'video') {
    confirm({ title: 'Add a clip', confirmLabel: 'Record video', onConfirm: () => run('video'), also: library });
    return;
  }
  confirm({
    title: 'Add a photo or video',
    confirmLabel: 'Take photo',
    onConfirm: () => run('photo'),
    also: [{ label: 'Record video', onPress: () => run('video') }, library],
  });
}

/**
 * Opens what was chosen and resolves with the photo or clip, or null if
 * nothing came back. A camera that is off for CourtSide says so in one
 * line, with Open Settings to turn it on. Throws with a sentence a person
 * can act on if the camera or library could not open.
 */
export async function fromSource(source: MediaSource, selection: 'video' | 'all'): Promise<PickedMedia | null> {
  // On a phone the card of choices is still fading out: the camera or library
  // waits for it to go. A browser must open its box inside the tap, so no wait.
  if (Platform.OS !== 'web') await new Promise((done) => setTimeout(done, 180));
  if (source === 'library') return pickFromDevice(selection);
  const got = await captureFromCamera(source);
  if (got === 'denied') { cameraOff(); return null; }
  return got;
}

/** The camera is off for CourtSide: one line, and the way to turn it back on. */
function cameraOff() {
  confirm({
    title: 'Camera is off for CourtSide',
    message: 'Turn it on in Settings to take photos and videos here.',
    confirmLabel: 'Open Settings',
    onConfirm: () => { void Linking.openSettings().catch(() => undefined); },
  });
}
