import { useTheme } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export interface PickedMedia { uri?: string; label: string; kind: 'photo' | 'video'; }
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
      onChange({ uri: asset.uri, label: asset.fileName ?? 'Selected media', kind: asset.type === 'video' ? 'video' : 'photo' });
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
    {value && <Pressable accessibilityRole="button" onPress={() => onChange(null)}><Text style={{ color: colors.danger }}>Remove media</Text></Pressable>}
    {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
  </View>;
}
