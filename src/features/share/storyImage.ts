import { Linking, PixelRatio, Platform, Share, TurboModuleRegistry, type View } from 'react-native';
import Constants from 'expo-constants';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

/*
 * A session's share picture (Share → Instagram) made into a file and handed
 * on. The picture is drawn once more, out of sight, at exactly Instagram
 * Stories' 1080 × 1920 pixels on this screen (stageSize), and photographed
 * from that copy rather than from the small preview, so the words stay sharp.
 *
 * "Instagram Stories" hands the picture straight to Instagram's story editor
 * on an iPhone build that carries react-native-share, and on Android (from
 * its first build, Oct 5; see straightToStories and docs/instagram-stories.md).
 * Elsewhere: older iPhone builds put it on the clipboard and open Instagram's
 * story camera, and a phone with no Instagram opens the share sheet, where
 * Instagram is one of the apps.
 *
 * Sharper (Oct 16, owner: "the courtside overlays are kinda blurry,
 * pixelated, make it super high quality"). A see-through design (the
 * Overlay, Heart rate, the Sticker, the Clear Card) goes into a story as
 * Instagram's sticker: the whole 1080 × 1920 story, nearly all of it empty,
 * so Instagram shrinks it to fit, and pinched back up the numbers were only
 * about 700 real pixels across, blurry. Now the share screen draws that
 * story a second time, out of sight and twice as big (stickerDensity), and
 * that is the sticker (or what Copy puts on the clipboard): the very same
 * picture, framed exactly as before, so Instagram drops it in at the size
 * and spot it always has (Oct 17: the art alone would have opened bigger and
 * centred, not the look the owner kept), only with twice the pixels, about
 * 1400 across the numbers, as a see-through PNG. Whole pictures (Photo, a
 * filled Card, Save, More) stay the whole story at exactly 1080 × 1920.
 */

export const STORY_PX = { width: 1080, height: 1920 };

/** The hidden copy's size in the page's own units: 1080 × 1920 pixels on this screen. */
export function stageSize(): { width: number; height: number } {
  const r = PixelRatio.get();
  return { width: STORY_PX.width / r, height: STORY_PX.height / r };
}

/**
 * How many times finer than the story a see-through sticker is drawn (see
 * above): twice (2160 × 3840) for art that sits in the middle of the story,
 * half again for the Clear Card, which fills most of it (1620 × 2880, a
 * smaller file for a picture with that much in it).
 */
export function stickerDensity(fillsStory: boolean): number {
  return fillsStory ? 1.5 : 2;
}

/**
 * Whether the sticker is drawn a second time, bigger, out of sight (a
 * phone: it photographs a view at the screen's own pixels), or photographed
 * from the one hidden copy at a finer scale (the browser's drawing kit can).
 */
export const STICKER_COPY = true;

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

/**
 * "Copy" puts the picture on the clipboard for Instagram's paste-a-sticker,
 * which is how an iPhone's Instagram takes it. Android's Instagram has no such
 * paste, and Stories there goes straight into the story editor, so Android
 * leaves Copy out.
 */
export function canCopyStory(): boolean {
  return Platform.OS !== 'android';
}

/**
 * Said once Instagram has opened with the picture ready to paste. The share
 * pages keep it on a line under their buttons (ShareActions' steps) rather
 * than in a toast: by the time it is said, Instagram is in front.
 */
export const INSTAGRAM_NOTE = 'In Instagram, pick a photo or video, then tap Add sticker (or hold and tap Paste).';

/**
 * What Copy says once the picture is on the clipboard: short, the way a
 * toast says it. A sticker (or the see-through overlay) is pasted into a
 * story; a whole picture (a card, a photo) can go anywhere.
 */
export const COPIED_NOTE = 'Copied.';
export const COPIED_STICKER_NOTE = 'Copied. Paste it into your story.';

/** Whether something exportStory said is news that it went (Copied, Saved, the Instagram steps), not a reason it could not. */
export function storyNoteOk(said: string): boolean {
  return said.startsWith('Copied') || said.startsWith('Saved') || said === INSTAGRAM_NOTE;
}

/** CourtSide's app at Meta (Oct 4): Instagram's own "Share to Stories" handoff needs it. Public, not a secret. Also used by mediaStory.ts. */
export const FACEBOOK_APP_ID = '1407829631564079';

/** The address Instagram's story editor answers to (react-native-share opens it with ?source_application=FACEBOOK_APP_ID). */
export const STORIES_URL = 'instagram-stories://share';

/**
 * Where the picture went: into Instagram ('sent'), nowhere because this phone
 * has no Instagram ('no-instagram'), or not tried because this build cannot
 * ('unavailable': no react-native-share, or the hand-over failed).
 */
type Handoff = 'sent' | 'no-instagram' | 'unavailable';

/**
 * Strava's way (build 13 on): Instagram opens on its story editor with the
 * picture already there, a sticker over two colours or a whole background.
 * Only where the phone's app carries react-native-share; on older builds it
 * is never loaded (loading it there would close the app).
 *
 * react-native-share puts the picture on the pasteboard and opens Instagram
 * without first asking whether Instagram is there, and says "done" either
 * way, so a phone without Instagram used to tap Stories and see nothing
 * happen (Oct 4 audit). The builds that carry it also list instagram-stories
 * in LSApplicationQueriesSchemes (app.config.js), so the phone answers the
 * question truthfully here.
 */
async function straightToStories(b64: string, look: StoryLook): Promise<Handoff> {
  if (Platform.OS === 'android') return androidToStories(b64, look);
  if (Platform.OS !== 'ios' || !TurboModuleRegistry.get('RNShare')) return 'unavailable';
  try {
    if (!(await Linking.canOpenURL(STORIES_URL))) return 'no-instagram';
  } catch {
    return 'no-instagram';
  }
  try {
    const Share_ = (require('react-native-share') as typeof import('react-native-share')).default;
    const image = `data:image/png;base64,${b64}`;
    await Share_.shareSingle({
      social: 'instagramstories' as never,
      appId: FACEBOOK_APP_ID,
      ...(look.sticker ? { stickerImage: image, backgroundTopColor: look.top, backgroundBottomColor: look.bottom } : { backgroundImage: image }),
    } as never);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

/**
 * Android (Oct 5): the same hand-over, through Instagram's "add to story"
 * screen. Android only lets the app ask whether Instagram is installed
 * because the app names it in its manifest (plugins/withInstagramQueries.js);
 * without that the answer was always no. The picture is written to the app's
 * own private cache (useInternalStorage), the one place react-native-share
 * can hand Instagram a link to; its default spot gave Instagram nothing.
 */
async function androidToStories(b64: string, look: StoryLook): Promise<Handoff> {
  if (!TurboModuleRegistry.get('RNShare')) return 'unavailable';
  try {
    const Share_ = (require('react-native-share') as typeof import('react-native-share')).default;
    const { isInstalled } = await Share_.isPackageInstalled('com.instagram.android');
    if (!isInstalled) return 'no-instagram';
    const image = `data:image/png;base64,${b64}`;
    await Share_.shareSingle({
      social: 'instagramstories' as never,
      appId: FACEBOOK_APP_ID,
      useInternalStorage: true,
      ...(look.sticker ? { stickerImage: image, backgroundTopColor: look.top, backgroundBottomColor: look.bottom } : { backgroundImage: image }),
    } as never);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

/** How the picture goes into a story: as a sticker over two colours, or as the whole background. */
export interface StoryLook { sticker: boolean; top: string; bottom: string }

/** A see-through design's whole story drawn `density` times bigger (share-session's second copy): what Instagram gets as the sticker. */
export interface StorySticker { view: View | null; density: number }

/**
 * The whole story, as a PNG: exactly 1080 × 1920. An iPhone counts in points
 * (the hidden copy is 1080 pixels wide on its screen, stageSize); Android
 * takes the copy at its own size, which is already 1080 × 1920 pixels, rather
 * than being asked for them, which made it resize the whole picture whenever
 * the screen's rounding left it a pixel out.
 */
function wholeStory<R extends 'base64' | 'tmpfile'>(view: View, result: R) {
  return captureRef(view, { format: 'png', quality: 1, result, ...(Platform.OS === 'android' ? {} : stageSize()) });
}

/**
 * The sticker, as a see-through PNG at its own size (points times the
 * screen's pixels on an iPhone, pixels on Android: 1080 × 1920 times its
 * density either way), never asked for a size, so never stretched. An
 * iPhone draws it the way it draws today's pictures, as the screen shows
 * them (drawViewHierarchyInRect): the other way (renderInContext) leaves out
 * any layer with a mask, which is how the Sticker's drop shadow is drawn
 * (Oct 17). Should the big copy not come out, today's 1080 × 1920 story goes
 * instead, so the share never fails over it.
 */
async function stickerPicture(view: View, whole: View) {
  try {
    return await captureRef(view, { format: 'png', quality: 1, result: 'base64' });
  } catch {
    return wholeStory(whole, 'base64');
  }
}

/** Once the share sheet has closed on an iPhone, the picture's file is let go, so pictures do not pile up in the app's cache. Android's may still be reading it, and its cache is cleared by the phone. */
function letGo(uri: string) {
  if (Platform.OS !== 'ios') return;
  // The phone lets go only of its own temporary files, named by their path.
  try { releaseCapture(uri.replace(/^file:\/\//, '')); } catch { /* already gone */ }
}

/**
 * The hidden copy photographed and handed on. Says nothing back when it went
 * (or the sheet opened); a sentence when it could not, or what to do next.
 *
 * `link` is the sharer's invite link, which goes as words beside the picture
 * and is never drawn on it (Oct 5, Strava's way). More sends it with the
 * picture on an iPhone, so a message or a note gets a link to tap as well.
 * Copy stays the picture alone: a phone's clipboard here holds one thing, and
 * Instagram pastes the picture. Android's More keeps sending the file alone
 * (its share route takes a file and no words), and Stories and Save are the
 * picture alone everywhere.
 */
export async function exportStory(view: View | null, action: StoryAction, title: string, look?: StoryLook, link?: string, sticker?: StorySticker): Promise<string | null> {
  if (!view) return 'The picture is not ready yet. Try again in a moment.';
  // What a story pastes or takes as its sticker: the story drawn bigger, for a see-through design
  // (Oct 16, see the top); today's story for anything else, or should the bigger copy not be there.
  const asSticker = look?.sticker && sticker?.view ? sticker.view : null;
  const forStory = () => (asSticker ? stickerPicture(asSticker, view) : wholeStory(view, 'base64'));
  if (action === 'copy') {
    // On the clipboard as a picture, so a story pastes it as a sticker, the way Strava's overlay goes on.
    const b64 = await forStory();
    await Clipboard.setImageAsync(b64);
    return look?.sticker ? COPIED_STICKER_NOTE : COPIED_NOTE;
  }
  if (action === 'instagram' && Platform.OS === 'android') {
    // Straight into Instagram's story editor (Oct 5). No Instagram, or a hand-over
    // that failed: the share sheet below, where any app can take it.
    const b64 = await forStory();
    if (look && (await straightToStories(b64, look)) === 'sent') return null;
  }
  if (action === 'instagram' && Platform.OS === 'ios') {
    // Straight into Instagram's story editor where the build can (Oct 4). Where it
    // cannot, the picture on the clipboard, then Instagram's story camera, where it pastes.
    const b64 = await forStory();
    const handoff: Handoff = look ? await straightToStories(b64, look) : 'unavailable';
    if (handoff === 'sent') return null;
    // Known to have no Instagram: the share sheet below, with the clipboard left as it was.
    if (handoff === 'unavailable') {
      await Clipboard.setImageAsync(b64);
      try {
        await Linking.openURL('instagram://story-camera');
        return INSTAGRAM_NOTE;
      } catch {
        // No Instagram on this phone: the share sheet below.
      }
    }
  }
  const uri = await wholeStory(view, 'tmpfile');
  try {
    if (action === 'save') {
      // The plain share sheet, which carries Save Image from build 11 (see canSaveStory).
      await Share.share({ url: uri });
      return null;
    }
    if (action === 'more' && link && Platform.OS === 'ios') {
      // The picture and the link together: the plain share sheet takes both, as Save above uses it.
      await Share.share({ url: uri, message: link });
      return null;
    }
    if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: action === 'instagram' ? 'Share to Instagram Stories' : title });
    return null;
  } finally {
    letGo(uri);
  }
}
