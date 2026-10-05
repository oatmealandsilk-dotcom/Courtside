import { useTheme } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ZoomableMedia } from './ZoomableMedia';
import { cropLayer } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { ClipVideo } from '@/components/ClipVideo';
import { framesAt } from '@/features/compose/frames';
import { CoverPage } from '@/components/CoverPage';
import { colors, font } from '@/theme';
import { canShrinkVideo } from '@/lib/shrinkVideo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLightStatusWhile } from '@/lib/statusBarStyle';

export interface PickedMedia {
  uri?: string;
  label: string;
  kind: 'photo' | 'video';
  /** Cover frame. Defaults to the first frame of a video, or the photo itself. */
  thumbnailUrl?: string;
  /** Read from the file's own dimensions when the picker can tell. */
  orientation?: 'portrait' | 'landscape';
}
export interface MediaPickerProps {
  compact?: boolean;
  selection?: 'video' | 'photo' | 'all';
  label?: string;
  value: PickedMedia | null;
  onChange: (next: PickedMedia | null) => void;
  /**
   * Show the chosen media as one full-width stage with no replace or remove
   * controls — for a composer that has its own way back to the library.
   */
  bare?: boolean;
  /** Shape of the bare stage. Defaults to portrait. */
  orientation?: 'portrait' | 'landscape';
  /** Width over height of the portrait stage: 4:5 for a post, 9:16 (the default) for a clip. */
  portraitRatio?: number;
  /** What the edit step decided: the previews play only the part kept, and honour the sound choice. */
  trim?: { trimStart?: number; trimEnd?: number; muted?: boolean; crop?: MediaCrop; speed?: number; volume?: number; coverAt?: number };
  /** No cover-picking controls — for places where the video is just evidence, not a post. */
  noCover?: boolean;
  /**
   * The moment the cover was taken from, once Done is tapped on the Cover
   * page (left out for an uploaded photo), so the editor's own Cover tool
   * reopens on the same frame.
   */
  onCoverAt?: (seconds: number | undefined) => void;
}
/** "clip-final-2 · 0:24" is a filename. "Video · 0:24" is information. */
function describe(media: PickedMedia): string {
  const duration = media.label.match(/\d+:\d{2}$/)?.[0];
  if (media.kind === 'video') return duration ? `Video · ${duration}` : 'Video';
  return 'Photo';
}

/**
 * Android (Oct 5) always uses its own Photo Picker, the gallery grid, which
 * hands over only what was chosen and needs no permission (Google Play's copy
 * of it reaches older phones too). So nothing is asked for first there: the
 * question did nothing on Android 13 and later, and on older phones a "no"
 * blocked picking altogether. The older picker ("legacy") is an iPhone
 * matter: there it is the one that hands a video over reliably; on Android
 * it was the bare Files browser.
 */
const ANDROID_PICKER = Platform.OS === 'android';

/** Opens the phone's library straight away and resolves with the choice, or null if cancelled. */
export async function pickFromDevice(selection: 'video' | 'photo' | 'all'): Promise<PickedMedia | null> {
  const kinds: ImagePicker.MediaType[] = selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'];
  const perm = ANDROID_PICKER ? null : await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
  if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → CourtSide → Photos.');
  const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
  // One picker, once. A failed pick used to open the library a second time
  // with the other picker, which read as the app losing your choice.
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: Platform.OS === 'ios' && selection !== 'photo' && full, ...AS_IS });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    return {
      uri: asset.uri,
      label: asset.fileName ?? 'Selected media',
      kind: isVideo ? 'video' : 'photo',
      thumbnailUrl: isVideo ? undefined : asset.uri,
      orientation: asset.width && asset.height && asset.width > asset.height ? 'landscape' : 'portrait',
    };
  } catch (err) {
    throw new Error(explainPickError(err));
  }
}

/** A photo picked for a chat: the file on this phone and its size in pixels. */
export interface PickedPhoto { uri: string; width: number; height: number }

/**
 * Opens the camera roll for photos to send in a chat, up to `limit` at once,
 * numbered in the order they were tapped. Apple's own photo picker runs
 * outside the app and asks no permission: only what you choose is handed
 * over (iOS's way since iOS 14), so there is nothing to allow or refuse.
 * The photos come as JPEG (an iPhone's HEIC is converted) at full size; they
 * are shrunk just before they go up. Null when nothing was chosen.
 */
export async function pickPhotos(limit: number): Promise<PickedPhoto[] | null> {
  const most = Math.max(1, Math.min(10, limit));
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: most > 1,
      selectionLimit: most,
      orderedSelection: true,
      quality: 1,
      exif: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled || !result.assets.length) return null;
    return result.assets.slice(0, most).map((a) => ({ uri: a.uri, width: a.width || 1, height: a.height || 1 }));
  } catch (err) {
    throw new Error(explainPickError(err));
  }
}

/**
 * Takes one photo with the camera for a chat (the camera button by the
 * message box, Instagram's). Asks for the camera the first time. Null when
 * nothing was taken; 'denied' when the camera is off for CourtSide.
 */
export async function takePhoto(): Promise<PickedPhoto | null | 'denied'> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    if (result.canceled || !result.assets.length) return null;
    const a = result.assets[0];
    return { uri: a.uri, width: a.width || 1, height: a.height || 1 };
  } catch (err) {
    throw new Error(explainPickError(err));
  }
}

/**
 * A picked video is always converted by the iPhone itself to standard
 * H.264 before it is handed over: playable on every phone and browser (the
 * raw file is often HEVC, which some Android phones and browsers cannot
 * play). A video the phone has offloaded to iCloud is fetched automatically
 * when converting. Photos are handed over as they are.
 *
 * The conversion also turns an HDR clip into a normal (SDR) one. iPhones
 * film in HDR by default, and an HDR clip shows black or glitchy in most
 * browsers. Apple's H.264 conversions always produce SDR; handing the raw
 * file to the compressor (see shrinkVideo) did not, because it keeps the
 * clip's HDR colour labels — which is how HDR posts reached the website.
 *
 * In Expo Go the conversion is to 720p: about half the bytes and half the
 * wait, and a minute of it fits under the 50 MB upload cap. The App Store
 * build converts to 1080p and then its own compressor shrinks it while it
 * uploads, the way Instagram does.
 */
const AS_IS = {
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  // Never Passthrough: that hands over the raw file, HDR and all.
  videoExportPreset: canShrinkVideo() ? ImagePicker.VideoExportPreset.H264_1920x1080 : ImagePicker.VideoExportPreset.H264_1280x720,
  shouldDownloadFromNetwork: true,
  // Full screen, not a card: a card leaves the composer showing behind it, so
  // the "Preparing video" note was read once while choosing and again while
  // converting. Covered, it is only ever seen for the conversion it describes.
  presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
};

/** iOS's error codes, in words a person can act on. */
function explainPickError(err: unknown): string {
  const reason = err instanceof Error ? err.message : String(err);
  // Android has no iCloud and no iPhone error numbers: a plain sentence.
  if (Platform.OS === 'android') return /cancel/i.test(reason) ? 'Nothing was chosen.' : 'Your photos could not be opened. Try again in a moment.';
  if (/3164/.test(reason)) return 'That video lives in iCloud and could not be fetched. Check the phone has internet, or open the video once in the Photos app so it downloads, then try again.';
  if (/3072|cancel/i.test(reason)) return 'Nothing was chosen.';
  return `Could not open your library: ${reason}`;
}

export function MediaPicker({ value, onChange, compact, selection = 'all', label, bare = false, orientation = 'portrait', portraitRatio = 9 / 16, trim, noCover = false, onCoverAt }: MediaPickerProps) {
  useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  // The larger preview is dark: light status-bar icons over it.
  const expandedShown = useLightStatusWhile(expanded);
  const insets = useSafeAreaInsets();
  // The Cover page, opened from the Edit cover pill on the preview. It keeps
  // the moment the cover came from, and whether the cover is a photo of
  // your own rather than a frame; ✕ there puts all of it back as it was.
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverAt, setCoverAt] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const remembered = useRef<{ thumb?: string; at: number | null; uploaded: boolean } | null>(null);
  // Each frame cut (or photo chosen) takes a number; a cut that comes back
  // after a later choice, or after ✕, is dropped rather than landing late.
  const captureSeq = useRef(0);
  // The frame being cut right now, if any. Done waits for it (a moment at
  // most), so a Share tapped straight after carries the frame you chose.
  const capture = useRef<Promise<void> | null>(null);
  const keepFrom = Math.max(0, trim?.trimStart ?? 0);
  const keepTo = trim?.trimEnd && trim.trimEnd > keepFrom ? trim.trimEnd : undefined;
  // The cover page opens where the cover came from: its last choice here,
  // else the moment picked in the editor's Cover tool, else the clip's start.
  const coverStart = Math.max(keepFrom, coverAt ?? trim?.coverAt ?? keepFrom);
  const openCover = () => {
    remembered.current = { thumb: value?.thumbnailUrl, at: coverAt, uploaded };
    setCoverOpen(true);
  };
  const settleCover = (seconds: number) => {
    if (!value?.uri) return;
    setCoverAt(seconds);
    setUploaded(false);
    const picked = value;
    const mine = ++captureSeq.current;
    const job: Promise<void> = framesAt(picked.uri!, [seconds], 1080)
      .then((got) => { if (got[0] && mine === captureSeq.current) onChange({ ...picked, thumbnailUrl: got[0].uri }); })
      .catch(() => undefined)
      .finally(() => { if (capture.current === job) capture.current = null; });
    capture.current = job;
  };
  const cancelCover = () => {
    if (!coverOpen) return;
    captureSeq.current += 1;
    const was = remembered.current;
    if (was && value && value.thumbnailUrl !== was.thumb) onChange({ ...value, thumbnailUrl: was.thumb });
    if (was) { setCoverAt(was.at); setUploaded(was.uploaded); }
    setCoverOpen(false);
  };
  const doneCover = () => {
    const seq = captureSeq.current;
    let finished = false;
    const finish = () => {
      // ✕, or a newer choice, since Done was tapped: that one decides instead.
      if (finished || seq !== captureSeq.current) return;
      finished = true;
      setCoverOpen(false);
      const at = uploaded ? undefined : coverAt ?? trim?.coverAt;
      if (at !== trim?.coverAt) onCoverAt?.(at);
    };
    const pending = capture.current;
    if (!pending) { finish(); return; }
    // The chosen frame is still being cut: close once it lands, or after a
    // second and a half regardless, so Done never feels stuck.
    void pending.finally(finish);
    setTimeout(finish, 1500);
  };
  /**
   * Opens the library. Apple's current picker needs no permission prompt and
   * is tried first; if it throws (it does on some phones and inside sheets),
   * the older picker is tried before giving up.
   */
  const open = async (): Promise<ImagePicker.ImagePickerResult> => {
    const kinds: ImagePicker.MediaType[] = selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'];
    // Android asks nothing first: its Photo Picker needs no permission (see pickFromDevice).
    const perm = ANDROID_PICKER ? null : await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → CourtSide → Photos.');
    const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
    // Apple's older picker copies the file itself and has proved the reliable
    // one for video; it needs full photo access, which is why that is checked.
    return ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: Platform.OS === 'ios' && selection !== 'photo' && full, ...AS_IS });
  };
  const choose = async () => {
    try {
      setError('');
      const result = await open();
      if (result.canceled) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      onChange({
        uri: asset.uri,
        label: asset.fileName ?? 'Selected media',
        kind: isVideo ? 'video' : 'photo',
        // A photo is its own cover. Native frame extraction needs
        // expo-video-thumbnails, so a video starts coverless and the poster
        // falls back to the placeholder until one is chosen below.
        thumbnailUrl: isVideo ? undefined : asset.uri,
        orientation: asset.width && asset.height && asset.width > asset.height ? 'landscape' : 'portrait',
      });
    } catch (err) {
      // Limited photo access is the usual cause of iOS's 3164; name the fix. (Android's picker needs no access, so it has no such fix.)
      const perm = ANDROID_PICKER ? null : await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
      if (perm && (perm.accessPrivileges === 'limited' || !perm.granted)) {
        setError('Photo access is limited. On your phone: Settings → CourtSide → Photos → All Photos, then try again.');
        return;
      }
      setError(explainPickError(err));
    }
  };
  const chooseCover = async () => {
    if (!value) return;
    try {
      setError('');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled) return;
      captureSeq.current += 1;
      setUploaded(true);
      onChange({ ...value, thumbnailUrl: result.assets[0].uri });
    } catch { setError('Unable to open your library. Please try again.'); }
  };

  if (bare && value?.uri) {
    // The media is the whole box: the clip playing (or the photo) edge to
    // edge, the Edit cover pill on a video, and nothing else to tap.
    const poster = value.kind === 'photo' ? value.uri : value.thumbnailUrl;
    const withCover = value.kind === 'video' && !noCover;
    // A clip's preview leaves room under it for the caption on a short phone:
    // 480 tall at most, and never more than about half the screen.
    const clipHeight = Math.min(480, Math.round(screenHeight * 0.55));
    return <View style={{ gap: 12 }}>
      {/* The box takes the media's own shape — tall for portrait, wide for
          landscape — with rounded corners on the theme's ground, so there is
          nothing black around it. The media fills it edge to edge. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Open a larger preview" onPress={() => setExpanded(true)}
        style={orientation === 'landscape'
          ? { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }
          : portraitRatio > 0.6
            ? { width: '100%', aspectRatio: portraitRatio, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }
            : { height: clipHeight, aspectRatio: portraitRatio, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        {value.kind === 'video' && value.uri
          // Holds still while the Cover page is up over it.
          ? <View style={cropLayer(trim?.crop)}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active={!coverOpen} muted fit="cover" trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} speed={trim?.speed} volume={trim?.volume} /></View>
          : poster
            ? <Image source={{ uri: poster }} resizeMode="cover" style={{ width: '100%', height: '100%' }}/>
            : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam" size={48} color={colors.textMuted}/></View>}
        {/* Edit cover: a small dark glass pill, centred low on the picture,
            carrying the cover itself so you can see which frame people get
            first. It opens the Cover page and never changes on the picture. */}
        {withCover ? (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit cover" onPress={openCover} hitSlop={6}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingLeft: value.thumbnailUrl ? 5 : 11, paddingRight: 13, paddingVertical: value.thumbnailUrl ? 4 : 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(10,14,20,0.52)', opacity: pressed ? 0.8 : 1, boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.28)' })}>
              {value.thumbnailUrl
                ? <Image source={{ uri: value.thumbnailUrl }} resizeMode="cover" style={{ width: 20, height: 26, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' }} />
                : <Ionicons name="image-outline" size={15} color="white" />}
              <Text numberOfLines={1} style={{ fontSize: 13, ...font('600'), color: 'white' }}>Edit cover</Text>
            </Pressable>
          </View>
        ) : null}
        {/* The larger-preview mark, in the same dark glass, so the only colour on the picture is the picture. */}
        <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 10, width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(10,14,20,0.52)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="expand-outline" size={15} color="white" />
        </View>
      </Pressable>
      {withCover ? (
        <CoverPage
          visible={coverOpen}
          uri={value.uri}
          from={keepFrom}
          to={keepTo}
          start={coverStart}
          photo={uploaded ? value.thumbnailUrl : undefined}
          ratio={orientation === 'landscape' ? 16 / 9 : portraitRatio}
          fit={orientation === 'landscape' ? 'contain' : 'cover'}
          crop={trim?.crop}
          onSettle={settleCover}
          onUpload={() => { void chooseCover(); }}
          onDone={doneCover}
          onCancel={cancelCover}
        />
      ) : null}
      {/* Full screen, the clip playing with sound. One tap anywhere brings it back. */}
      <Modal visible={expandedShown} transparent animationType="none" statusBarTranslucent onRequestClose={() => setExpanded(false)}>
        {/* Its own gesture root: on Android a Modal's pinch and swipe need one (see PostVideo). */}
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <ZoomableMedia onDismiss={() => setExpanded(false)}>
            {value.kind === 'video' && value.uri
              ? <View style={cropLayer(trim?.crop)}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active={expanded} muted={!!trim?.muted} fit={orientation === 'landscape' ? 'contain' : 'cover'} trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} speed={trim?.speed} volume={trim?.volume} /></View>
              : poster ? <Image source={{ uri: poster }} resizeMode="contain" style={{ width: '100%', height: '100%' }}/> : null}
          </ZoomableMedia>
          {/* Under the status bar or the camera cut-out whatever its height, as PostVideo's close button is. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={() => setExpanded(false)} style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
        </GestureHandlerRootView>
      </Modal>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </View>;
  }

  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? 'Choose a photo or video'} onPress={choose}
      style={{ padding: 20, gap: 8, borderRadius: 18, backgroundColor: colors.surface }}>
      {value?.uri && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open a larger preview"
          onPress={() => setExpanded(true)}
          style={{ alignItems: 'center' }}
        >
          <View style={{ width: 240, aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            {/* A photo shows itself; a video shows its cover, because playing
                one in place needs expo-video, which this project does not carry. */}
            {(value.kind === 'photo' ? value.uri : value.thumbnailUrl) ? (
              <Image source={{ uri: value.kind === 'photo' ? value.uri : value.thumbnailUrl }}
                resizeMode="contain" style={{ width: '100%', height: '100%' }}/>
            ) : (
              <Ionicons name="videocam" size={40} color={colors.textFaint}/>
            )}
            {value.kind === 'video' && (
              <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={24} color="white"/>
                </View>
              </View>
            )}
          </View>
          <Text style={{ color: colors.textFaint, fontSize: 12, paddingTop: 8 }}>{describe(value)}</Text>
        </Pressable>
      )}

      <Modal visible={expandedShown} transparent animationType="none" onRequestClose={() => setExpanded(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close preview"
          onPress={() => setExpanded(false)}
          style={{ flex: 1, backgroundColor: 'rgba(6,12,10,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          {value?.uri ? (
            <Image
              source={{ uri: value.kind === 'photo' ? value.uri : value.thumbnailUrl ?? value.uri }}
              resizeMode="contain"
              style={{ width: '100%', height: '80%', borderRadius: 12 }}
            />
          ) : null}
          <Text style={{ color: 'white', paddingTop: 14 }}>
            {value?.kind === 'video' ? 'Cover frame · tap to close' : 'Tap to close'}
          </Text>
        </Pressable>
      </Modal>
      <Ionicons name={selection === 'video' ? 'videocam-outline' : 'images-outline'} size={30} color={colors.textMuted}/>
      <Text style={{ color: colors.text, fontSize: 16, ...font('600') }}>{value ? describe(value) : label ?? (compact ? 'Photo or video' : 'Select a photo or video')}</Text>
      {/* An empty box's title already says what it does; the line under it is only for a filled one. */}
      {value ? <Text style={{ color: colors.textMuted }}>Tap to replace</Text> : null}
    </Pressable>
    {value?.kind === 'video' && !noCover && <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover image" onPress={chooseCover}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {value.thumbnailUrl
        ? <Image source={{ uri: value.thumbnailUrl }} style={{ width: 40, height: 54, borderRadius: 8 }}/>
        : <View style={{ width: 40, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}>
            <Ionicons name="image-outline" size={16} color={colors.textMuted}/>
          </View>}
      <Text style={{ color: colors.info, ...font('600') }}>{value.thumbnailUrl ? 'Change cover' : 'Choose a cover'}</Text>
    </Pressable>}
    {value && <Pressable accessibilityRole="button" onPress={() => onChange(null)}><Text style={{ color: colors.danger }}>Remove media</Text></Pressable>}
    {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
  </View>;
}
