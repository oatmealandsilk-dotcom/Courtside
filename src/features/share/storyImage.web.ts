import type { View } from 'react-native';

/*
 * The browser twin of storyImage.ts: the hidden copy (360 × 640 on the page)
 * drawn onto a canvas three times over, 1080 × 1920, then shared as a file
 * where the browser can (phones), or saved to downloads where it cannot.
 */

export const STORY_PX = { width: 1080, height: 1920 };

export function stageSize(): { width: number; height: number } {
  return { width: 360, height: 640 };
}

let drawing: Promise<typeof import('html2canvas')> | null = null;
const loadDrawing = () => (drawing ??= import('html2canvas').catch((error) => { drawing = null; throw error; }));
/** The drawing kit comes down as the page opens, so the first tap is quick. */
export function warmStory() { void loadDrawing().catch(() => undefined); }

/** A browser always saves to its downloads. */
export function canSaveStory(): boolean { return true; }

export type StoryAction = 'instagram' | 'save' | 'more' | 'copy';

/** What Copy says once the picture is on the clipboard: Instagram pastes it as a sticker. */
export const COPIED_NOTE = 'Copied. In Instagram, open your story, tap and hold, then Paste.';

/** The picture as a PNG file, ready to share or save. Exported for the demo's own check. */
export async function storyBlob(view: View | null): Promise<Blob | string> {
  const node = view as unknown as HTMLElement | null;
  if (!node || !node.offsetWidth) return 'The picture is not ready yet. Try again in a moment.';
  if (document.fonts?.ready) await document.fonts.ready;
  let html2canvas: (typeof import('html2canvas'))['default'];
  try { ({ default: html2canvas } = await loadDrawing()); } catch { return 'The picture could not be made. Refresh the page, then try again.'; }
  const canvas = await html2canvas(node, {
    useCORS: true,
    backgroundColor: null,
    logging: false,
    scale: STORY_PX.width / node.offsetWidth,
    width: node.offsetWidth,
    height: node.offsetHeight,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ?? 'The picture could not be made. Try again.';
}

function download(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

export async function exportStory(view: View | null, action: StoryAction, title: string): Promise<string | null> {
  const made = await storyBlob(view);
  if (typeof made === 'string') return made;
  if (action === 'copy') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': made })]);
      return COPIED_NOTE;
    } catch {
      // A browser without picture copying: the file instead.
    }
  }
  const name = 'courtside-story.png';
  const file = new File([made], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (action !== 'save' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  download(made, name);
  return action === 'instagram'
    ? `Saved to your downloads as ${name}. Add it to your story from Instagram.`
    : `Saved to your downloads as ${name}.`;
}
