import { useTheme } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ZoomableMedia } from './ZoomableMedia';
import { cropLayer } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { ClipVideo } from '@/components/ClipVideo';
import { framesAt } from '@/features/compose/frames';
import { CoverScrubber } from '@/components/CoverScrubber';
import { VideoSurface, type VideoSurfaceHandle } from '@/components/VideoSurface';
import { colors, typography } from '@/theme';

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
  /** What the edit step decided: the previews play only the part kept, and honour the sound choice. */
  trim?: { trimStart?: number; trimEnd?: number; muted?: boolean; crop?: MediaCrop };
  /** No cover-picking controls — for places where the video is just evidence, not a post. */
  noCover?: boolean;
}
/** "clip-final-2 · 0:24" is a filename. "Video · 0:24" is information. */
function describe(media: PickedMedia): string {
  const duration = media.label.match(/\d+:\d{2}$/)?.[0];
  if (media.kind === 'video') return duration ? `Video · ${duration}` : 'Video';
  return 'Photo';
}

/** Opens the phone's library straight away and resolves with the choice, or null if cancelled. */
export async function pickFromDevice(selection: 'video' | 'photo' | 'all'): Promise<PickedMedia | null> {
  const kinds: ImagePicker.MediaType[] = selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
  if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → Expo Go → Photos.');
  const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
  // One picker, once. A failed pick used to open the library a second time
  // with the other picker, which read as the app losing your choice.
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: selection !== 'photo' && full, ...AS_IS });
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

/**
 * Hand the file over as it is, and fetch it from iCloud when the phone has
 * offloaded it. Passthrough copies the raw file, and in that mode the library
 * only reaches iCloud with the download flag on — off, an offloaded video
 * fails with PHPhotosErrorDomain 3164 ("network access required").
 */
const AS_IS = {
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  shouldDownloadFromNetwork: true,
};

/** iOS's error codes, in words a person can act on. */
function explainPickError(err: unknown): string {
  const reason = err instanceof Error ? err.message : String(err);
  if (/3164/.test(reason)) return 'That video lives in iCloud and could not be fetched. Check the phone has internet, or open the video once in the Photos app so it downloads, then try again.';
  if (/3072|cancel/i.test(reason)) return 'Nothing was chosen.';
  return `Could not open your library: ${reason}`;
}

export function MediaPicker({ value, onChange, compact, selection = 'all', label, bare = false, orientation = 'portrait', trim, noCover = false }: MediaPickerProps) {
  useTheme();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  // The cover chooser under the preview, opened by its Edit cover button: a
  // strip to drag along. While it is open the preview holds still on the
  // moment under the bar; letting go makes that frame the cover.
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverAt, setCoverAt] = useState<number | null>(null);
  const [clipLength, setClipLength] = useState(0);
  const still = useRef<VideoSurfaceHandle>(null);
  const keepFrom = Math.max(0, trim?.trimStart ?? 0);
  const keepTo = trim?.trimEnd && trim.trimEnd > keepFrom ? trim.trimEnd : clipLength;
  const scrubCover = (seconds: number) => { setCoverAt(seconds); still.current?.seek(seconds); };
  const settleCover = (seconds: number) => {
    if (!value?.uri) return;
    const picked = value;
    framesAt(picked.uri!, [seconds], 720).then((got) => { if (got[0]) onChange({ ...picked, thumbnailUrl: got[0].uri }); });
  };
  /**
   * Opens the library. Apple's current picker needs no permission prompt and
   * is tried first; if it throws (it does on some phones and inside sheets),
   * the older picker is tried before giving up.
   */
  const open = async (): Promise<ImagePicker.ImagePickerResult> => {
    const kinds: ImagePicker.MediaType[] = selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'];
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → Expo Go → Photos.');
    const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
    // Apple's older picker copies the file itself and has proved the reliable
    // one for video; it needs full photo access, which is why that is checked.
    return ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: selection !== 'photo' && full, ...AS_IS });
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
      // Limited photo access is the usual cause of iOS's 3164; name the fix.
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
      if (perm && (perm.accessPrivileges === 'limited' || !perm.granted)) {
        setError('Photo access is limited. On your phone: Settings → Expo Go → Photos → All Photos, then try again.');
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
      onChange({ ...value, thumbnailUrl: result.assets[0].uri });
    } catch { setError('Unable to open your library. Please try again.'); }
  };

  if (bare && value?.uri) {
    // The media is the whole box: cover frame (or the photo itself) edge to
    // edge, a play badge for video, and nothing else to tap except the cover.
    const poster = value.kind === 'photo' ? value.uri : value.thumbnailUrl;
    return <View style={{ gap: 12 }}>
      {/* The box takes the media's own shape — tall for portrait, wide for
          landscape — with rounded corners on the theme's ground, so there is
          nothing black around it. The media fills it edge to edge. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Open a larger preview" onPress={() => { if (!coverOpen) setExpanded(true); }}
        style={orientation === 'landscape'
          ? { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }
          : { height: 480, aspectRatio: 9 / 16, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        {value.kind === 'video' && value.uri && coverOpen
          // Choosing a cover: the picture holds on the moment under the bar.
          ? <View style={cropLayer(trim?.crop)}><VideoSurface ref={still} uri={value.uri} muted paused fit="cover" from={keepFrom} onDuration={(d) => { setClipLength(d); still.current?.seek(coverAt ?? keepFrom); }} /></View>
          : value.kind === 'video' && value.uri
          ? <View style={cropLayer(trim?.crop)}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active muted fit="cover" trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} /></View>
          : poster
            ? <Image source={{ uri: poster }} resizeMode="cover" style={{ width: '100%', height: '100%' }}/>
            : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam" size={48} color={colors.textMuted}/></View>}
        {/* Edit cover: a dark see-through pill over the video, like the editor's
            Sound button; CourtSide blue while the cover strip is open. */}
        {value.kind === 'video' && !noCover ? (
          <Pressable accessibilityRole="button" accessibilityLabel={coverOpen ? 'Done choosing a cover' : 'Edit cover'} accessibilityState={{ expanded: coverOpen }} onPress={() => setCoverOpen((o) => !o)} hitSlop={6}
            style={({ pressed }) => ({ position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 11, paddingRight: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: coverOpen ? 'transparent' : 'rgba(255,255,255,0.28)', backgroundColor: coverOpen ? colors.brand : 'rgba(10,14,20,0.55)', opacity: pressed ? 0.85 : 1, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } })}>
            <Ionicons name={coverOpen ? 'checkmark' : 'image-outline'} size={15} color={coverOpen ? colors.brandInk : 'white'} />
            <Text style={{ ...typography.caption, fontWeight: '600', letterSpacing: 0.1, color: coverOpen ? colors.brandInk : 'white' }}>{coverOpen ? 'Done' : 'Edit cover'}</Text>
          </Pressable>
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="expand-outline" size={16} color={colors.brandInk} />
        </View>
      </Pressable>
      {coverOpen && value.kind === 'video' && !noCover ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Cover</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Upload your own cover image" onPress={chooseCover} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.brand }}>
              <Ionicons name="image-outline" size={15} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Upload</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textFaint, fontSize: 13 }}>Drag along the strip to choose the frame people see before it plays.</Text>
          {keepTo > keepFrom
            ? <CoverScrubber uri={value.uri} from={keepFrom} to={keepTo} at={coverAt ?? keepFrom} onScrub={scrubCover} onSettle={settleCover} />
            : <Text style={{ color: colors.textMuted, fontSize: 12, paddingVertical: 18 }}>Reading the clip…</Text>}
        </View>
      ) : null}
      {/* Full screen, the clip playing with sound. One tap anywhere brings it back. */}
      <Modal visible={expanded} transparent animationType="none" statusBarTranslucent onRequestClose={() => setExpanded(false)}>
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          <ZoomableMedia onDismiss={() => setExpanded(false)}>
            {value.kind === 'video' && value.uri
              ? <View style={cropLayer(trim?.crop)}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active={expanded} muted={!!trim?.muted} fit={orientation === 'landscape' ? 'contain' : 'cover'} trimStart={trim?.trimStart} trimEnd={trim?.trimEnd} /></View>
              : poster ? <Image source={{ uri: poster }} resizeMode="contain" style={{ width: '100%', height: '100%' }}/> : null}
          </ZoomableMedia>
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={() => setExpanded(false)} style={{ position: 'absolute', top: 54, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
        </View>
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
              <Ionicons name="videocam" size={40} color="#6B7A6E"/>
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

      <Modal visible={expanded} transparent animationType="none" onRequestClose={() => setExpanded(false)}>
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
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{value ? describe(value) : label ?? (compact ? 'Photo or video' : 'Select a photo or video')}</Text>
      <Text style={{ color: colors.textMuted }}>{value ? 'Tap to replace' : 'Choose from your photos and videos.'}</Text>
    </Pressable>
    {value?.kind === 'video' && !noCover && <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover image" onPress={chooseCover}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {value.thumbnailUrl
        ? <Image source={{ uri: value.thumbnailUrl }} style={{ width: 40, height: 54, borderRadius: 8 }}/>
        : <View style={{ width: 40, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}>
            <Ionicons name="image-outline" size={16} color={colors.textMuted}/>
          </View>}
      <Text style={{ color: colors.info, fontWeight: '600' }}>{value.thumbnailUrl ? 'Change cover' : 'Choose a cover'}</Text>
    </Pressable>}
    {value && <Pressable accessibilityRole="button" onPress={() => onChange(null)}><Text style={{ color: colors.danger }}>Remove media</Text></Pressable>}
    {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
  </View>;
}
