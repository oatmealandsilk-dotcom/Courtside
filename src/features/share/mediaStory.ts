import { Linking, Platform, TurboModuleRegistry, type View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { FACEBOOK_APP_ID, STORIES_URL, STORY_PX, stageSize } from './storyImage';
import { storyFill } from './storyOverlay';

/*
 * A clip or photo post of your own, straight into Instagram's story editor
 * (build 15 extras, Oct 5), with the CourtSide overlay on it (StoryOverlay:
 * the mark beside "@handle" over "on CourtSide", never a session's numbers)
 * low on the left, clear of Instagram's own buttons. The
 * session Share page does the same for a session's picture (storyImage.ts);
 * this is the post's own media.
 *
 * Where the overlay lands (Oct 5, owner: "Can't be in the middle of the
 * screen"). Instagram's Sharing to Stories takes a background and a sticker,
 * and nothing that says where the sticker goes: it puts it in the middle
 * (Meta's only guidance is a 640 × 480 sticker, which the person can then
 * move or resize). So:
 *
 * - A clip goes as the background video, and the sticker is a see-through
 *   picture the size of the story itself (1080 × 1920) with the overlay
 *   drawn low on the left. Laid over the story it lines up with it, so the
 *   overlay sits where it was drawn; shown smaller, it still lands in the
 *   lower left, not the middle. It stays a sticker: moved, pinched or
 *   deleted in Instagram like any other.
 * - A photo has the overlay drawn onto it here, and goes as the background
 *   picture with no sticker at all: exactly where it was drawn. Should that
 *   picture not come out (the photo would not load), the photo goes as it
 *   is with the see-through sticker, as a clip does.
 *
 * Only where the phone's build carries react-native-share (iPhone build 13
 * on, Android from its first build), so it is safe as an instant update:
 * elsewhere the menu does not offer it. A browser never does
 * (mediaStory.web.ts). No Instagram on the phone: the share sheet opens
 * with the file instead, where any app can take it.
 *
 * What Instagram gets is the file as it was uploaded: a trim, a speed, a
 * zoom or "posted without sound" are applied by CourtSide's player when
 * the clip plays, not cut into the file, so they do not come along
 * (Instagram's own editor can trim and mute).
 */

export type StoryMediaKind = 'video' | 'photo';

/** Whether this build can hand a file to Instagram's story editor. */
export function canShareMediaStory(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && !!TurboModuleRegistry.get('RNShare');
}

/** Said when the post's file is still only on this phone, on its way up. */
const STILL_UPLOADING = 'Your post is still uploading. Try again once it is up.';

const TYPES: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
};

/**
 * The post's file on this phone: a post still uploading already is one;
 * anything else comes down into the app's own cache (one file at a time:
 * the last one's folder is emptied first), the one place Android's
 * Instagram can be handed a link to (react-native-share's cache-path).
 */
async function onThisPhone(url: string, id: string, kind: StoryMediaKind): Promise<{ uri: string; ext: string }> {
  const fallback = kind === 'video' ? 'mp4' : 'jpg';
  const ext = (url.split('?')[0].match(/\.(mp4|mov|m4v|jpe?g|png|webp|heic)$/i)?.[1] ?? fallback).toLowerCase();
  if (url.startsWith('file:')) return { uri: url, ext };
  if (!/^https?:/i.test(url)) throw new Error(STILL_UPLOADING);
  const dir = new Directory(Paths.cache, 'stories');
  try { if (dir.exists) dir.delete(); } catch { /* an old file still held: written over below */ }
  if (!dir.exists) dir.create();
  const target = new File(dir, `courtside-${id.slice(0, 8)}.${ext}`);
  try {
    const file = await File.downloadFileAsync(url, target, { idempotent: true });
    return { uri: file.uri, ext };
  } catch {
    throw new Error(kind === 'video' ? 'The clip could not be downloaded. Check your connection and try again.' : 'The photo could not be downloaded. Check your connection and try again.');
  }
}

/** What Instagram is handed: the story's background (a clip, or a picture) and, for a clip, the overlay as a sticker. */
type StoryAssets = { backgroundVideo?: string; backgroundImage?: string; stickerImage?: string };

/**
 * The overlay's picture, as base64: the see-through sticker as a PNG (it has to
 * stay see-through), a photo with the overlay on it as a JPEG. At exactly
 * Instagram's 1080 × 1920, as the session pictures are (storyImage.ts).
 * Nothing when there is no picture to take or it could not be taken.
 *
 * The photo on an iPhone is drawn layer by layer (useRenderInContext) rather
 * than as it shows on screen: its hidden copy is taller than the menu that
 * hides it (and, on a smaller iPhone, than the screen), and an on-screen
 * snapshot could leave the part the menu cuts off blank. The sticker keeps
 * the on-screen snapshot the session Share page uses: its overlay sits in
 * the part on screen, and the rest is see-through either way.
 */
async function photograph(view: View | null, format: 'png' | 'jpg'): Promise<string | undefined> {
  if (!view) return undefined;
  try {
    const size = Platform.OS === 'android' ? STORY_PX : stageSize();
    const whole = Platform.OS === 'ios' && format === 'jpg' ? { useRenderInContext: true } : {};
    return await captureRef(view, { format, quality: format === 'jpg' ? 0.92 : 1, result: 'base64', ...size, ...whole });
  } catch {
    return undefined;
  }
}

/**
 * Into Instagram: 'sent', or 'no-instagram' when the phone has none (the
 * builds that carry react-native-share can ask truthfully: iPhone's
 * LSApplicationQueriesSchemes and Android's <queries>, see storyImage.ts),
 * or 'unavailable' when the hand-over failed, or 'cancelled' when the menu
 * was closed before the hand-over.
 */
async function toInstagram(assets: StoryAssets, cancelled: () => boolean): Promise<'sent' | 'no-instagram' | 'unavailable' | 'cancelled'> {
  if (!canShareMediaStory()) return 'unavailable';
  try {
    const Share_ = (require('react-native-share') as typeof import('react-native-share')).default;
    if (Platform.OS === 'android') {
      const { isInstalled } = await Share_.isPackageInstalled('com.instagram.android');
      if (!isInstalled) return 'no-instagram';
    } else if (!(await Linking.canOpenURL(STORIES_URL).catch(() => false))) {
      return 'no-instagram';
    }
    if (cancelled()) return 'cancelled';
    // Round a clip or photo that is not 9:16, Instagram fills with these two
    // (left out, react-native-share sends its own purple): the court's
    // darkest colour, faintly tinted with the court at the top (storyFill).
    const fill = storyFill();
    await Share_.shareSingle({
      social: 'instagramstories' as never,
      appId: FACEBOOK_APP_ID,
      ...(Platform.OS === 'android' ? { useInternalStorage: true } : {}),
      ...assets,
      backgroundTopColor: fill.top,
      backgroundBottomColor: fill.bottom,
    } as never);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

/**
 * Share to Instagram Story, from a post's ••• menu. Says nothing back once
 * Instagram (or the share sheet) has opened; a sentence when it could not.
 *
 * `sticker` is the out-of-sight see-through canvas with the overlay on it
 * (StoryOverlayCanvas), photographed for a clip (a story without it is
 * still sent if that fails). `bake`, for a photo, draws the photo with the
 * overlay on it out of sight and answers once the photo is there (null when
 * it would not load); that picture goes as the whole story.
 *
 * `cancelled`: true once the menu has been closed while the file was still
 * coming down. Then nothing opens: Instagram arriving on its own a moment
 * after you closed the menu would be a surprise. Asked again just before
 * each hand-over.
 */
export async function shareMediaToStory({ url, kind, id, sticker, bake, cancelled = () => false }: {
  url: string;
  kind: StoryMediaKind;
  id: string;
  sticker: View | null;
  bake?: () => Promise<View | null>;
  cancelled?: () => boolean;
}): Promise<string | null> {
  let sent: Awaited<ReturnType<typeof toInstagram>> | undefined;
  let file: { uri: string; ext: string } | undefined;
  // A photo: the overlay drawn onto it, handed over as the story's one picture.
  if (kind === 'photo' && bake) {
    const baked = await photograph(await bake(), 'jpg');
    if (cancelled()) return null;
    if (baked) sent = await toInstagram({ backgroundImage: `data:image/jpeg;base64,${baked}` }, cancelled);
  }
  // A clip, or a photo that could not be drawn or handed over drawn: the file as uploaded,
  // the overlay as a story-sized sticker.
  if (!sent || sent === 'unavailable') {
    const stickerPng = await photograph(sticker, 'png');
    if (cancelled()) return null;
    file = await onThisPhone(url, id, kind);
    if (cancelled()) return null;
    sent = await toInstagram({
      ...(kind === 'video' ? { backgroundVideo: file.uri } : { backgroundImage: file.uri }),
      ...(stickerPng ? { stickerImage: `data:image/png;base64,${stickerPng}` } : {}),
    }, cancelled);
  }
  if (sent === 'sent' || sent === 'cancelled') return null;
  // No Instagram, or a hand-over that failed: the share sheet, with the file.
  if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
  if (cancelled()) return null;
  file = file ?? await onThisPhone(url, id, kind);
  if (cancelled()) return null;
  await Sharing.shareAsync(file.uri, { mimeType: TYPES[file.ext], dialogTitle: 'Share to Instagram Stories' });
  return null;
}
