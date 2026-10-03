import Constants, { ExecutionEnvironment } from 'expo-constants';
import { reportError } from '@/lib/crashReporting';

/** The long edge a posted video is kept at: 1080p, what Instagram Reels serve. */
export const VIDEO_EDGE = 1920;

type VideoCompressor = { compress(uri: string, options: Record<string, unknown>, onProgress?: (p: number) => void): Promise<string> };
let compressor: VideoCompressor | null | undefined;

/**
 * The phone's video compressor, when this build of the app carries it. It
 * is a native add-on, so the App Store / TestFlight build has it and Expo Go
 * (the preview app) does not; there it is never even loaded.
 */
function load(): VideoCompressor | null {
  if (compressor !== undefined) return compressor;
  compressor = null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return compressor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const found = require('react-native-compressor').Video as VideoCompressor | undefined;
    if (found?.compress) compressor = found;
  } catch { /* not in this build */ }
  return compressor;
}

/**
 * True when videos are shrunk here, on upload. The picker still converts a
 * video to 1080p H.264 first (see MediaPicker): this compressor keeps a
 * clip's HDR colour labels, and HDR clips show black in browsers.
 */
export const canShrinkVideo = () => !!load();

/**
 * One video is shrunk at a time. Two clips posted back to back used to be
 * shrunk side by side: twice the memory, and the compressor's own bookkeeping
 * is not built to be written from two places at once. The second simply
 * waits its turn (its strip sits at the start meanwhile).
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * A video, made the size a feed needs before it is uploaded, the way
 * Instagram does it: at most 1080p, H.264 (plays on every phone and
 * browser), at a bitrate the compressor picks from the clip itself —
 * about 2–3.5 Mbps at 1080p, never more than the original had. A minute of
 * 4K from an iPhone goes from 300 MB or more to about 25 MB. Anything that
 * goes wrong returns the original untouched.
 */
export async function shrinkVideo(uri: string, onProgress?: (fraction: number) => void): Promise<string> {
  const video = load();
  if (!video) return uri;
  const turn = queue.then(async () => {
    try {
      const out = await video.compress(uri, { compressionMethod: 'manual', maxSize: VIDEO_EDGE, progressDivider: 5 }, (p) => onProgress?.(Math.min(1, Math.max(0, p))));
      return out || uri;
    } catch (err) {
      // Filed: a shrink that fails sends the full-size original instead, which is the size limit's usual cause.
      void reportError(err, { where: 'shrink video' });
      return uri;
    }
  });
  // The next one waits for this one, however it ends.
  queue = turn.catch(() => undefined);
  return turn;
}
