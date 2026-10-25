/**
 * Reels that start the moment they can play smoothly (Oct 25, owner: "I'm scrolling on Instagram as
 * fast as I can and I don't ever hit a video that's not loaded" / "Can we make ours like that",
 * then, after the covers and the primed beginnings shipped: "Always ready reels are not live or it
 * dos not work").
 *
 * Until now a clip on a phone waited for three seconds of itself before it would play
 * (PRELOAD_SECONDS, components/ClipVideo): a heavy camera file (13 Mb/s HDR) once played its sound
 * while the picture sat still on a thinner buffer. Posted clips are compressed now (lib/shrinkVideo,
 * about 2–3.5 Mb/s), so on a fast flick that wait was most of what you saw: the cover and then the
 * loading disc, page after page, where Instagram starts on well under a second.
 *
 * The quick rule: a clip starts once about one second past where it starts is in (half a second
 * for a very short clip) and the phone's player says it can play, when
 *   - the link is measured quick (lib/netSpeed: the last few clips had their first three seconds
 *     within two seconds), or
 *   - the clip's opening was already on the phone before its page was built: primed ahead
 *     (preloadMore) or fetched by an earlier page this session;
 * and it carries on fetching to three seconds behind the picture, as every clip does. Everything
 * else keeps the three-second rule: a slow link, nothing measured yet (unless the opening is on the
 * phone), a heavy clip (a camera file the app never compressed), and every clip for the rest of
 * the session once one that started early stalled in its first seconds.
 *
 * None of it can be tried on an iPhone before it ships (no simulator here), so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first. Turned on for everyone by setting this to true and
 * shipping an over-the-air update: no database change, no new native code. In the web demo,
 * ?admin=1 makes the demo's player an admin, though a browser has no such wait to begin with
 * (ClipVideo.web plays as soon as the browser can). The same pattern as PRELOAD_MORE_FOR_EVERYONE.
 *
 * Plain logic with no app imports, so scripts/start-check.mjs can run it as it is.
 */
export const QUICK_START_FOR_EVERYONE = false;

/** Seconds of a clip fetched before it counts as loaded, and before it starts under the three-second rule. */
export const PRELOAD_SECONDS = 3;
/** Seconds past where a clip starts that the quick rule waits for. */
export const QUICK_START_SECONDS = 1;
/** The least either rule waits for, for a clip shorter than its wait. */
export const MIN_START_SECONDS = 0.5;
/** A clip's picture this heavy (bits a second) is a camera file the app never compressed: three seconds first. */
export const HEAVY_BPS = 6_000_000;
/** A stall this soon after a quick start says the link cannot keep up with one. */
export const EARLY_STALL_MS = 4000;
/** How long a wait must last to count as a stall rather than the player's instant check on pressing play. */
export const STALL_CONFIRM_MS = 300;

/**
 * Whether the signed-in person is an admin, as AppContext last said. Kept here, outside React, so
 * a player reads it the moment it decides, without every clip redrawing on every change.
 */
let admin = false;
/** Called by AppContext whenever the signed-in person's admin flag is known or changes (false when signed out). */
export function setQuickStartAdmin(isAdmin: boolean) { admin = isAdmin; }
/** Whether the quick rule is on for this person right now. */
export const quickStartOn = (): boolean => QUICK_START_FOR_EVERYONE || admin;

/**
 * Clips whose opening is on the phone this session, in the video player's own cache (useCaching,
 * lib/videoSource): primed ahead (preloadMore) or fetched by a page that had its first second in.
 */
const openings = new Set<string>();
export function noteOpeningCached(uri: string) {
  if (openings.has(uri)) return;
  openings.add(uri);
  if (openings.size > 500) { const oldest = openings.values().next().value; if (oldest !== undefined) openings.delete(oldest); }
}
export const openingCached = (uri: string): boolean => openings.has(uri);

/** A clip that started on the quick rule stalled in its first seconds: three seconds for every clip from now on this session. */
let stalled = false;
export function noteEarlyStall() { stalled = true; }
export const stalledEarly = (): boolean => stalled;

export type LinkState = 'quick' | 'slow' | 'unknown';
export type StartRule = 'quick' | 'careful';

/** Which rule a clip starts on. */
export function startRule(at: { on: boolean; link: LinkState; cached: boolean; heavy: boolean; stalledBefore: boolean }): StartRule {
  if (!at.on || at.stalledBefore || at.heavy || at.link === 'slow') return 'careful';
  return at.link === 'quick' || at.cached ? 'quick' : 'careful';
}

/** Seconds a clip of `length` must have in past where it starts, under `rule`. */
export function secondsNeeded(rule: StartRule, length: number): number {
  const want = rule === 'quick' ? QUICK_START_SECONDS : PRELOAD_SECONDS;
  return Math.min(want, Math.max(MIN_START_SECONDS, length - 0.1));
}

/** A clip's picture as its player describes it (expo-video's VideoTrack, the parts read here). */
export type TrackInfo = { averageBitrate?: number | null; bitrate?: number | null; peakBitrate?: number | null; videoRange?: string | null };

/** Heavy: HDR, or more data a second than any clip the app compresses (a camera file posted as it was). Unknown is not heavy. */
export function heavyTrack(track: TrackInfo | null | undefined): boolean {
  if (!track) return false;
  if (track.videoRange === 'hlg' || track.videoRange === 'pq') return true;
  const bps = track.averageBitrate ?? track.bitrate ?? track.peakBitrate ?? 0;
  return bps > HEAVY_BPS;
}

/** What a player says about a clip: its state, its length, how far it is fetched, and where it waits to start. */
export type StartProbe = { status: string; length: number; buffered: number; from: number };

/** Whether a clip has `need` seconds in past where it starts (or all of itself) and its player says it can play. */
export function hasIn(probe: StartProbe, need: number): boolean {
  return probe.status === 'readyToPlay' && probe.length > 0
    && (probe.buffered >= probe.from + need || probe.buffered >= probe.length - 0.1);
}

/** Everything one readiness check of a clip on a phone weighs (components/ClipVideo). */
export type StartInputs = {
  /** What the player says now; null if it cannot say. */
  probe: StartProbe | null;
  /** The clip cannot load: it counts as arrived, so its page shows. */
  failed: boolean;
  /** It is the clip on screen, meant to be playing. */
  wanted: boolean;
  /** It was ready before: with the quick rule on, it stays ready while its player says it can play. */
  wasReady: boolean;
  on: boolean; link: LinkState; cached: boolean; heavy: boolean; stalledBefore: boolean;
};
export type StartDecision = {
  /** Its first three seconds (or all of it) are in: loaded, as every clip had to be before it could start. */
  loaded: boolean;
  /** Its first second is in: a page built for it later finds its opening on the phone. */
  opening: boolean;
  /** It may start now on the quick rule, before its three seconds are in. */
  quick: boolean;
  /** Ready: it starts if it is the clip on screen, and its page shows it rather than its cover. */
  ready: boolean;
};

/**
 * One readiness check. A clip off screen is ready only once loaded, as before, so the Feed's next
 * fetches still wait for the pages nearer; the clip on screen may be ready sooner, on the quick rule.
 */
export function decideStart(at: StartInputs): StartDecision {
  const probe = at.probe;
  const loaded = !!probe && hasIn(probe, secondsNeeded('careful', probe.length));
  const opening = !!probe && hasIn(probe, secondsNeeded('quick', probe.length));
  const quick = opening && !loaded && at.wanted && startRule(at) === 'quick';
  // With the rule on, a clip that was ready stays ready while its player can play (swiped past before
  // its three seconds were in, or a loop's jump back). A real stall (the player waiting) is not ready,
  // as before, so a post's own spinner still shows it. With the rule off: exactly the old rule.
  const holding = at.on && at.wasReady && !!probe && probe.status === 'readyToPlay';
  return { loaded, opening, quick, ready: loaded || at.failed || quick || holding };
}
