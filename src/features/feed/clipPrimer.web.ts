/** How much of a clip's beginning to fetch, the most it may cost, and how long to try (preloadMore). */
export type PrimeLimits = { seconds: number; minSeconds: number; bytes: number; giveUpMs: number };

/**
 * Fetches the very beginning of a clip in a browser, ahead of its page being built (the phone's
 * clipPrimer says why). Returns a cancel that stops the fetch at once.
 *
 * A browser keeps what a video element fetched for the next one that asks for the same address
 * (its media cache, and the HTTP cache behind it), so the page's own video, built a swipe or two
 * later, finds that second already there. A fetch() of the address would not do: a video asks
 * for byte ranges, which that kind of download does not leave behind for it. So it is an unseen,
 * silent video element, never put on the page, told to load, and emptied (which stops its
 * download) the moment that much is in, after `giveUpMs`, or when it is no longer wanted. A browser
 * gives no clip's weight, so it stops at `seconds`. A trimmed clip is fetched from where it starts playing.
 */
export function primeClip(uri: string, from: number, limits: PrimeLimits, done: (ok: boolean) => void): () => void {
  if (typeof document === 'undefined') {
    setTimeout(() => done(false), 0);
    return () => undefined;
  }
  const video = document.createElement('video');
  let over = false;
  let placed = from <= 0.05;
  const events = ['loadedmetadata', 'progress', 'canplay', 'canplaythrough', 'error'] as const;
  const free = () => {
    clearInterval(timer);
    clearTimeout(giveUp);
    events.forEach((name) => video.removeEventListener(name, check));
    // Emptied rather than just let go: an element still holding its address can keep downloading.
    video.removeAttribute('src');
    try { video.load(); } catch { /* nothing to stop */ }
  };
  const finish = (ok: boolean) => {
    if (over) return;
    over = true;
    free();
    done(ok);
  };
  function check() {
    if (over) return;
    if (video.error) { finish(false); return; }
    const length = video.duration;
    if (!Number.isFinite(length) || length <= 0) return;
    if (!placed) {
      placed = true;
      if (Math.abs(video.currentTime - from) > 0.05) { video.currentTime = from; return; }
    }
    const need = Math.min(limits.seconds, Math.max(0.3, length - from - 0.1));
    for (let i = 0; i < video.buffered.length; i += 1) {
      if (video.buffered.start(i) <= from + 0.05 && video.buffered.end(i) >= from + need) { finish(true); return; }
    }
  }
  events.forEach((name) => video.addEventListener(name, check));
  const timer = setInterval(check, 100);
  const giveUp = setTimeout(() => finish(false), limits.giveUpMs);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = uri;
  return () => {
    if (over) return;
    over = true;
    free();
  };
}
