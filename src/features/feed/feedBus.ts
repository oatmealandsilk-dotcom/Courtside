/**
 * "Something new of yours just landed": Home hears this and rebuilds its
 * pages from the top, so a post that has finished uploading shows up first.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export function requestFeedRefresh() { listeners.forEach((fn) => fn()); }
export function subscribeFeedRefresh(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
