export interface Frame { time: number; uri: string }

/**
 * Still frames out of a video in the browser: seek a hidden video element to
 * each time and paint it onto a canvas. Anything the browser cannot decode
 * yields an empty list, and the strip shows nothing rather than blocking.
 */
export async function framesAt(uri: string, times: number[]): Promise<Frame[]> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = uri;
  const ready = await new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => { video.onloadeddata = null; video.onerror = null; resolve(ok); };
    video.onloadeddata = () => done(true);
    video.onerror = () => done(false);
    setTimeout(() => done(false), 6000);
  });
  if (!ready || !Number.isFinite(video.duration) || video.duration <= 0) return [];
  const canvas = document.createElement('canvas');
  const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 16 / 9;
  canvas.width = 240;
  canvas.height = Math.round(240 * ratio) || 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const out: Frame[] = [];
  for (const time of times) {
    const seeked = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => { video.onseeked = null; video.onerror = null; resolve(ok); };
      video.onseeked = () => done(true);
      video.onerror = () => done(false);
      video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
      setTimeout(() => done(false), 2500);
    });
    if (!seeked) continue;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push({ time, uri: canvas.toDataURL('image/jpeg', 0.7) });
    } catch {
      // A cross-origin video taints the canvas; leave that frame out.
    }
  }
  return out;
}
