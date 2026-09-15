import { useTheme } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ClipVideo } from '@/components/ClipVideo';
import { colors } from '@/theme';

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
  const asIs = {
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  };
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
  const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
  const order = selection !== 'photo' && full ? [true, false] : [false, true];
  const failures: string[] = [];
  for (const legacy of order) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy, ...asIs });
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
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → Expo Go → Photos.');
  throw new Error(failures.join(' / '));
}

export function MediaPicker({ value, onChange, compact, selection = 'all', label, bare = false, orientation = 'portrait' }: MediaPickerProps) {
  useTheme();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  /**
   * Opens the library. Apple's current picker needs no permission prompt and
   * is tried first; if it throws (it does on some phones and inside sheets),
   * the older picker is tried before giving up.
   */
  const open = async (): Promise<ImagePicker.ImagePickerResult> => {
    const kinds: ImagePicker.MediaType[] = selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'];
    // Hand the file over as it is. Letting iOS convert it first is what fails
    // (PHPhotosErrorDomain 3164) on large or iCloud-stored clips.
    const asIs = {
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    };
    // For video, Apple's older picker copies the file itself and has proved the
    // reliable one; it needs photo permission, so that is asked first.
    const wantsVideo = selection !== 'photo';
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    const full = !!perm?.granted && perm.accessPrivileges !== 'limited';
    const attempts: (() => Promise<ImagePicker.ImagePickerResult>)[] = wantsVideo && full
      ? [
          () => ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: true, ...asIs }),
          () => ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, ...asIs }),
        ]
      : [
          () => ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, ...asIs }),
          () => ImagePicker.launchImageLibraryAsync({ mediaTypes: kinds, quality: 0.85, legacy: true, ...asIs }),
        ];
    const failures: string[] = [];
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (perm && !perm.granted && !perm.canAskAgain) throw new Error('Photo access is off. Turn it on in Settings → Expo Go → Photos.');
    throw new Error(failures.join(' / '));
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
      const reason = err instanceof Error ? err.message : String(err);
      setError(/3164/.test(reason)
        ? 'iOS could not hand over that video. Try one recorded on this phone (not only in iCloud), or a photo.'
        : `Could not open your library: ${reason}`);
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
      <Pressable accessibilityRole="button" accessibilityLabel="Open a larger preview" onPress={() => setExpanded(true)}
        style={{ width: '100%', aspectRatio: orientation === 'landscape' ? 16 / 9 : 9 / 16, maxHeight: 560, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        {value.kind === 'video' && value.uri
          ? <View style={{ width: '100%', height: '100%' }}><ClipVideo uri={value.uri} poster={value.thumbnailUrl} active muted fit={orientation === 'landscape' ? 'contain' : 'cover'} /></View>
          : poster
            ? <Image source={{ uri: poster }} resizeMode="cover" style={{ width: '100%', height: '100%' }}/>
            : <Ionicons name="videocam" size={48} color="#6B7A6E"/>}
        <Text style={{ position: 'absolute', left: 12, bottom: 10, color: 'white', fontSize: 12, fontWeight: '600' }}>{describe(value)}</Text>
      </Pressable>
      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={() => setExpanded(false)}
          style={{ flex: 1, backgroundColor: 'rgba(6,12,10,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {poster ? <Image source={{ uri: poster }} resizeMode="contain" style={{ width: '100%', height: '80%', borderRadius: 12 }}/> : null}
          <Text style={{ color: 'white', paddingTop: 14 }}>Tap to close</Text>
        </Pressable>
      </Modal>
      {value.kind === 'video' && <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover image" onPress={chooseCover}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="image-outline" size={18} color={colors.info}/>
        <Text style={{ color: colors.info, fontWeight: '600' }}>{value.thumbnailUrl ? 'Change cover' : 'Choose a cover'}</Text>
      </Pressable>}
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

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
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
    {value?.kind === 'video' && <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover image" onPress={chooseCover}
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
