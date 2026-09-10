import { useTheme } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export interface PickedMedia {
  uri?: string;
  label: string;
  kind: 'photo' | 'video';
  /** Cover frame. Defaults to the first frame of a video, or the photo itself. */
  thumbnailUrl?: string;
}
export interface MediaPickerProps { compact?: boolean; selection?: 'video' | 'photo' | 'all'; label?: string; value: PickedMedia | null; onChange: (next: PickedMedia | null) => void; }
export function MediaPicker({ value, onChange, compact, selection = 'all', label }: MediaPickerProps) {
  useTheme();
  const [error, setError] = useState('');
  const choose = async () => {
    try {
      setError('');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: selection === 'video' ? ['videos'] : selection === 'photo' ? ['images'] : ['images', 'videos'], quality: 0.85 });
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
      });
    } catch { setError('Unable to open your library. Please try again.'); }
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

  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? 'Choose a photo or video'} onPress={choose}
      style={{ padding: 20, gap: 8, borderRadius: 18, backgroundColor: colors.surface }}>
      {value?.kind === 'photo' && value.uri && <Image source={{ uri: value.uri }} style={{ height: 220, borderRadius: 12 }}/>}
      <Ionicons name={selection === 'video' ? 'videocam-outline' : 'images-outline'} size={30} color={colors.textMuted}/>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{value ? value.label : label ?? (compact ? 'Photo or video' : 'Select a photo or video')}</Text>
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
