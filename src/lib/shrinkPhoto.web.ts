/** The long edge a posted photo is kept at: what Instagram serves, sharp on any screen. */
export const PHOTO_EDGE = 1440;

/**
 * The browser twin: draws the photo onto a canvas no larger than 1440 on
 * its long edge and hands back a JPEG blob address. Anything that goes
 * wrong (an odd format, a tainted canvas) returns the original untouched.
 */
export async function shrinkPhoto(uri: string, edge = PHOTO_EDGE, quality = 0.82): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = uri;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (!long) return uri;
    const scale = Math.min(1, edge / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return uri;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? URL.createObjectURL(blob) : uri;
  } catch {
    return uri;
  }
}
