import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { createVideoPlayer } from 'expo-video';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface Frame { time: number; uri: string }

/**
 * Still frames out of a video at the given seconds — for the trim strip and
 * for picking a cover. A frame the phone cannot produce is simply left out.
 */
/** `width` only matters in the browser and on Android; an iPhone always gives its full-size frame. */
export async function framesAt(uri: string, times: number[], width?: number): Promise<Frame[]> {
  if (Platform.OS === 'android') {
    const exact = await androidFramesAt(uri, times, width);
    if (exact) return exact;
  }
  const out: Frame[] = [];
  for (const time of times) {
    try {
      const shot = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.max(0, Math.round(time * 1000)), quality: 0.6 });
      out.push({ time, uri: shot.uri });
    } catch {
      // Skip it; the strip shows what it can.
    }
  }
  return out;
}

/**
 * Android (Oct 5): the exact frame at each moment. The thumbnail kit there
 * gives the nearest keyframe, which a phone's camera writes about once a
 * second, so the cover saved could be up to a second from the frame chosen
 * on the Cover page, and a short clip's strip repeated frames. The video
 * player's own frame grabber takes the exact frame; each is saved as a JPEG
 * file, one at a time (a whole strip of full-size frames held at once could
 * run a phone out of memory), at most `width` wide (a strip's 360 if none is
 * given). Null if it cannot (an old build, an odd file): the thumbnail kit
 * then does it as before.
 */
async function androidFramesAt(uri: string, times: number[], width?: number): Promise<Frame[] | null> {
  let player: ReturnType<typeof createVideoPlayer> | null = null;
  try {
    player = createVideoPlayer({ uri });
    player.muted = true;
    const out: Frame[] = [];
    for (const time of times) {
      try {
        const [thumb] = await player.generateThumbnailsAsync(Math.max(0, time), { maxWidth: width ?? 360 });
        if (!thumb) continue;
        const image = await ImageManipulator.manipulate(thumb).renderAsync();
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: width && width >= 720 ? 0.85 : 0.6 });
        out.push({ time, uri: saved.uri });
      } catch {
        // Skip it; the strip shows what it can.
      }
    }
    return out.length || !times.length ? out : null;
  } catch {
    return null;
  } finally {
    try { player?.release(); } catch { /* already gone */ }
  }
}
