/**
 * "Something new of yours has just landed": Home hears this and puts that
 * page ("p:<id>" for a post, "h:<id>" for an Instant) at the very top and
 * takes the feed there. It is sent once the post is saved and its picture or
 * video is on the internet, never while it is still going up (the strip
 * across the top shows that), so the feed only ever plays the hosted copy.
 * With no page named, Home simply deals itself again.
 */
type Listener = (key?: string) => void;
const listeners = new Set<Listener>();
export function requestFeedRefresh(key?: string) { listeners.forEach((fn) => fn(key)); }
export function subscribeFeedRefresh(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
