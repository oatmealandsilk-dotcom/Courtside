import { AppState } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { File as DeviceFile } from 'expo-file-system';
import { reportError } from '@/lib/crashReporting';

/** The long edge a posted video is kept at: 1080p, what Instagram Reels serve. */
export const VIDEO_EDGE = 1920;
/** The long edge of the second try, for a clip too long to fit at 1080p: 720p. */
const SMALL_EDGE = 1280;
/** What a shrunk video must stay under to be sent: a little below the 50 MB upload limit. */
const FITS_BYTES = 48 * 1024 * 1024;
/** What the 720p try aims for, leaving room for the sound and the file's own bookkeeping. */
const TARGET_BYTES = 44 * 1024 * 1024;
/** The picture's data a second at 720p: never more than this (sharp on any phone), never less than the floor. */
const MAX_720P_BITRATE = 2_500_000;
const MIN_BITRATE = 700_000;
/** The sound's share of the data a second, about what a phone records. */
const AUDIO_BITRATE = 128_000;
/** Tries at one size before giving up: the phone stops a shrink when the app is left mid-way. */
const TRIES = 3;

type CompressOptions = { compressionMethod: 'manual'; maxSize: number; bitrate?: number; progressDivider?: number };
type VideoCompressor = { compress(uri: string, options: CompressOptions, onProgress?: (p: number) => void): Promise<string> };
type Library = { video: VideoCompressor; seconds: (uri: string) => Promise<number> };
let library: Library | null | undefined;

/**
 * The phone's video compressor, when this build of the app carries it. It
 * is a native add-on, so the App Store / TestFlight build has it and Expo Go
 * (the preview app) does not; there it is never even loaded.
 */
function load(): Library | null {
  if (library !== undefined) return library;
  library = null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return library;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const found = require('react-native-compressor') as { Video?: VideoCompressor; getVideoMetaData?: (uri: string) => Promise<{ duration?: number }> };
    if (found.Video?.compress) {
      const meta = found.getVideoMetaData;
      library = {
        video: found.Video,
        seconds: async (uri) => (meta ? Number((await meta(uri).catch(() => null))?.duration) || 0 : 0),
      };
    }
  } catch { /* not in this build */ }
  return library;
}

/**
 * True when videos are shrunk here, on upload. The picker still converts a
 * video to 1080p H.264 first (see MediaPicker): this compressor keeps a
 * clip's HDR colour labels, and HDR clips show black in browsers.
 */
export const canShrinkVideo = () => !!load();

/** A file's size in bytes, read from the file system (nothing loaded into memory); 0 if unknown. */
function bytesOf(uri: string): number {
  try {
    const file = new DeviceFile(uri);
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * The phone stops a shrink when CourtSide is left while it runs (another
 * app opened, the screen locked): iPhones let no app in the background use
 * the video chip. Apple calls it "Operation Interrupted" (error -11847).
 */
const wasInterrupted = (err: unknown) => /-11847|interrupt/i.test(err instanceof Error ? err.message : String(err));

/** Resolves once CourtSide is on screen again (straight away if it is). */
function whenBack(): Promise<void> {
  if (AppState.currentState === 'active') return new Promise((done) => setTimeout(done, 400));
  return new Promise((done) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      // A moment for the phone to hand the video chip back.
      setTimeout(done, 600);
    });
  });
}

/**
 * One shrink at one size. Interrupted (the app was left), it waits for the
 * app to be back on screen and starts again, up to three times. Null if it
 * could not be done.
 */
async function attempt(video: VideoCompressor, uri: string, options: CompressOptions, onProgress: (p: number) => void): Promise<string | null> {
  for (let tryNo = 1; tryNo <= TRIES; tryNo++) {
    try {
      const out = await video.compress(uri, options, (p) => onProgress(Math.min(1, Math.max(0, p))));
      return out || null;
    } catch (err) {
      if (wasInterrupted(err) && tryNo < TRIES) {
        onProgress(0);
        await whenBack();
        continue;
      }
      // Filed: a shrink that fails is the size limit's usual cause.
      void reportError(err, { where: `shrink video (${options.maxSize}p edge, try ${tryNo})` });
      return null;
    }
  }
  return null;
}

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
 * 4K from an iPhone goes from 300 MB or more to about 25 MB.
 *
 * A clip still too big for the 50 MB limit after that (several minutes
 * long) is made again at 720p, at the bitrate that fits its length. A
 * shrink stopped by leaving the app starts again once the app is back.
 * Anything that still goes wrong returns the smallest file it has, which
 * may be the original untouched.
 */
export async function shrinkVideo(uri: string, onProgress?: (fraction: number) => void): Promise<string> {
  const lib = load();
  if (!lib) return uri;
  const report = (p: number) => onProgress?.(p);
  const turn = queue.then(async () => {
    const full = await attempt(lib.video, uri, { compressionMethod: 'manual', maxSize: VIDEO_EDGE, progressDivider: 5 }, report);
    if (full && bytesOf(full) <= FITS_BYTES) return full;
    // The 1080p try failed but the clip fits as it is: sent as it is, at full sharpness.
    if (!full && bytesOf(uri) <= FITS_BYTES) return uri;
    // Too long for 1080p (or the 1080p try failed): 720p, at a bitrate made for its length.
    const seconds = await lib.seconds(full ?? uri);
    const fit = seconds > 0 ? Math.floor((TARGET_BYTES * 8) / seconds) - AUDIO_BITRATE : MAX_720P_BITRATE;
    const bitrate = Math.max(MIN_BITRATE, Math.min(MAX_720P_BITRATE, fit));
    // Made from the original, not the 1080p copy: shrinking twice blurs it.
    const small = await attempt(lib.video, uri, { compressionMethod: 'manual', maxSize: SMALL_EDGE, bitrate, progressDivider: 5 }, report);
    if (!small) return full ?? uri;
    if (!full) return small;
    return bytesOf(small) < bytesOf(full) ? small : full;
  });
  // The next one waits for this one, however it ends.
  queue = turn.catch(() => undefined);
  return turn;
}
