import { Linking, Platform, TurboModuleRegistry, type View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { mixHex } from '@/features/activity/zones';
import { colors, pageIsDark } from '@/theme';
import { FACEBOOK_APP_ID, STORIES_URL } from './storyImage';

/*
 * A clip or photo post of your own, straight into Instagram's story editor
 * (build 15 extras, Oct 5): the post's original file as the story's
 * background, a video for a clip and a picture for a photo, with a small
 * CourtSide sticker on it (the mark, "@handle", "on CourtSide";
 * HandleSticker) that can be moved, resized or deleted there. The session
 * Share page does the same for a session's picture (storyImage.ts); this
 * is the post's own media.
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

/**
 * Into Instagram: 'sent', or 'no-instagram' when the phone has none (the
 * builds that carry react-native-share can ask truthfully: iPhone's
 * LSApplicationQueriesSchemes and Android's <queries>, see storyImage.ts),
 * or 'unavailable' when the hand-over failed.
 */
async function toInstagram(uri: string, kind: StoryMediaKind, sticker?: string): Promise<'sent' | 'no-instagram' | 'unavailable'> {
  if (!canShareMediaStory()) return 'unavailable';
  try {
    const Share_ = (require('react-native-share') as typeof import('react-native-share')).default;
    if (Platform.OS === 'android') {
      const { isInstalled } = await Share_.isPackageInstalled('com.instagram.android');
      if (!isInstalled) return 'no-instagram';
    } else if (!(await Linking.canOpenURL(STORIES_URL).catch(() => false))) {
      return 'no-instagram';
    }
    // Round a photo that is not 9:16, Instagram fills with these two (left
    // out, react-native-share sends its own purple): the court's darkest
    // colour, faintly tinted with the court at the top, as the session's
    // Overlay design uses.
    const deep = (pageIsDark() ? colors.bg : colors.text).slice(0, 7);
    await Share_.shareSingle({
      social: 'instagramstories' as never,
      appId: FACEBOOK_APP_ID,
      ...(Platform.OS === 'android' ? { useInternalStorage: true } : {}),
      ...(kind === 'video' ? { backgroundVideo: uri } : { backgroundImage: uri }),
      ...(sticker ? { stickerImage: `data:image/png;base64,${sticker}` } : {}),
      backgroundTopColor: mixHex(deep, colors.court.slice(0, 7), 0.15),
      backgroundBottomColor: deep,
    } as never);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

/**
 * Share to Instagram Story, from a post's ••• menu. `sticker` is the
 * out-of-sight HandleSticker, photographed first (a story without it is
 * still sent if that fails). Says nothing back once Instagram (or the
 * share sheet) has opened; a sentence when it could not.
 */
export async function shareMediaToStory({ url, kind, id, sticker }: { url: string; kind: StoryMediaKind; id: string; sticker: View | null }): Promise<string | null> {
  let stickerPng: string | undefined;
  try {
    if (sticker) stickerPng = await captureRef(sticker, { format: 'png', quality: 1, result: 'base64' });
  } catch {
    // Without the sticker: the clip or photo alone.
  }
  const file = await onThisPhone(url, id, kind);
  if ((await toInstagram(file.uri, kind, stickerPng)) === 'sent') return null;
  // No Instagram, or a hand-over that failed: the share sheet, with the file.
  if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
  await Sharing.shareAsync(file.uri, { mimeType: TYPES[file.ext], dialogTitle: 'Share to Instagram Stories' });
  return null;
}
