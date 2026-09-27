import html2canvas from 'html2canvas';
import type { View } from 'react-native';

/**
 * The browser twin: the card drawn onto a canvas at 1080 × 1920, then shared
 * as an image where the browser can (phones), or saved as a file where it
 * cannot (most computers). Says what happened when it was a download.
 */
export async function shareCard(view: View | null, title: string): Promise<string | null> {
  const node = view as unknown as HTMLElement | null;
  if (!node || !node.offsetWidth) return 'The card is not ready yet. Try again in a moment.';
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await html2canvas(node, { useCORS: true, backgroundColor: null, logging: false, scale: 1080 / node.offsetWidth });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return 'The image could not be made. Try again.';
  const file = new File([blob], 'courtside.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'courtside.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  return 'Saved to your downloads as courtside.png.';
}
