import type { View } from 'react-native';

/**
 * The drawing library, fetched when a card page opens rather than with the
 * app: it is a sixth of a megabyte nobody needs to open CourtSide. By the
 * time Share is tapped it is in, so the share sheet still opens at once.
 */
let drawing: Promise<typeof import('html2canvas')> | null = null;
const loadDrawing = () => (drawing ??= import('html2canvas').catch((error) => { drawing = null; throw error; }));
export function warmShareCard() { void loadDrawing().catch(() => undefined); }

/**
 * The browser twin: the card drawn onto a canvas at 1080 × 1920, then shared
 * as an image where the browser can (phones), or saved as a file where it
 * cannot (most computers). Says what happened when it was a download.
 */
export async function shareCard(view: View | null, title: string): Promise<string | null> {
  const node = view as unknown as HTMLElement | null;
  if (!node || !node.offsetWidth) return 'The card is not ready yet. Try again in a moment.';
  if (document.fonts?.ready) await document.fonts.ready;
  // The drawing library is its own file. A tab left open across an update
  // asks for the old one, which is gone (and a dropped connection fails the
  // same way): a plain way out, not the loader's error text under the button.
  let html2canvas: (typeof import('html2canvas'))['default'];
  try { ({ default: html2canvas } = await loadDrawing()); } catch { return 'The card could not be made. Refresh the page, then try again.'; }
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
