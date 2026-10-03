import { reportError } from '@/lib/crashReporting';

/** The long edge a posted video is kept at: 1080p, what Instagram Reels serve. */
export const VIDEO_EDGE = 1920;

/**
 * The website shrinks a video in the browser itself, before it is sent,
 * the way the phone app does with its own compressor. It uses the
 * browser's built-in video tools (called WebCodecs: the same hardware the
 * browser plays video with, here run in reverse to make one) and a small
 * library, mediabunny, that unpacks and repacks the video file around them.
 *
 * Why it matters: the website is how Android players post (there is no
 * Android app yet), and an Android phone films 4K at 60 frames a second —
 * half a minute is 57 MB, over the 50 MB upload limit. Shrunk to 1080p it
 * is about 15 MB.
 */

/** What a shrunk video aims to stay under, leaving room below the 50 MB limit. */
const TARGET_BYTES = 44 * 1024 * 1024;
/** The picture's bitrate (data per second) at 1080p: what Instagram uses, sharp on any phone. */
const VIDEO_BITRATE = 5_000_000;
/** Below this a 1080p picture turns blocky, so a long clip is made 720p instead. */
const MIN_1080P_BITRATE = 3_000_000;
/** The lowest picture bitrate ever used; a clip that would need less is simply too long. */
const MIN_BITRATE = 800_000;
/** Frames a second, at most: tennis at 60 looks the same in a feed and costs twice the data. */
const MAX_FPS = 30;

type Mediabunny = typeof import('mediabunny');
let library: Promise<Mediabunny> | null = null;
/**
 * The library is fetched the first time a video is shrunk, not when the
 * website opens: it is about 600 KB, and most visits never post a video.
 */
const loadLibrary = () => (library ??= import('mediabunny').catch((error) => { library = null; throw error; }));

/** Whether this browser can make H.264 video (what every phone and browser plays): unknown until asked once. */
let encoderWorks: boolean | null = null;
let probing: Promise<boolean> | null = null;

const hasWebCodecs = () =>
  typeof window !== 'undefined'
  && typeof VideoEncoder === 'function'
  && typeof VideoDecoder === 'function'
  && typeof VideoFrame === 'function';

/** Asks the browser, once, whether it can make a 1080p H.264 video. */
function probe(): Promise<boolean> {
  if (encoderWorks !== null) return Promise.resolve(encoderWorks);
  if (!hasWebCodecs()) return Promise.resolve((encoderWorks = false));
  probing ??= (async () => {
    // High, Main and Baseline profile: the first one this browser can make will do.
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
      try {
        const answer = await VideoEncoder.isConfigSupported({ codec, width: 1920, height: 1080, bitrate: VIDEO_BITRATE, framerate: MAX_FPS });
        if (answer.supported) return (encoderWorks = true);
      } catch { /* try the next one */ }
    }
    return (encoderWorks = false);
  })();
  return probing;
}

/**
 * True when this browser can shrink videos. The full answer takes a moment
 * to get, so the first call answers from whether the video tools exist at
 * all and starts the real question; shrinkVideo waits for the real answer
 * and hands back the original if it is no.
 */
export const canShrinkVideo = () => {
  if (encoderWorks !== null) return encoderWorks;
  void probe();
  return hasWebCodecs();
};

/** One video is shrunk at a time, as on the phone: two side by side would need twice the memory. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * A video, made the size a feed needs before it is uploaded, the way the
 * phone app does it: at most 1080p (720p for a long clip), H.264 at about
 * 5 Mbps, at most 30 frames a second, upright (a portrait clip stays
 * portrait), in ordinary colours (an HDR clip is toned down — HDR shows
 * black or washed out in many browsers), sound kept. Returns the address
 * of the new file in the browser's memory. Anything that goes wrong returns
 * the original untouched, and the size check after it says if that is too big.
 */
export async function shrinkVideo(uri: string, onProgress?: (fraction: number) => void): Promise<string> {
  const turn = queue.then(async () => {
    try {
      if (!(await probe())) return uri;
      return await shrink(uri, onProgress);
    } catch (err) {
      // Filed: a shrink that fails sends the full-size original instead, which is the size limit's usual cause.
      void reportError(err, { where: 'shrink video (web)' });
      return uri;
    }
  });
  queue = turn.catch(() => undefined);
  return turn;
}

/** Rounds to an even number, which video encoders need for width and height. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function shrink(uri: string, onProgress?: (fraction: number) => void): Promise<string> {
  const original = await (await fetch(uri)).blob();
  const mb = await loadLibrary();
  // The file is read a piece at a time as it is needed, never all at once.
  const input = new mb.Input({ source: new mb.BlobSource(original), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return uri;
    const audio = await input.getPrimaryAudioTrack();

    const [codec, width, height, hdr, duration, sourceBitrate, frames] = await Promise.all([
      video.getCodec(),
      // The size as it is shown: a phone's portrait clip is often stored sideways with a "turn me" note.
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.hasHighDynamicRange(),
      input.computeDuration(),
      video.getAverageBitrate().catch(() => null),
      video.computeFrameRateMetrics({ targetPacketCount: 300 }).catch(() => null),
    ]);
    if (!width || !height || !(duration > 0)) return uri;
    const longEdge = Math.max(width, height);
    const fps = frames?.bestGuessFrameRate ?? 0;
    const tooFast = fps > MAX_FPS + 0.5 || (frames?.underlyingFrameRate == null && (frames?.maxFrameRate ?? 0) > MAX_FPS + 15);

    // Already fine as it is (an H.264 MP4, 1080p or less, ordinary colours,
    // 30 frames a second or less, not much more data than a shrunk one
    // would have): sent as chosen, no time spent.
    const playableAsIs = codec === 'avc' && !hdr && longEdge <= VIDEO_EDGE && /mp4/i.test(original.type);
    if (playableAsIs && !tooFast && original.size * 8 / duration <= VIDEO_BITRATE * 1.3) return uri;

    // How much data a second the picture gets: 5 Mbps, less for a long clip
    // so the whole file stays under the limit, never more than the original had.
    const audioBitrate = audio ? Math.min(320_000, (await audio.getAverageBitrate().catch(() => null)) ?? 160_000) : 0;
    const budget = (TARGET_BYTES * 8 * 0.97) / duration - audioBitrate;
    let bitrate = Math.min(VIDEO_BITRATE, budget);
    // 1080p, or 720p when a 1080p picture would have to be too thin to fit under the limit.
    const edge = Math.min(longEdge, bitrate < MIN_1080P_BITRATE && longEdge > 1280 ? 1280 : VIDEO_EDGE);
    if (sourceBitrate && sourceBitrate > 0) bitrate = Math.min(bitrate, Math.max(1_000_000, sourceBitrate));
    bitrate = Math.max(MIN_BITRATE, Math.round(bitrate));
    const scale = edge / longEdge;
    const outWidth = even(width * scale);
    const outHeight = even(height * scale);

    // An explicit bitrate: a plain number would be read as a 0–1 quality level.
    const quality = new mb.Quality({ bitrate, bitrateMode: 'variable' });
    if (!(await mb.canEncodeVideo('avc', { width: outWidth, height: outHeight, quality }))) return uri;

    const target = new mb.BufferTarget();
    // "fastStart": the file's index goes at the front, so the feed can start playing it before it has all arrived.
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const resized = edge < longEdge;
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        forceTranscode: true,
        // Only the long edge is given; the other follows the shape. Resizing
        // redraws every frame upright, so a portrait clip comes out portrait
        // with no "turn me" note left to get wrong.
        ...(resized ? (width >= height ? { width: outWidth } : { height: outHeight }) : {}),
        // An HDR clip is redrawn even when its size is right: the redraw is
        // what turns its colours into ordinary ones (8-bit, standard video colour).
        ...(!resized && hdr ? { crop: { left: 0, top: 0, width, height } } : {}),
        quality,
        ...(tooFast ? { frameRate: MAX_FPS } : {}),
        // A fresh whole picture every two seconds, so scrubbing and looping are quick.
        keyFrameInterval: 2,
      },
      // The sound is copied as it is when it is already AAC (what phones
      // record), and converted when it is not.
      audio: {},
    });
    if (!conversion.isValid) return uri;
    // Sound that could not be carried over would be lost: send the original rather than a silent clip.
    if (conversion.discardedTracks.some((d) => d.track.isVideoTrack() || (audio && d.track.id === audio.id))) return uri;

    let shown = 0;
    conversion.onProgress = (fraction) => {
      // In half-percent steps, so the posting strip is not redrawn for every frame.
      const step = Math.floor(Math.min(1, Math.max(0, fraction)) * 200) / 200;
      if (step > shown) {
        shown = step;
        onProgress?.(step);
      }
    };
    await conversion.execute();
    const bytes = target.buffer;
    if (!bytes || bytes.byteLength < 1024) return uri;
    // Shrinking made it no smaller and the original plays everywhere: keep the original.
    if (playableAsIs && !tooFast && bytes.byteLength >= original.size) return uri;
    onProgress?.(1);
    return URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  } finally {
    input.dispose();
  }
}
