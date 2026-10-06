import type { View } from 'react-native';

import { isDesktopBrowser } from '@/lib/browserDevice';

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

/** Copy works in a browser too (a browser that cannot copy pictures saves the file instead). */
export function canCopyStory(): boolean { return true; }

export type StoryAction = 'instagram' | 'save' | 'more' | 'copy';

/**
 * Instagram's steps after a clipboard hand-over: an iPhone build's (see
 * storyImage.ts). Never said in a browser, which has no hand-over; named here
 * too so the share pages read one name on both.
 */
export const INSTAGRAM_NOTE = 'In Instagram, pick a photo or video, then tap Add sticker (or hold and tap Paste).';

/**
 * What Copy says once the picture is on the clipboard, short, the way a toast
 * says it. On a phone's browser a sticker (or the overlay) is pasted into a
 * story; a computer has no story to paste into, so there it is just "Copied."
 */
export const COPIED_NOTE = 'Copied.';
export const COPIED_STICKER_NOTE = 'Copied. Paste it into your story.';

/** Whether something exportStory said is news that it went (Copied, Saved), not a reason it could not. */
export function storyNoteOk(said: string): boolean {
  return said.startsWith('Copied') || said.startsWith('Saved');
}

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

/** How the picture goes into a story (phones only; the browser shares a file). */
export interface StoryLook { sticker: boolean; top: string; bottom: string }

/**
 * `link` is the sharer's invite link, as words beside the picture and never
 * on it (Oct 5, Strava's way). Copy puts the picture and the link on the
 * clipboard together where the browser takes both (pasted into a story it is
 * the picture, into a message the link), else the picture alone. More sends
 * the link as the share's text with the file, where the browser shares both.
 * Stories and Save are the picture alone.
 */
export async function exportStory(view: View | null, action: StoryAction, title: string, look?: StoryLook, link?: string): Promise<string | null> {
  const made = await storyBlob(view);
  if (typeof made === 'string') return made;
  if (action === 'copy') {
    const picture = { 'image/png': made };
    const tries: Record<string, Blob>[] = link ? [{ ...picture, 'text/plain': new Blob([link], { type: 'text/plain' }) }, picture] : [picture];
    for (const items of tries) {
      try {
        await navigator.clipboard.write([new ClipboardItem(items)]);
        return look?.sticker && !isDesktopBrowser() ? COPIED_STICKER_NOTE : COPIED_NOTE;
      } catch {
        // Not both at once in this browser: the picture alone, then the file.
      }
    }
  }
  const name = 'courtside-story.png';
  const file = new File([made], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  // The link rides along when Copy fell through to here, or More was tapped; only where the browser shares both.
  const withLink: ShareData | null = link && (action === 'more' || action === 'copy') ? { files: [file], title, text: link } : null;
  if (action !== 'save' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share(withLink && nav.canShare(withLink) ? withLink : { files: [file], title });
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
