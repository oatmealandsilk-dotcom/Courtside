/**
 * "Something new of yours was just posted": Home hears this and puts that
 * page ("p:<id>" for a post, "h:<id>" for an Instant) at the very top and
 * takes the feed there — straight away, while a clip is still uploading,
 * not once it has landed. With no page named, Home simply deals itself again.
 */
type Listener = (key?: string) => void;
const listeners = new Set<Listener>();
export function requestFeedRefresh(key?: string) { listeners.forEach((fn) => fn(key)); }
export function subscribeFeedRefresh(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
