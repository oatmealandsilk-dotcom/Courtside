import { Linking, PixelRatio, Platform, Share, type View } from 'react-native';
import Constants from 'expo-constants';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

/*
 * A session's share picture (Share → Instagram) made into a file and handed
 * on. The picture is drawn once more, out of sight, at exactly Instagram
 * Stories' 1080 × 1920 pixels on this screen (stageSize), and photographed
 * from that copy rather than from the small preview, so the words stay sharp.
 *
 * Instagram's own "straight into Stories" handover needs a small piece of
 * native code the app does not have yet (see docs/instagram-stories.md), so
 * "Instagram Stories" opens the phone's share sheet with the picture, where
 * Instagram is one of the apps; it offers Stories, Feed and Messages.
 */

export const STORY_PX = { width: 1080, height: 1920 };

/** The hidden copy's size in the page's own units: 1080 × 1920 pixels on this screen. */
export function stageSize(): { width: number; height: number } {
  const r = PixelRatio.get();
  return { width: STORY_PX.width / r, height: STORY_PX.height / r };
}

/** The browser fetches its drawing kit ahead; a phone has it built in. */
export function warmStory() {}

/**
 * "Save image" puts the picture straight into Photos, the way a chat photo
 * is saved: iPhone allows it only once the app carries the line asking to
 * add to the photo library, which builds from 11 on do. On older builds (and
 * Android) the button is left out rather than closing the app.
 */
export function canSaveStory(): boolean {
  return Platform.OS === 'ios' && Number(Constants.platform?.ios?.buildNumber ?? 0) >= 11;
}

export type StoryAction = 'instagram' | 'save' | 'more' | 'copy';

/** What Copy says once the picture is on the clipboard: Instagram pastes it as a sticker. */
/** Said once Instagram has opened with the picture ready to paste. */
export const INSTAGRAM_NOTE = 'In Instagram, tap and hold your story, then Paste.';

export const COPIED_NOTE = 'Copied. In Instagram, open your story, tap and hold, then Paste.';

/**
 * The hidden copy photographed and handed on. Says nothing back when the
 * sheet opened; a sentence when it could not.
 */
export async function exportStory(view: View | null, action: StoryAction, title: string): Promise<string | null> {
  if (!view) return 'The picture is not ready yet. Try again in a moment.';
  const size = Platform.OS === 'android' ? STORY_PX : stageSize();
  if (action === 'copy') {
    // On the clipboard as a picture, so a story pastes it as a sticker, the way Strava's overlay goes on.
    const b64 = await captureRef(view, { format: 'png', quality: 1, result: 'base64', ...size });
    await Clipboard.setImageAsync(b64);
    return COPIED_NOTE;
  }
  if (action === 'instagram' && Platform.OS === 'ios') {
    // Straight into Instagram (Oct 4): the picture on the clipboard, then its
    // story camera, where it pastes. Build 12 hands it over with no paste.
    const b64 = await captureRef(view, { format: 'png', quality: 1, result: 'base64', ...size });
    await Clipboard.setImageAsync(b64);
    try {
      await Linking.openURL('instagram://story-camera');
      return INSTAGRAM_NOTE;
    } catch {
      // No Instagram on this phone: the share sheet below.
    }
  }
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', ...size });
  if (action === 'save') {
    // The plain share sheet, which carries Save Image from build 11 (see canSaveStory).
    await Share.share({ url: uri });
    return null;
  }
  if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: action === 'instagram' ? 'Share to Instagram Stories' : title });
  return null;
}
