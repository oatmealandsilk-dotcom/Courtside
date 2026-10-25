import { AppState, Platform } from 'react-native';
import { createVideoPlayer, type BufferOptions, type VideoPlayer } from 'expo-video';
import { videoSource } from '@/lib/videoSource';

/** How much of a clip's beginning to fetch, the most it may cost, how long to try, and how long a stopped fetch is waited on (preloadMore). */
export type PrimeLimits = { seconds: number; minSeconds: number; bytes: number; giveUpMs: number; stallMs: number };

/** The sound's share of a clip's data a second, about what a phone records. */
const AUDIO_BPS = 128_000;

/**
 * Fetches the very beginning of a clip on a phone into the video player's own cache, ahead of its
 * page being built (features/feed/preloadMore). Returns a cancel that frees everything at once.
 *
 * Why a player rather than a plain download: the Feed's players read clips through expo-video's
 * cache (`useCaching`, lib/videoSource). On an iPhone that cache sits between AVPlayer and the
 * network (a resource loader writing each fetched byte range to a file, kept when the fetch is
 * cut short); on Android it is ExoPlayer's own disk cache (SimpleCache), which keeps every span it
 * has written. A later player for the same address is served whatever is on disk first and only
 * asks the network for the rest. A fetch() or an image prefetch goes to a different cache that
 * neither player ever looks in, so it would cost the data and gain nothing.
 *
 * The player is never drawn (no view: on an iPhone nothing is decoded), stays silent and paused,
 * and is told to buffer only that second or so (Android: at most `bytes` too). It is freed the
 * moment that much is in, on an error, after `giveUpMs`, or when the app leaves the front. A
 * trimmed clip is fetched from where it starts playing, as its page will be.
 */
export function primeClip(uri: string, from: number, limits: PrimeLimits, done: (ok: boolean) => void): () => void {
  let player: VideoPlayer | null = null;
  let over = false;
  // Until the clip's weight is known, a second; then as much as `bytes` buys, within the limits.
  let seconds = Math.min(limits.seconds, 1);
  let placed = from <= 0.05;
  // Where the fetch last stood and since when: one that stops short of `seconds` is done once it has sat still `stallMs`.
  let lastAt = -1;
  let movedAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const subs: { remove: () => void }[] = [];
  const free = () => {
    if (timer) clearInterval(timer);
    if (giveUp) clearTimeout(giveUp);
    subs.splice(0).forEach((sub) => { try { sub.remove(); } catch { /* gone */ } });
    const p = player;
    player = null;
    if (!p) return;
    // Each native call stands on its own: a failed one must never keep the player alive.
    try { p.pause(); } catch { /* released */ }
    try { p.release(); } catch { /* released */ }
  };
  const finish = (ok: boolean) => {
    if (over) return;
    over = true;
    free();
    done(ok);
  };
  const cancel = () => {
    if (over) return;
    over = true;
    free();
  };
  const buffer = (span: number): BufferOptions => (Platform.OS === 'android'
    ? { preferredForwardBufferDuration: span, minBufferForPlayback: span, maxBufferBytes: limits.bytes }
    : { preferredForwardBufferDuration: span });
  const check = () => {
    const p = player;
    if (!p || over) return;
    try {
      if (p.status === 'error') { finish(false); return; }
      if (p.status !== 'readyToPlay') return;
      const length = p.duration || 0;
      if (length <= 0) return;
      if (!placed) {
        placed = true;
        if (Math.abs(p.currentTime - from) > 0.05) { p.currentTime = from; return; }
      }
      const need = Math.min(seconds, Math.max(0.3, length - from - 0.1));
      const at = p.bufferedPosition;
      if (at >= from + need) { finish(true); return; }
      // Android's byte cap stops a heavier clip just short of `need`, and it never gets further:
      // what is in is kept, and the player is freed now rather than held until `giveUpMs`.
      const now = Date.now();
      if (at !== lastAt) { lastAt = at; movedAt = now; } else if (at > from && now - movedAt >= limits.stallMs) finish(true);
    } catch {
      finish(false);
    }
  };
  try {
    // Made empty first, so the small buffer is in place before a single byte is asked for.
    const p = createVideoPlayer(null);
    player = p;
    p.muted = true;
    p.loop = false;
    p.bufferOptions = buffer(seconds);
    subs.push(p.addListener('statusChange', check));
    subs.push(p.addListener('sourceLoad', ({ availableVideoTracks }) => {
      const track = availableVideoTracks?.[0];
      const bps = track?.averageBitrate ?? track?.bitrate ?? track?.peakBitrate ?? 0;
      if (!(bps > 0) || over) return;
      seconds = Math.max(limits.minSeconds, Math.min(limits.seconds, (limits.bytes * 8) / (bps + AUDIO_BPS)));
      try { p.bufferOptions = buffer(seconds); } catch { /* released */ }
    }));
    // The app leaving the front stops it there and then; the Feed starts it again once back.
    subs.push(AppState.addEventListener('change', (state) => { if (state !== 'active') cancel(); }));
    timer = setInterval(check, 100);
    giveUp = setTimeout(() => finish(false), limits.giveUpMs);
    p.replaceAsync(videoSource(uri)).catch(() => finish(false));
  } catch {
    setTimeout(() => finish(false), 0);
  }
  return cancel;
}
