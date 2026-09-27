/** The long edge a posted video is kept at: 1080p, what Instagram Reels serve. */
export const VIDEO_EDGE = 1920;

/** A browser has no video compressor to hand, so a video goes up as chosen. */
export const canShrinkVideo = () => false;

export async function shrinkVideo(uri: string, _onProgress?: (fraction: number) => void): Promise<string> {
  return uri;
}
