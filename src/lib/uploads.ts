import { useSyncExternalStore } from 'react';
import type { Post, Story } from '@/data/types';

/**
 * What is on its way up right now, for the strip across the top of the
 * screen: one row per post being uploaded, with how far along it is. Kept
 * outside React so the store can report progress from anywhere.
 */
export interface UploadJob {
  id: string;
  label: string;
  /** A small picture of what is going up, if there is one. */
  thumb?: string;
  /** 0–1 */
  fraction: number;
  state: 'uploading' | 'done' | 'failed';
  /** Why it failed, in plain words. */
  reason?: string;
}

/** The post or Instant itself, so the feed can show it at the top while it is still going up. */
export type UploadPreview = { post: Post; story?: undefined } | { story: Story; post?: undefined };

/**
 * One row per upload without its percentage: what the feed needs to know
 * (which of your things are still going up, and what they look like), and
 * nothing that changes every few milliseconds, so the feed only redraws when
 * an upload starts, lands or fails.
 */
export interface PendingUpload {
  id: string;
  state: UploadJob['state'];
  /** Its page in the feed: "p:<id>" for a post, "h:<id>" for an Instant. */
  key?: string;
  post?: Post;
  story?: Story;
}

let jobs: UploadJob[] = [];
let pending: PendingUpload[] = [];
const previews = new Map<string, UploadPreview>();
/** The picture and video as they are on this phone, for everything posted from it this session. */
const localMedia = new Map<string, { imageUrl?: string; videoUrl?: string; thumbnailUrl?: string }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/*
 * The figure on show. It eases toward the latest report and keeps creeping a
 * touch ahead of it (never past 98% until it truly lands), so it is always
 * moving: quick out of the gate, patient near the end. One clock for every
 * place that shows it — the strip and the post's own page in the feed read
 * the same number — and only those places redraw thirty times a second.
 */
const eased = new Map<string, number>();
const easedListeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | null = null;
function startClock() {
  if (clock) return;
  clock = setInterval(() => {
    let moved = false;
    for (const job of jobs) {
      const d = eased.get(job.id) ?? 0;
      const uploading = job.state === 'uploading';
      const goal = uploading ? job.fraction : 1;
      const cap = uploading ? Math.min(0.985, goal + 0.08) : 1;
      const creep = uploading ? 0.0035 * Math.pow(1 - d, 2.2) + 0.00015 : 0.03;
      const next = Math.max(d, Math.min(cap, d + Math.max(0, goal - d) * 0.06 + creep));
      if (next !== d) { eased.set(job.id, next); moved = true; }
    }
    if (moved) easedListeners.forEach((fn) => fn());
    if (!jobs.length && clock) { clearInterval(clock); clock = null; }
  }, 33);
}
const subscribeEased = (fn: () => void) => { easedListeners.add(fn); return () => { easedListeners.delete(fn); }; };

function syncPending() {
  pending = jobs.map((j) => {
    const preview = previews.get(j.id);
    return { id: j.id, state: j.state, key: preview?.post ? `p:${j.id}` : preview?.story ? `h:${j.id}` : undefined, post: preview?.post, story: preview?.story };
  });
}

export function startUpload(id: string, label: string, thumb?: string, preview?: UploadPreview) {
  jobs = [...jobs.filter((j) => j.id !== id), { id, label, thumb, fraction: 0, state: 'uploading' }];
  if (preview) {
    previews.set(id, preview);
    const media = preview.post ?? preview.story;
    localMedia.set(id, { imageUrl: media.imageUrl, videoUrl: media.videoUrl, thumbnailUrl: media.thumbnailUrl });
  }
  eased.set(id, 0);
  syncPending();
  startClock();
  emit();
}

export function setUploadProgress(id: string, fraction: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  jobs = jobs.map((j) => (j.id === id && j.state === 'uploading' && clamped > j.fraction ? { ...j, fraction: clamped } : j));
  emit();
}

/** Marks the job finished; it leaves the strip on its own a moment later. */
export function finishUpload(id: string, ok = true, reason?: string) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, fraction: ok ? 1 : j.fraction, state: ok ? 'done' : 'failed', reason } : j));
  // A post that never got there is nobody's, not even on this phone.
  if (!ok) { previews.delete(id); localMedia.delete(id); }
  syncPending();
  emit();
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.set(id, setTimeout(() => { jobs = jobs.filter((j) => j.id !== id); previews.delete(id); timers.delete(id); syncPending(); emit(); }, ok ? 4500 : 6000));
}

/** The demo build has nowhere to upload to: walk the bar up so the moment still reads. */
export function simulateUpload(id: string, label: string, thumb?: string, preview?: UploadPreview) {
  startUpload(id, label, thumb, preview);
  let f = 0;
  const step = () => {
    f = Math.min(1, f + 0.12 + Math.random() * 0.12);
    setUploadProgress(id, f);
    if (f < 1) setTimeout(step, 90);
    else finishUpload(id);
  };
  setTimeout(step, 120);
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useUploads(): UploadJob[] {
  return useSyncExternalStore(subscribe, () => jobs, () => jobs);
}

/** Every upload under way or just finished, without the running percentage. */
export function usePendingUploads(): PendingUpload[] {
  return useSyncExternalStore(subscribe, () => pending, () => pending);
}
/** The same, read once (for code that is not drawing). */
export function pendingUploads(): PendingUpload[] {
  return pending;
}

/** One upload, for something that shows just that one. */
export function useUploadJob(id: string): UploadJob | undefined {
  const get = () => jobs.find((j) => j.id === id);
  return useSyncExternalStore(subscribe, get, get);
}

/**
 * The picture and video of something posted from this phone this session,
 * as they are on the phone. The feed plays your own clip from here even
 * after it has landed, so the page never reloads (or jumps) the moment the
 * hosted copy takes over.
 */
export function localCopyOf(id: string) {
  return localMedia.get(id);
}

/** The eased 0–1 figure for one upload (0 when there is none). */
export function useEasedFraction(id: string | undefined): number {
  const get = () => (id ? eased.get(id) ?? 0 : 0);
  return useSyncExternalStore(subscribeEased, get, get);
}

/**
 * The upload whose own page is on screen in the feed right now. That page
 * shows its progress itself, so the strip across the top steps aside while
 * it is there and comes back when you scroll on.
 */
let shownInFeed: string | null = null;
export function setShownInFeed(id: string | null) {
  if (shownInFeed === id) return;
  shownInFeed = id;
  emit();
}
export function useShownInFeed(): string | null {
  return useSyncExternalStore(subscribe, () => shownInFeed, () => shownInFeed);
}
