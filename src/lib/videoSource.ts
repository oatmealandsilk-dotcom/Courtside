import type { VideoSource } from 'expo-video';

/**
 * What a player is given for a clip. A clip from the internet is kept on the
 * phone once it has played (the video player's own cache, about 1 GB, oldest
 * dropped first), so scrolling back to it or opening the app again plays it
 * straight away instead of downloading it again, the way Instagram does.
 * A file already on the phone (a clip being posted) is used as it is.
 */
export function videoSource(uri: string): VideoSource {
  return /^https?:\/\//i.test(uri) ? { uri, useCaching: true } : uri;
}
