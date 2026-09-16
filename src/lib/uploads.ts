import { useSyncExternalStore } from 'react';

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

let jobs: UploadJob[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function startUpload(id: string, label: string, thumb?: string) {
  jobs = [...jobs.filter((j) => j.id !== id), { id, label, thumb, fraction: 0, state: 'uploading' }];
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
  emit();
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.set(id, setTimeout(() => { jobs = jobs.filter((j) => j.id !== id); timers.delete(id); emit(); }, ok ? 1800 : 6000));
}

/** The demo build has nowhere to upload to: walk the bar up so the moment still reads. */
export function simulateUpload(id: string, label: string, thumb?: string) {
  startUpload(id, label, thumb);
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
