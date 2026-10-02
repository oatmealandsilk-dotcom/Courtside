import { useSyncExternalStore } from 'react';

/**
 * What is on its way up right now, for the strip across the top of the
 * screen: one row per post being uploaded, with how far along it is. Kept
 * outside React so the store can report progress from anywhere.
 *
 * Nothing here is saved on the phone. An upload that was under way when the
 * app closed is simply gone, so nothing can ever be sent a second time when
 * the app opens again.
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
  /** The post's hashtags, so the weekly challenge can say "your entry is posting" before it lands. */
  tags?: string[];
}

let jobs: UploadJob[] = [];
/** When a post from this phone last started or finished going up this session (0 = never). */
let lastStartedAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function startUpload(id: string, label: string, thumb?: string, tags?: string[]) {
  jobs = [...jobs.filter((j) => j.id !== id), { id, label, thumb, fraction: 0, state: 'uploading', tags }];
  lastStartedAt = Date.now();
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
  // The quiet after a post (no tour, no update restart) counts from when it lands too, not only from Share.
  lastStartedAt = Date.now();
  emit();
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.set(id, setTimeout(() => { jobs = jobs.filter((j) => j.id !== id); timers.delete(id); emit(); }, ok ? 4500 : 6000));
}

/**
 * Takes a job off the strip straight away, with no "Posted" or "Could not
 * post": for something deleted while it was still going up, so the strip
 * never points at a thing that no longer exists.
 */
export function cancelUpload(id: string) {
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.delete(id);
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

/** The demo build has nowhere to upload to: walk the bar up so the moment still reads. */
export function simulateUpload(id: string, label: string, thumb?: string, tags?: string[]) {
  startUpload(id, label, thumb, tags);
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

/** For code that is not drawing (the crash notes): told whenever an upload starts, moves or ends. */
export function subscribeUploads(fn: () => void): () => void {
  return subscribe(fn);
}

/**
 * Uploads that never show on the strip, such as a new profile photo, still
 * count: the app must not restart itself for an update halfway through one
 * (that is how a friend's new photo once never saved). Returns the release.
 */
let quiet = 0;
export function holdQuietUpload(): () => void {
  quiet++;
  let released = false;
  return () => { if (!released) { released = true; quiet = Math.max(0, quiet - 1); } };
}
/** True while a quiet upload (see holdQuietUpload) is on its way up. */
export function quietUploading(): boolean {
  return quiet > 0;
}

/** True while anything is still on its way up. The app never restarts itself for an update then. */
export function anyUploading(): boolean {
  return jobs.some((j) => j.state === 'uploading');
}
/** The same, for something drawn: it redraws only when the answer changes, not on every percent. */
export function useAnyUploading(): boolean {
  return useSyncExternalStore(subscribe, anyUploading, anyUploading);
}

/**
 * Whether a post with this hashtag is still on its way up from this phone —
 * a weekly challenge entry, say. Until it lands it is in nobody's list, so
 * the challenge says "Your entry is posting…" rather than looking as if
 * nothing happened (which is how one entry became two). Redraws only when
 * the answer changes.
 */
export function useTagPosting(tag: string): boolean {
  const get = () => jobs.some((j) => j.state === 'uploading' && !!j.tags?.includes(tag));
  return useSyncExternalStore(subscribe, get, get);
}

/** Milliseconds since a post from this phone last started or finished going up this session (Infinity if never). */
export function sinceLastPost(): number {
  return lastStartedAt ? Date.now() - lastStartedAt : Infinity;
}
